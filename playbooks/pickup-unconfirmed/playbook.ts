// Pickup not confirmed (monitor M2, research P4 detection): evidence, deadline-aware wait, re-check, ask, decide.

import { executeRefused, REFUSED_BLOCK_ID, refusedStep } from '@/lib/playbooks/blocks/executePlan';
import { gateStep } from '@/lib/playbooks/blocks/gate';
import { definePlaybook } from '@/lib/playbooks/interpreter';
import { optionsAnswerSchema } from '@/lib/playbooks/options';
import type { HumanBlockOutput } from '@/lib/playbooks/types';
import {
  type AskOutcome,
  askOutcomeSchema,
  buildCard,
  checkEvidence,
  close,
  closeNotDue,
  closeObserved,
  closeStated,
  escalate,
  nextCommitment,
  type PickupEvidence,
  waitCommitment,
} from '@/playbooks/pickup-unconfirmed/steps';
import { PICKUP_UNCONFIRMED_TEMPLATES } from '@/playbooks/pickup-unconfirmed/templates';

const decided = (outputs: Record<string, unknown>) => outputs.decide as HumanBlockOutput;
const evidence = (outputs: Record<string, unknown>, id: string) => outputs[id] as PickupEvidence;
const asked = (outputs: Record<string, unknown>) => outputs.ask as AskOutcome;

export const pickupUnconfirmedDefinition = definePlaybook({
  id: 'pickup-unconfirmed',
  title: 'Pickup not confirmed',
  summary:
    'The pickup slot has started or passed, but nothing shows the car was collected: no pickup scan, and neither the site nor the driver has said so. Most often the site simply forgot to confirm; sometimes something happened to the driver. The agent first gives them time to confirm, but only as much time as the order can afford: before waiting the usual two hours it checks the next hard deadline after the pickup (the end of the slot, the drive to a booked ferry, a paid train, the delivery window) and waits only until shortly before it. Then it checks again and asks the driver and the site. If the driver says the car is collected, the run closes without bothering anyone; if there is a problem or no answer, you get a card with options before the deadline.',
  triggers: ['PICKUP_NOT_CONFIRMED'],
  folder: 'playbooks/pickup-unconfirmed',
  params: {
    'wait_confirmation.defaultMinutes': {
      default: 120,
      description:
        'How long to wait for the site or driver to confirm when no deadline is close (sim minutes).',
    },
    'wait_confirmation.bufferMinutes': {
      default: 30,
      description:
        'Stop waiting this many minutes before the next hard deadline, to leave time to ask and decide.',
    },
    defaultRoadHoursToTerminal: {
      default: 2,
      description:
        'Drive time from the pickup to a booked ferry terminal when the records do not give one (hours).',
    },
    decisionMarginMinutes: {
      default: 0,
      description: 'The card stays open this long (sim minutes) after its decide-by time.',
    },
  },
  preconditions: [
    {
      id: 'order-open',
      description: 'The order is not delivered or cancelled',
      check: async (ctx) =>
        !ctx.order.order.cancelledAt &&
        !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(ctx.order.order.status),
    },
    {
      id: 'has-slot-and-driver',
      description: 'The order has a selected pickup slot and an assigned driver',
      check: async (ctx) =>
        ctx.order.timeWindows.some((w) => w.purpose === 'SELECTED_PICKUP_SLOT' && w.isSelected) &&
        ctx.order.assignments.some((a) => a.status !== 'CANCELLED'),
    },
  ],
  start: 'evidence',
  blocks: [
    {
      id: 'evidence',
      kind: 'deterministic',
      title: 'Look for proof of pickup',
      description:
        'Looks for a pickup scan since the slot started (proof the car left), and reads what the site and the driver said since then. Only a scan closes the case here; statements are read by the agent later.',
      run: checkEvidence,
      next: [
        {
          to: 'close_not_due',
          label: 'Slot has not started',
          when: (ctx) => !evidence(ctx.outputs, 'evidence').slotStarted,
        },
        {
          to: 'close_observed',
          label: 'Pickup scan on record',
          when: (ctx) => Boolean(evidence(ctx.outputs, 'evidence').pickedUp),
        },
        { to: 'next_commitment', label: 'No pickup scan' },
      ],
    },
    {
      id: 'next_commitment',
      kind: 'deterministic',
      title: 'Find the next deadline after pickup',
      description:
        'Before waiting, checks whether waiting is affordable: what must happen after the pickup and when. The end of the slot, the time the driver must leave to reach a booked ferry’s check-in, a paid train or flight, or the time the car must leave to reach the delivery window. The earliest one limits the wait.',
      run: nextCommitment,
      next: [{ to: 'wait_confirmation', label: 'Deadline known' }],
    },
    {
      id: 'wait_confirmation',
      kind: 'wait',
      title: 'Give the site and driver time to confirm',
      description:
        'Waits up to 2 hours (sim time) for the site or the driver to confirm on their own; usually the site just forgot. But never longer than the order can afford: if the next deadline is closer, it waits only until 30 minutes before it, or not at all, and asks right away. The reason (for example "waiting 60 min instead of 120: the driver must leave by 16:30 to reach the ferry check-in") is saved with the run.',
      wait: { defaultMinutes: 120, bufferMinutes: 30 },
      nextCommitment: waitCommitment,
      next: [{ to: 'recheck', label: 'Wait over' }],
    },
    {
      id: 'recheck',
      kind: 'deterministic',
      title: 'Look again',
      description: 'Looks for a pickup scan and new messages again after the wait.',
      run: checkEvidence,
      next: [
        {
          to: 'close_observed',
          label: 'Pickup scan arrived',
          when: (ctx) => Boolean(evidence(ctx.outputs, 'recheck').pickedUp),
        },
        { to: 'ask', label: 'Still no scan' },
      ],
    },
    {
      id: 'ask',
      kind: 'agent',
      title: 'Ask the driver and the site',
      description:
        'The agent asks the driver: did you collect the car, any problem? If the driver does not answer or reports a problem, it also asks the site whether the car is still there. It records a driver’s "yes, collected" as a statement, not as proof.',
      instructions: 'instructions/ask.md',
      tools: ['ask_driver', 'ask_site', 'list_facts', 'record_interpretation'],
      model: 'haiku',
      timeoutMs: 4 * 60_000,
      outputSchema: askOutcomeSchema,
      next: [
        {
          to: 'close_stated',
          label: 'Driver or site says collected',
          when: (ctx) => asked(ctx.outputs).outcome === 'COLLECTED',
        },
        { to: 'options', label: 'Problem or no answer' },
      ],
    },
    {
      id: 'options',
      kind: 'agent',
      title: 'Prepare what to do before the deadline',
      description:
        'The agent fills up to three of the options below that fit before the next deadline: keep waiting until a set time, have the site check and hold the car, or a directed offer to a backup driver. It writes the exact messages; the steps themselves are fixed.',
      instructions: 'instructions/options.md',
      tools: ['list_facts', 'find_backup_drivers', 'record_interpretation'],
      model: 'sonnet',
      timeoutMs: 8 * 60_000,
      maxBudgetUsd: 1,
      outputSchema: optionsAnswerSchema(PICKUP_UNCONFIRMED_TEMPLATES),
      templates: PICKUP_UNCONFIRMED_TEMPLATES,
      next: [{ to: 'check', label: 'Options proposed' }],
    },
    gateStep({
      id: 'check',
      title: 'Check the options against the rules',
      description:
        'The chain calculator works out each option’s effect on the promise; the gate blocks claiming the car is collected without a scan (G3), cancelling the current driver before a backup accepts (G7) and undrafted customer texts. Problems go back to the agent once.',
      optionsFrom: 'options',
      next: [{ to: 'decide', label: 'Options ready' }],
    }),
    {
      id: 'decide',
      kind: 'human',
      title: 'Dispatcher decides before the deadline',
      description:
        'A decision card with a countdown to the next deadline after pickup and the wait reasoning. Approve an option (rewording messages or skipping steps if needed), or reject with a note and a person takes over.',
      card: buildCard,
      next: [
        {
          to: 'execute',
          label: 'Approved, or approved with edits',
          when: (ctx) => Boolean(decided(ctx.outputs).option),
        },
        { to: 'escalate', label: 'Rejected or expired' },
      ],
    },
    {
      id: 'execute',
      kind: 'execute',
      title: 'Send the approved messages',
      description:
        'Runs the approved option: messages to the driver and the site, a directed offer to a backup (simulated), and the approved customer draft.',
      next: [
        {
          to: REFUSED_BLOCK_ID,
          label: 'Refused: a blocked option or an edit it cannot carry out',
          when: (ctx) => executeRefused(ctx.outputs),
        },
        { to: 'close', label: 'Done' },
      ],
    },
    {
      id: 'close',
      kind: 'deterministic',
      status: 'CLOSED',
      title: 'Close',
      description: 'Records what was sent.',
      run: close,
      next: [],
    },
    {
      id: 'close_not_due',
      kind: 'deterministic',
      status: 'CLOSED',
      title: 'Not due yet',
      description: 'The pickup slot has not started; there is nothing to confirm yet.',
      run: closeNotDue,
      next: [],
    },
    {
      id: 'close_observed',
      kind: 'deterministic',
      status: 'CLOSED',
      title: 'Pickup scanned',
      description: 'A pickup scan is on record: the car left. Nothing to do.',
      run: closeObserved,
      next: [],
    },
    {
      id: 'close_stated',
      kind: 'deterministic',
      status: 'CLOSED',
      title: 'Driver says collected',
      description:
        'The driver (or site) says the car was collected. That is a statement, not a scan: the run closes without a card, notes that the site’s confirmation is still pending, and the watchman keeps checking.',
      run: closeStated,
      next: [],
    },
    refusedStep(),
    {
      id: 'escalate',
      kind: 'deterministic',
      status: 'ESCALATED',
      title: 'Hand over',
      description:
        'You rejected the options or the decision window passed; a person takes it from here.',
      run: escalate,
      next: [],
    },
  ],
});
