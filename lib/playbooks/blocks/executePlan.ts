// What a yes runs right away, what waits for a condition, what stays with a person, and the refusal hand-over (pure).

import type { BlockDefinition, CardAction, RunContext } from '@/lib/playbooks/types';

export type StepMode = 'now' | 'waits' | 'manual' | 'done';

export type PlannedStep = { actionId: string; mode: StepMode; reason: string };

export const MESSAGE_PARTY: Record<string, 'driver' | 'site' | 'customer'> = {
  ASK_DRIVER: 'driver',
  INSTRUCT_HOLD: 'driver',
  INSTRUCT_CHANGE: 'driver',
  DRIVER_MESSAGE: 'driver',
  ASK_SITE: 'site',
  CUSTOMER_MESSAGE: 'customer',
};

// A step that only makes sense once someone else has acted ("book the ferry once a new driver has accepted").
const CONDITION =
  /\b(?:once|after|when|as soon as)\b[^.;:]{0,90}?\b(?:accept(?:s|ed)?|confirm(?:s|ed)?|agree(?:s|d)?|repl(?:y|ies|ied)|answer(?:s|ed)?|approve(?:s|d)?|sign(?:s|ed)? up|take(?:s)? the job|is assigned)\b/i;
// Conditions the execute block itself satisfies (it books first, then sends), so they do not defer a step.
const SATISFIED_HERE =
  /\b(?:once|after|when)\b[^.;:]{0,40}?\b(?:booking|bookings|purchase|purchases|tickets?|reservations?)\b[^.;:]{0,20}\b(?:succeed(?:s|ed)?|go(?:es)? through|(?:is|are) (?:made|done|confirmed|booked))\b/i;
// A message meant for the driver who has not accepted yet (it would reach the current driver instead).
const TO_NEW_DRIVER =
  /\b(?:to|tell|inform|send|brief|message|text)\b(?: \w+){0,3}? (?:the )?(?:new|replacement|backup|incoming) driver\b/i;
// Plan changes for whoever ends up driving (the current driver may be replaced).
const DRIVER_PLAN_CLASSES = new Set([
  'BOOK_TRAVEL',
  'CANCEL_TRAVEL',
  'INSTRUCT_CHANGE',
  'DRIVER_MESSAGE',
]);
const DONE_BY_AGENT = new Set(['READ', 'ASK_PROVIDER']);
// Asking, holding and the offer itself are what a yes starts; they never wait for their own outcome.
const NEVER_WAITS = new Set(['ASK_DRIVER', 'ASK_SITE', 'INSTRUCT_HOLD', 'MARKET']);

/** The condition a step waits for, in the agent's own words, or null when it can run on a yes. */
export function pendingCondition(
  action: Pick<CardAction, 'description' | 'message'>
): string | null {
  const text = action.description ?? '';
  const match = text.match(CONDITION);
  if (!match || SATISFIED_HERE.test(match[0])) return null;
  return match[0].trim();
}

/** True when the option still needs a new driver to accept (a directed offer or a published offer). */
export function waitsForNewDriver(args: {
  actions: Pick<CardAction, 'actionClass'>[];
  changeType?: string | null;
}): boolean {
  const { actions, changeType } = args;
  return (
    changeType === 'REPLACE_DRIVER' || actions.some((action) => action.actionClass === 'MARKET')
  );
}

/** Per step: runs on a yes, waits for a condition (a person does it later), or is manual in Bahn's system. */
export function planExecution(args: {
  actions: CardAction[];
  changeType?: string | null;
  // Steps the runtime can simulate beyond bookings and messages (a directed offer, a roadside order).
  simulated?: (action: CardAction) => boolean;
}): PlannedStep[] {
  const { actions, changeType, simulated = () => false } = args;
  const newDriver = waitsForNewDriver({ actions, changeType });
  return actions.map((action) => {
    const base = { actionId: action.id };
    if (DONE_BY_AGENT.has(action.actionClass))
      return { ...base, mode: 'done', reason: 'Done by the agent already.' };
    const condition = NEVER_WAITS.has(action.actionClass) ? null : pendingCondition(action);
    if (condition)
      return {
        ...base,
        mode: 'waits',
        reason: `Waits: “${condition}”. Nothing does this on your yes; a person does it once that has happened.`,
      };
    const party = MESSAGE_PARTY[action.actionClass];
    const forNewDriver = party === 'driver' && TO_NEW_DRIVER.test(action.description ?? '');
    if (newDriver && (DRIVER_PLAN_CLASSES.has(action.actionClass) || forNewDriver))
      return {
        ...base,
        mode: 'waits',
        reason:
          'Waits for the new driver to accept. Nothing is booked, cancelled or sent to a driver on your yes; a person does it once someone has accepted.',
      };
    if (action.actionClass === 'BOOK_TRAVEL')
      return {
        ...base,
        mode: 'now',
        reason: 'Booked on your yes, after the provider re-checks the quote.',
      };
    if (action.actionClass === 'CANCEL_TRAVEL' && action.target)
      return {
        ...base,
        mode: 'now',
        reason: 'Cancelled on your yes, only after every booking of this option succeeded.',
      };
    if (simulated(action)) return { ...base, mode: 'now', reason: 'Done on your yes.' };
    if (party)
      return {
        ...base,
        mode: 'now',
        reason:
          party === 'customer'
            ? 'Sent to the customer on your yes, only if every booking before it succeeded.'
            : `Sent to the ${party} on your yes.`,
      };
    return {
      ...base,
      mode: 'manual',
      reason: "Not done by the agent: a person does it in Bahn's system.",
    };
  });
}

/** The execute block refused the decision (route to the hand-over instead of close). */
export function executeRefused(outputs: Record<string, unknown>): boolean {
  return Boolean((outputs.execute as { refused?: unknown } | undefined)?.refused);
}

export const REFUSED_BLOCK_ID = 'not_carried_out';

/** Terminal block after the execute block refused a decision; the runtime then opens the hand-over card. */
export function refusedStep(): BlockDefinition {
  return {
    id: REFUSED_BLOCK_ID,
    kind: 'deterministic',
    status: 'ESCALATED',
    title: 'Hand over: decision not carried out',
    description:
      'The approved option was blocked by a rule, or the edit could not be carried out as sent. Nothing is booked or sent; a person takes it from here.',
    next: [],
    run: async (ctx: RunContext) => ({
      outcome: `Not carried out: ${(ctx.outputs.execute as { refused?: string } | undefined)?.refused ?? 'refused'}`,
    }),
  };
}
