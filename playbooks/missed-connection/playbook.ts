// Any lost travel leg (research P1, widened): baseline the whole trip, reconcile, rebook the rest, gate, decide, execute.

import { z } from 'zod';

import { executeRefused, REFUSED_BLOCK_ID, refusedStep } from '@/lib/playbooks/blocks/executePlan';
import { gateStep } from '@/lib/playbooks/blocks/gate';
import { definePlaybook } from '@/lib/playbooks/interpreter';
import type { HumanBlockOutput } from '@/lib/playbooks/types';
import {
  buildCard,
  close,
  connectionOptionsSchema,
  driverStart,
  escalate,
  gather,
  type GatherOutput,
} from '@/playbooks/missed-connection/steps';
import { MISSED_CONNECTION_TEMPLATES } from '@/playbooks/missed-connection/templates';

const gathered = (outputs: Record<string, unknown>) => outputs.gather as GatherOutput;
const decided = (outputs: Record<string, unknown>) => outputs.decide as HumanBlockOutput;

export const missedConnectionDefinition = definePlaybook({
  id: 'missed-connection',
  title: 'Missed connection',
  summary:
    'A leg of the driver’s trip is lost: the sailing is sold out or missed, a booking attempt failed, or a booked train, flight, bus or hotel can no longer be used. Code checks the whole remaining trip and lists every booked leg that is now broken or redundant. The agent first checks with the provider whether an earlier attempt created a booking, then rebooks the rest of the trip (new bookings, cancellations of what the new plan no longer uses, the driver’s nights and the car’s custody) and asks you to approve it. The gate blocks any option that leaves a booked leg broken.',
  triggers: ['CROSSING_CAPACITY', 'TRAVEL_LEG_LOST'],
  folder: 'playbooks/missed-connection',
  params: {
    maxOptions: { default: 3, description: 'Most options shown on the card.' },
    quoteBlockMinutes: {
      default: 90,
      description: 'A quote older than this cannot be booked (G5).',
    },
    quoteWarnMinutes: { default: 60, description: 'A quote older than this shows a warning (G5).' },
    earlyCustodyHours: {
      default: 12,
      description:
        'Arriving this many hours before the delivery window means the car needs custody.',
    },
    decisionMarginMinutes: {
      default: 0,
      description: 'The card stays open this long (sim minutes) after its decide-by time.',
    },
  },
  preconditions: [
    {
      id: 'has-travel',
      description: 'The order’s route includes a ferry crossing or the driver has booked travel',
      check: async (ctx) =>
        ctx.order.travelOptions.some((option) => option.kind === 'FERRY') ||
        ctx.order.travelReservations.some((reservation) => !reservation.cancelledAt),
    },
    {
      id: 'order-open',
      description: 'The order is not delivered or cancelled',
      check: async (ctx) =>
        !ctx.order.order.cancelledAt &&
        !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(ctx.order.order.status),
    },
  ],
  start: 'gather',
  blocks: [
    {
      id: 'gather',
      kind: 'deterministic',
      title: 'Check the whole remaining trip',
      description:
        'Runs the trip check on the records alone: where the driver is, every booked leg from positioning to the return home with its verdict, and the list of booked legs now broken or redundant that every option must replace or cancel. Also reads ferry quotes and sold-out checks, booking attempts whose outcome is unknown, the pickup slot, the delivery promise and the driver.',
      run: gather,
      next: [
        {
          to: 'close',
          label: 'A ferry is booked, the trip works out and nobody reports a problem',
          when: (ctx) => gathered(ctx.outputs).nothingToDo,
        },
        {
          to: 'reconcile',
          label: 'An earlier booking attempt has an unknown outcome',
          when: (ctx) => gathered(ctx.outputs).needsReconcile,
        },
        { to: 'find_options', label: 'Otherwise' },
      ],
    },
    {
      id: 'reconcile',
      kind: 'agent',
      title: 'Ask the provider about the failed attempt',
      description:
        'Before anything can be bought, the agent asks the provider whether the earlier timed-out request created a booking. Buying again without this answer could double-book (rule G9).',
      instructions: 'instructions/reconcile.md',
      tools: ['ask_provider', 'list_facts'],
      model: 'haiku',
      timeoutMs: 4 * 60_000,
      outputSchema: z.object({
        attempts: z.array(
          z.object({
            proposalId: z.string().nullable(),
            outcome: z.enum(['NO_BOOKING', 'BOOKING_EXISTS', 'PENDING', 'NOT_FOUND']),
            factId: z.string().nullable(),
            bookingReference: z.string().nullable(),
          })
        ),
        lockReleased: z.boolean(),
        summary: z.string(),
      }),
      next: [{ to: 'find_options', label: 'Answer recorded' }],
    },
    {
      id: 'find_options',
      kind: 'agent',
      title: 'Rebook the rest of the trip',
      description:
        'The agent finds where the driver is, searches fresh trains, sailings and hotels from there to the end of the job, checks with the driver about overnight stops and keeping the car, and fills up to three of the options below. Every booked leg the trip check lists as broken or redundant must be replaced or cancelled in each option.',
      instructions: 'instructions/find-options.md',
      tools: [
        'get_order_context',
        'list_facts',
        'search_ferries',
        'search_hotels',
        'search_trains',
        'ask_driver',
        'record_interpretation',
      ],
      model: 'sonnet',
      timeoutMs: 12 * 60_000,
      maxBudgetUsd: 2,
      outputSchema: connectionOptionsSchema,
      templates: MISSED_CONNECTION_TEMPLATES,
      next: [{ to: 'check', label: 'Options proposed' }],
    },
    gateStep({
      id: 'check',
      title: 'Check options against the rules',
      description:
        'For every option the chain calculator works out the promise slack, bookings and cost; the trip check re-runs the whole remaining trip with the option’s bookings and cancellations; and the gate checks the guardrails (no booked leg left broken, cancel only what is broken or replaced, fresh quotes, no purchase before reconciliation, cited facts exist, exact message texts). Problems go back to the agent once; whatever still fails is shown as blocked.',
      optionsFrom: 'find_options',
      itinerary: { start: driverStart },
      next: [{ to: 'decide', label: 'Options ready' }],
    }),
    {
      id: 'decide',
      kind: 'human',
      title: 'Dispatcher decides',
      description:
        'A decision card with what happened, what the agent already did, the options with promise slack and cost, and a decide-by time. Approve an option (rewording messages or skipping steps if needed), or reject with a note and a person takes over.',
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
      title: 'Book, cancel and inform',
      description:
        'Runs the approved option: re-checks each quote with the provider right before booking (rule G8) and records the bookings; only when every booking succeeded, cancels the legs the new plan no longer uses; then sends the driver the plan with the references. Customer texts are sent only because the dispatcher approved them.',
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
      description: 'Records what was booked, cancelled and sent.',
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
        'The dispatcher rejected the options or the decision window passed; a person takes it from here.',
      run: escalate,
      next: [],
    },
  ],
});
