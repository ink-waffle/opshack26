// Driver cannot make the pickup (research P4): ask for a yes/no before the first paid leg, prepare backups, decide.

import { executeRefused, REFUSED_BLOCK_ID, refusedStep } from '@/lib/playbooks/blocks/executePlan';
import { gateStep } from '@/lib/playbooks/blocks/gate';
import { definePlaybook } from '@/lib/playbooks/interpreter';
import { optionsAnswerSchema } from '@/lib/playbooks/options';
import type { HumanBlockOutput } from '@/lib/playbooks/types';
import {
  type AskAnswer,
  askAnswerSchema,
  buildCard,
  close,
  closeConfirmed,
  escalate,
  findBackups,
  gather,
} from '@/playbooks/driver-unavailable/steps';
import { DRIVER_UNAVAILABLE_TEMPLATES } from '@/playbooks/driver-unavailable/templates';

const decided = (outputs: Record<string, unknown>) => outputs.decide as HumanBlockOutput;
const asked = (outputs: Record<string, unknown>) => outputs.ask_driver as AskAnswer;

export const driverUnavailableDefinition = definePlaybook({
  id: 'driver-unavailable',
  title: 'Driver may not make the pickup',
  summary:
    'The assigned driver may not be able to do the pickup: they are unwell, need rest, cannot get there or have not confirmed. The decision has a hard clock: the first paid travel leg (a train or flight Bahn already paid for). The agent asks the driver for a clear yes or no before that time, looks for free backup drivers near the pickup and checks whether a later pickup slot still keeps the delivery promise. You then choose: keep the driver, send a directed offer to a backup (the current driver stays assigned until the backup accepts), or move the pickup to later in the day.',
  triggers: ['DRIVER_CANNOT_MAKE_PICKUP'],
  folder: 'playbooks/driver-unavailable',
  params: {
    answerBufferMinutes: {
      default: 15,
      description:
        'The driver is asked to answer this many minutes before the first paid departure, so there is time to act.',
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
      id: 'not-started',
      description: 'A driver is assigned and has not started the job',
      check: async (ctx) =>
        ctx.order.assignments.some(
          (assignment) => assignment.status === 'ASSIGNED' && !assignment.startedAt
        ),
    },
  ],
  start: 'gather',
  blocks: [
    {
      id: 'gather',
      kind: 'deterministic',
      title: 'Find the hard clock',
      description:
        'Reads the assignment, the pickup slot, what the driver already said, and the travel Bahn has already paid for. The first paid departure is the decide-by time (after it, money is spent and the driver is on the way). The driver is asked to answer a little before that.',
      run: gather,
      next: [{ to: 'ask_driver', label: 'Clock found' }],
    },
    {
      id: 'ask_driver',
      kind: 'agent',
      title: 'Ask the driver for a yes or no',
      description:
        'The agent writes to the driver once: can you do the pickup, yes or no, by a set time before the first paid leg leaves. It does not cancel anything, does not pressure them and gives no health advice.',
      instructions: 'instructions/ask-driver.md',
      tools: ['ask_driver', 'list_facts'],
      model: 'haiku',
      timeoutMs: 4 * 60_000,
      outputSchema: askAnswerSchema,
      next: [
        {
          to: 'close_confirmed',
          label: 'Driver clearly says yes',
          when: (ctx) => asked(ctx.outputs).answer === 'YES',
        },
        { to: 'backups', label: 'No, unsure or no answer' },
      ],
    },
    {
      id: 'close_confirmed',
      kind: 'deterministic',
      status: 'CLOSED',
      title: 'Keep the plan',
      description:
        'The driver confirmed they can do it. Nothing changes and nobody needs to decide; the confirmation is kept as the driver’s statement.',
      run: closeConfirmed,
      next: [],
    },
    {
      id: 'backups',
      kind: 'deterministic',
      title: 'Look for backups and a later slot',
      description:
        'Searches the driver pool for free drivers near the pickup (nobody is asked yet), and checks whether moving the pickup to the afternoon of the same day still keeps the delivery promise. Both go through the chain calculator, which also shows how much paid travel would be at risk.',
      run: findBackups,
      next: [{ to: 'options', label: 'Candidates found' }],
    },
    {
      id: 'options',
      kind: 'agent',
      title: 'Prepare keep, backup or later slot',
      description:
        'The agent fills up to three of the options below: keep the driver if they confirm in time; a directed offer to the best backup (the current driver stays assigned until the backup accepts); or ask the customer to move the pickup to the afternoon. It writes the exact messages; the steps themselves are fixed.',
      instructions: 'instructions/options.md',
      tools: ['list_facts', 'find_backup_drivers', 'record_interpretation'],
      model: 'sonnet',
      timeoutMs: 8 * 60_000,
      maxBudgetUsd: 1,
      outputSchema: optionsAnswerSchema(DRIVER_UNAVAILABLE_TEMPLATES),
      templates: DRIVER_UNAVAILABLE_TEMPLATES,
      next: [{ to: 'check', label: 'Options proposed' }],
    },
    gateStep({
      id: 'check',
      title: 'Check the options against the rules',
      description:
        'The chain calculator works out each option’s effect on the promise and the paid travel; the gate blocks cancelling the current driver or travel before a backup has accepted (G7), describing a backup as booked (G3), and customer texts that are not drafts. Problems go back to the agent once.',
      optionsFrom: 'options',
      next: [{ to: 'decide', label: 'Options ready' }],
    }),
    {
      id: 'decide',
      kind: 'human',
      title: 'Dispatcher decides before the paid leg',
      description:
        'A decision card with a countdown to the first paid departure. Approve keep, backup offer or later slot (rewording messages or skipping steps if needed), or reject with a note and a person takes over.',
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
      title: 'Send the offer and messages',
      description:
        'Runs the approved option: sends the directed offer to the backup (simulated), the messages to the driver and the approved customer draft. Reassigning or cancelling travel stays with a person in Bahn’s system after the backup accepts.',
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
