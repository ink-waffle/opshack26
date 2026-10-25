// Reads a card's `options` json defensively (older cards may miss fields) into what the card shows.

import type { ItineraryLegStatus, ItineraryVerdict } from '@/lib/chain/itinerary/types';
import { ACTION_CLASSES, GUARDRAILS } from '@/lib/gate/actions';
import { planExecution, type StepMode } from '@/lib/playbooks/blocks/executePlan';
import { plainText } from '@/lib/text';

type Json = Record<string, unknown>;

export type OptionActionView = {
  id: string;
  actionClass: string;
  classLabel: string;
  description: string;
  message: string | null;
  quoteFactId: string | null;
  // CANCEL_TRAVEL: the booked leg it cancels.
  target: string | null;
  needsYes: boolean;
  // What a yes does with this step (the same plan the execute block follows).
  plan: { mode: StepMode; reason: string };
};

export type RuleView = { ruleId: string; title: string; message: string };

export type ItineraryLegView = {
  kind: string;
  description: string;
  status: ItineraryLegStatus;
  verdict: ItineraryVerdict;
  // Why the leg is not usable as booked; null when it is.
  problem: string | null;
  // The new leg that takes this one over, as described on the card.
  replacedBy: string | null;
};

// The whole remaining trip under an option (keep / new / cancel per leg).
export type ItineraryView = { feasible: boolean; legs: ItineraryLegView[]; violations: string[] };

export type OptionView = {
  id: string;
  label: string;
  detail: string | null;
  actions: OptionActionView[];
  factIds: string[];
  slackMs: number | null;
  promise: {
    window: string | null;
    verdict: string | null;
    eta: string | null;
    earlyHours: number | null;
  } | null;
  costLabel: string | null;
  whoMustAgree: string;
  gateOk: boolean;
  violations: RuleView[];
  warnings: RuleView[];
  blocked: RuleView | null;
  reversibility: string | null;
  recommended: boolean;
  driverNotes: string[];
  itinerary: ItineraryView | null;
};

export type OptionsView = {
  items: OptionView[];
  recommendation: { optionId: string; why: string } | null;
  agentWillNot: string[];
  notes: string[];
  // What the rules caught in the agent's first draft, in plain words.
  caught: string[];
};

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const YES_WORDS: Record<string, string> = {
  BOOK_TRAVEL: 'the bookings',
  CANCEL_TRAVEL: 'the cancellation',
  CUSTOMER_MESSAGE: 'the customer message',
  INSTRUCT_CHANGE: 'the new driver plan',
  CHANGE_WINDOW: 'the window change',
  CHANGE_ASSIGNMENT: 'the assignment change',
  MARKET: 'the driver offer',
  MONEY: 'the payment',
};

// Approver roles as the runtime writes them ("operator", "operator (money)", "owner (customer)").
const role = (approver: string) =>
  approver
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, '')
    .trim();
const YOU = new Set(['operator', 'dispatcher']);
const OWNER = new Set(['owner', 'car owner']);

function rule(value: unknown, now?: Date): RuleView | null {
  if (!isObject(value)) return null;
  const ruleId = str(value.ruleId) ?? '';
  const guardrail = (GUARDRAILS as Record<string, { title: string } | undefined>)[ruleId];
  return {
    ruleId,
    title: guardrail?.title ?? ruleId,
    message: plainText(str(value.message) ?? guardrail?.title ?? 'Blocked by a rule.', now),
  };
}

function classSpec(actionClass: string) {
  return (ACTION_CLASSES as Record<string, { label: string; authority: string } | undefined>)[
    actionClass
  ];
}

function parseAction(value: unknown, index: number, now?: Date): OptionActionView | null {
  if (!isObject(value)) return null;
  const actionClass = str(value.actionClass) ?? str(value.class) ?? 'READ';
  const spec = classSpec(actionClass);
  return {
    id: str(value.id) ?? `#${index + 1}`,
    actionClass,
    classLabel: spec?.label ?? plainText(actionClass),
    description: plainText(
      str(value.description) ?? str(value.summary) ?? spec?.label ?? actionClass,
      now
    ),
    message: str(value.message),
    quoteFactId: str(value.quoteFactId),
    target: str(value.target),
    needsYes: spec ? spec.authority !== 'AUTO' && spec.authority !== 'AUTO_NOTIFY' : true,
    plan: { mode: 'now', reason: '' },
  };
}

/** Attaches the execute plan to each step; a directed offer or roadside order with a cited fact is simulated. */
function withPlan(args: {
  actions: OptionActionView[];
  changeType: string | null;
  // Facts the runtime can act on (backup-driver and roadside results); unknown = assume it can.
  simulatedFactIds?: Set<string>;
}): OptionActionView[] {
  const { actions, changeType, simulatedFactIds } = args;
  const plan = planExecution({
    actions: actions.map((action) => ({
      id: action.id,
      actionClass: action.actionClass,
      description: action.description,
      message: action.message,
      quoteFactId: action.quoteFactId,
      target: action.target,
    })),
    changeType,
    simulated: (action) =>
      (action.actionClass === 'MARKET' || action.actionClass === 'MONEY') &&
      !!action.quoteFactId &&
      (!simulatedFactIds || simulatedFactIds.has(action.quoteFactId)),
  });
  return actions.map((action, i) => ({
    ...action,
    plan: { mode: plan[i].mode, reason: plainText(plan[i].reason) },
  }));
}

const LEG_STATUSES: ItineraryLegStatus[] = ['keep', 'new', 'cancel'];
const VERDICTS: ItineraryVerdict[] = ['ok', 'unreachable', 'missed', 'redundant', 'cancelled'];

/** The option's itinerary verdict, leg by leg; null on cards without one (older cards, other playbooks). */
export function parseItinerary(value: unknown, now?: Date): ItineraryView | null {
  if (!isObject(value) || !Array.isArray(value.legs)) return null;
  const legs = value.legs.filter(isObject);
  const describe = (leg: Json) => plainText(str(leg.description) ?? str(leg.kind) ?? 'leg', now);
  const byRef = (ref: string) => legs.find((leg) => leg.ref === ref || leg.factId === ref);
  return {
    feasible: value.feasible !== false,
    legs: legs.map((leg) => {
      const status = LEG_STATUSES.find((candidate) => candidate === leg.status) ?? 'keep';
      const verdict = VERDICTS.find((candidate) => candidate === leg.verdict) ?? 'ok';
      const reason = str(leg.reason);
      const replacement = str(leg.replacedBy);
      const replacedLeg = replacement ? byRef(replacement) : undefined;
      return {
        kind: str(leg.kind) ?? 'TRAVEL',
        description: describe(leg),
        status,
        verdict,
        problem:
          verdict === 'ok' || verdict === 'cancelled'
            ? null
            : plainText(reason ? `${verdict}: ${reason}` : verdict, now),
        replacedBy: replacedLeg
          ? describe(replacedLeg)
          : replacement && plainText(replacement, now),
      };
    }),
    violations: [...new Set(strings(value.violations).map((text) => plainText(text, now)))],
  };
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function listWords(items: string[]): string {
  return items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** "Needs your yes for the bookings" · "Needs your yes · the owner must agree to the message". */
export function whoMustAgree(args: { approvers: string[]; actions: OptionActionView[] }): string {
  const { approvers, actions } = args;
  const classes = new Set(actions.filter((a) => a.needsYes).map((a) => a.actionClass));
  const roles = new Set(approvers.map(role));
  const money = classes.has('MONEY') || approvers.some((a) => /\(money\)/i.test(a));
  const owner = [...roles].some((r) => OWNER.has(r));
  const customer = roles.has('customer');
  const chief =
    roles.has('chief') || roles.has('chief_dispatcher') || roles.has('chief dispatcher');
  const you = classes.size > 0 || [...roles].some((r) => YOU.has(r)) || money;
  if (!you && !owner && !customer && !chief) return 'No approval needed';
  const yes = chief ? 'Needs the chief dispatcher’s yes' : you ? 'Needs your yes' : null;
  if (owner || customer) {
    const who = owner ? 'the owner' : 'the customer';
    const possessive = owner ? 'the owner’s' : 'the customer’s';
    if (money)
      return yes
        ? `${yes} and ${possessive} agreement to pay`
        : `${sentence(who)} must agree to pay`;
    const what = classes.has('CUSTOMER_MESSAGE') ? ' to the message' : '';
    return yes ? `${yes} · ${who} must agree${what}` : `${sentence(who)} must agree${what}`;
  }
  const what = listWords([...classes].map((c) => YES_WORDS[c]).filter((w): w is string => !!w));
  return what ? `${yes} for ${what}` : (yes ?? 'No approval needed');
}

function parseOption(
  value: unknown,
  recommendedId: string | null,
  simulatedFactIds?: Set<string>,
  now?: Date
): OptionView | null {
  if (!isObject(value)) return null;
  const id = str(value.id) ?? '?';
  const change = isObject(value.change) ? value.change : null;
  const plain = (text: string | null) => (text === null ? null : plainText(text, now));
  const actions = withPlan({
    actions: (Array.isArray(value.actions) ? value.actions : [])
      .map((action, index) => parseAction(action, index, now))
      .filter((action): action is OptionActionView => action !== null),
    changeType: str(change?.type),
    simulatedFactIds,
  });
  const chain = isObject(value.chain) ? value.chain : null;
  const promise = chain && isObject(chain.promise) ? chain.promise : null;
  const slackMinutes = num(value.slackMinutes);
  const slackHours = promise ? num(promise.slackHours) : null;
  const gate = isObject(value.gate) ? value.gate : null;
  const driverChain = chain && isObject(chain.driverChain) ? chain.driverChain : null;
  const flags = driverChain && isObject(driverChain.flags) ? driverChain.flags : null;
  const driverNotes = [
    ...(flags?.next_duty_at_risk ? ["The driver's next duty is at risk."] : []),
    ...(flags?.positioning_record_mismatch ? ['Positioning records do not match the plan.'] : []),
  ];
  return {
    id,
    label: plain(str(value.label)) ?? `Option ${id}`,
    detail: plain(str(value.detail)),
    actions,
    factIds: strings(value.factIds),
    slackMs:
      slackMinutes !== null
        ? slackMinutes * 60_000
        : slackHours !== null
          ? slackHours * 3_600_000
          : null,
    promise: promise
      ? {
          window: str(promise.local),
          verdict: str(promise.verdict),
          eta: str(promise.etaLocal),
          earlyHours: num(promise.earlyHours),
        }
      : null,
    costLabel: plain(str(value.costLabel)),
    whoMustAgree: whoMustAgree({ approvers: strings(value.approvers), actions }),
    gateOk: gate ? gate.ok !== false : true,
    violations: (Array.isArray(gate?.violations) ? gate.violations : [])
      .map((item) => rule(item, now))
      .filter((r): r is RuleView => r !== null),
    warnings: (Array.isArray(gate?.warnings) ? gate.warnings : [])
      .map((item) => rule(item, now))
      .filter((r): r is RuleView => r !== null),
    blocked: rule(value.blocked, now),
    reversibility: plain(str(value.reversibility)),
    recommended: value.recommended === true || (recommendedId !== null && id === recommendedId),
    driverNotes,
    itinerary: parseItinerary(value.itinerary, now),
  };
}

export function parseOptions(
  json: unknown,
  context: { simulatedFactIds?: Set<string>; now?: Date } = {}
): OptionsView {
  const { simulatedFactIds, now } = context;
  const plainAll = (list: string[]) => [...new Set(list.map((text) => plainText(text, now)))];
  const payload = isObject(json) ? json : Array.isArray(json) ? { items: json } : {};
  const recommendation = isObject(payload.recommendation)
    ? {
        optionId: str(payload.recommendation.optionId) ?? '',
        why: plainText(str(payload.recommendation.why) ?? '', now),
      }
    : null;
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .map((item) => parseOption(item, recommendation?.optionId ?? null, simulatedFactIds, now))
    .filter((item): item is OptionView => item !== null)
    .slice(0, 3);
  return {
    items,
    recommendation: recommendation?.optionId ? recommendation : null,
    agentWillNot: plainAll(strings(payload.agentWillNot)),
    notes: plainAll(strings(payload.notes)),
    caught: plainAll(strings(payload.caught)),
  };
}

/** The option a person can approve right now (not blocked by the gate). */
export function isApprovable(option: OptionView): boolean {
  return !option.blocked && option.gateOk && option.violations.length === 0;
}
