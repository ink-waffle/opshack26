// Vehicle warning, breakdown or accident (research P5): safety first, gather, roadside/tow options, the owner decides.

import { executeRefused, REFUSED_BLOCK_ID, refusedStep } from '@/lib/playbooks/blocks/executePlan';
import { gateStep } from '@/lib/playbooks/blocks/gate';
import { definePlaybook } from '@/lib/playbooks/interpreter';
import type { HumanBlockOutput } from '@/lib/playbooks/types';
import {
  buildCard,
  close,
  escalate,
  gather,
  safetyEscalation,
  type SafetyOutput,
  safetySchema,
  vehicleOptionsSchema,
} from '@/playbooks/vehicle-warning/steps';
import { VEHICLE_TEMPLATES } from '@/playbooks/vehicle-warning/templates';

const decided = (outputs: Record<string, unknown>) => outputs.decide as HumanBlockOutput;
const safety = (outputs: Record<string, unknown>) => outputs.safety as SafetyOutput;

export const vehicleWarningDefinition = definePlaybook({
  id: 'vehicle-warning',
  title: 'Warning light, breakdown or accident',
  summary:
    'A driver reports a warning light, a fault or an accident while moving a car. The agent first makes sure the driver is safe and tells them to keep the car stopped, asks where exactly they are and for a photo of the warning. It then looks up the car, its owner, the delivery promise and the driver’s next job, finds roadside and tow help near the reported place, and brings you one decision: call the owner, let them choose their own roadside service, a tow, or waiting, and expect a late delivery. The agent never gives mechanical or driving advice and never tells the customer a new date.',
  triggers: ['VEHICLE_WARNING'],
  folder: 'playbooks/vehicle-warning',
  params: {
    quoteBlockMinutes: {
      default: 90,
      description: 'A roadside quote older than this is not presented as available (G5).',
    },
    quoteWarnMinutes: { default: 60, description: 'A quote older than this shows a warning (G5).' },
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
      id: 'car-with-driver',
      description: 'A driver has the car (assignment in progress)',
      check: async (ctx) =>
        ctx.order.assignments.some((assignment) => assignment.status === 'IN_PROGRESS'),
    },
  ],
  start: 'safety',
  blocks: [
    {
      id: 'safety',
      kind: 'agent',
      title: 'Make sure the driver is safe',
      description:
        'Before anything else the agent writes to the driver: are you safe, where exactly are you (service area or pin), is the engine off, can you send a photo of the warning. The same message tells them to keep the car stopped; that hold is allowed without approval because it only preserves safety. No mechanical advice: the tool refuses to send a message that contains any (rule G4).',
      instructions: 'instructions/safety.md',
      tools: ['ask_driver', 'list_facts'],
      model: 'haiku',
      timeoutMs: 4 * 60_000,
      outputSchema: safetySchema,
      next: [
        {
          to: 'safety_escalation',
          label: 'Driver says they are not safe',
          when: (ctx) => safety(ctx.outputs).driverSafe === 'NO',
        },
        { to: 'gather', label: 'Driver safe, or no answer yet' },
      ],
    },
    {
      id: 'safety_escalation',
      kind: 'deterministic',
      status: 'ESCALATED',
      title: 'Hand the driver’s safety to a person',
      description:
        'The driver says they are not safe. The agent stops planning and opens an urgent card: call the driver now. Recovery can wait; safety cannot.',
      run: safetyEscalation,
      next: [],
    },
    {
      id: 'gather',
      kind: 'deterministic',
      title: 'Look up the car, owner and promise',
      description:
        'Reads the records: make, model and VIN, who owns the car (the customer), the delivery window, when the car stopped, the last app estimate (which predates the stop), the driver’s next job, and the decide-by time (before the delivery window opens, or before it closes).',
      run: gather,
      next: [{ to: 'options', label: 'Facts collected' }],
    },
    {
      id: 'options',
      kind: 'agent',
      title: 'Prepare the owner’s choices',
      description:
        'The agent finds roadside assistance and tow candidates near the reported place (nothing is booked) and fills up to three of the owner’s choices below: their own roadside service, a tow ordered by Bahn, or waiting for their instruction. It writes the exact message to the driver and a draft for the owner, plus short notes for the phone call; the steps themselves are fixed. Customer texts are drafts; no new delivery date is promised.',
      instructions: 'instructions/options.md',
      tools: ['find_roadside', 'list_facts', 'record_interpretation'],
      model: 'sonnet',
      timeoutMs: 8 * 60_000,
      maxBudgetUsd: 1,
      outputSchema: vehicleOptionsSchema,
      templates: VEHICLE_TEMPLATES,
      next: [{ to: 'check', label: 'Options proposed' }],
    },
    gateStep({
      id: 'check',
      title: 'Check the options against the rules',
      description:
        'The gate reads every message for mechanical or driving advice (always on in this playbook), blame, and claims the records do not support; it also checks that every cited fact exists and that customer texts are drafts. Problems go back to the agent once; what still fails is shown as blocked.',
      optionsFrom: 'options',
      context: { vehicleWarning: true },
      next: [{ to: 'decide', label: 'Options ready' }],
    }),
    {
      id: 'decide',
      kind: 'human',
      title: 'Call the owner and choose',
      description:
        'One card: the car is stopped and the driver is safe, so call the owner and ask: their own roadside service, a tow, or wait. Expect a late delivery. Approve the option the owner chose (rewording the texts if needed), or reject with a note and a person takes over.',
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
      title: 'Tell the driver, send the approved texts',
      description:
        'Runs the chosen option: tells the driver who is coming and to wait with the car, sends the owner the approved message, and records a tow order as a simulated booking. Nothing is sent to the owner unless you approved it.',
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
      description: 'Records what was sent and ordered.',
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
