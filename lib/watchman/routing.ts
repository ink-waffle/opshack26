import { TRIGGER_TYPES, type TriggerType } from '@/lib/watchman/taxonomy';

// Convention: a playbook's Trigger.dev task id equals its playbook id.
export const PLAYBOOK_IDS = {
  missedConnection: 'missed-connection',
  vehicleWarning: 'vehicle-warning',
  pickupUnconfirmed: 'pickup-unconfirmed',
  driverUnavailable: 'driver-unavailable',
  escapeHatch: 'escape-hatch',
} as const;

export type SignalSource = 'message' | 'record' | 'monitor';

export type TriggerRoute = {
  // Playbook task id, or null: no playbook yet (messages fall back to the escape hatch, the rest are recorded).
  playbookId: string | null;
  // Minimum P(trigger) to count as a label and, with a playbook, to dispatch it.
  threshold: number;
};

export type RoutingParams = {
  triggers: Record<TriggerType, TriggerRoute>;
  // Minimum P(needs_attention) for an unrouted signal to open a TRIAGE card.
  needsAttentionThreshold: number;
  // Signal sources allowed to open a TRIAGE card (monitors never page a person).
  triageSources: SignalSource[];
  // A dispatched (order, playbook) without a playbook_runs row yet counts as active for this long (real minutes).
  dispatchDedupeMinutes: number;
};

const NO_PLAYBOOK: TriggerRoute = { playbookId: null, threshold: 0.7 };

// Tunable in one place (meta-system); thresholds chosen from research/eval/watchman-eval.md.
export const ROUTING_PARAMS: RoutingParams = {
  triggers: {
    ...(Object.fromEntries(TRIGGER_TYPES.map((type) => [type, NO_PLAYBOOK])) as Record<
      TriggerType,
      TriggerRoute
    >),
    CROSSING_CAPACITY: { playbookId: PLAYBOOK_IDS.missedConnection, threshold: 0.7 },
    TRAVEL_LEG_LOST: { playbookId: PLAYBOOK_IDS.missedConnection, threshold: 0.7 },
    VEHICLE_WARNING: { playbookId: PLAYBOOK_IDS.vehicleWarning, threshold: 0.7 },
    PICKUP_NOT_CONFIRMED: { playbookId: PLAYBOOK_IDS.pickupUnconfirmed, threshold: 0.8 },
    DRIVER_CANNOT_MAKE_PICKUP: { playbookId: PLAYBOOK_IDS.driverUnavailable, threshold: 0.7 },
  },
  // 0.8 (was 0.7): the highest value that keeps recall on operator-acted messages ≥ 80 % (eval: 85.7 %, 0.85 → 75 %).
  needsAttentionThreshold: 0.8,
  triageSources: ['message'],
  dispatchDedupeMinutes: 30,
};

export type TriggerScore = { type: TriggerType; p: number };

export type PlaybookMatch = { playbookId: string; triggerType: TriggerType; p: number };

// On a delivered or cancelled order only these still need a person from a message (damage, money, proof, cancel).
export const AFTER_DELIVERY_TRIGGERS: TriggerType[] = [
  'CONDITION_CLAIM',
  'MONEY_QUERY',
  'EVIDENCE_DEFECT',
  'CANCELLATION',
];

const ACKNOWLEDGEMENT =
  /^\s*(?:ok(?:ay)?|okey|thanks?(?: you)?(?: very much| a lot)?|thank you|noted|got it|will do|sure|perfect|great|understood|received|alright|all good|fine|kiitos|danke|merci|tack|👍)(?:[\s,!.]+(?:thanks?|thank you|will do|noted|see you|bye|cheers|got it)?)*[\s!.👍]*$/iu;

/** A plain acknowledgement ("Ok, thanks!") that asks for nothing. */
export function isAcknowledgement(text: string | null | undefined): boolean {
  return !!text && text.length <= 60 && ACKNOWLEDGEMENT.test(text);
}

// What the item and the order say, beyond Jev's answers, for the triage fallback.
export type TriageContext = {
  orderClosed?: boolean;
  acknowledgement?: boolean;
};

export type RoutingDecision = {
  action: 'playbook' | 'triage' | 'record';
  // Every distinct playbook whose trigger cleared its threshold, best first.
  playbooks: PlaybookMatch[];
  // Primary trigger for the signal row: the best routed trigger, else the best label overall.
  triggerType: TriggerType | null;
  probability: number | null;
  // Triggers at or above their own threshold, best first.
  labels: TriggerScore[];
  needsAttention: number | null;
  reason: string;
};

/** Pure routing: trigger probabilities (+ needs_attention) → playbooks, a triage card, or record only. */
export function decideRoute(args: {
  source: SignalSource;
  triggers: TriggerScore[];
  needsAttention: number | null;
  params?: RoutingParams;
  context?: TriageContext;
}): RoutingDecision {
  const { source, triggers, needsAttention, params = ROUTING_PARAMS, context = {} } = args;
  const sorted = [...triggers].sort((a, b) => b.p - a.p);
  const labels = sorted.filter((score) => score.p >= params.triggers[score.type].threshold);

  const playbooks: PlaybookMatch[] = [];
  for (const score of labels) {
    const { playbookId } = params.triggers[score.type];
    if (playbookId && !playbooks.some((match) => match.playbookId === playbookId))
      playbooks.push({ playbookId, triggerType: score.type, p: score.p });
  }
  const top = playbooks[0]
    ? { type: playbooks[0].triggerType, p: playbooks[0].p }
    : (labels[0] ?? sorted[0] ?? null);
  const base = {
    playbooks,
    triggerType: top?.type ?? null,
    probability: top?.p ?? null,
    labels,
    needsAttention,
  };

  if (playbooks.length > 0)
    return {
      ...base,
      action: 'playbook',
      reason: playbooks
        .map((m) => `${m.triggerType} p=${m.p.toFixed(2)} → ${m.playbookId}`)
        .join('; '),
    };
  const quiet = triageQuietReason({ labels, top: sorted[0] ?? null, context });
  if (
    params.triageSources.includes(source) &&
    needsAttention !== null &&
    needsAttention >= params.needsAttentionThreshold &&
    quiet
  )
    return { ...base, action: 'record', reason: `no card: ${quiet}` };
  if (
    params.triageSources.includes(source) &&
    needsAttention !== null &&
    needsAttention >= params.needsAttentionThreshold
  )
    return {
      ...base,
      action: 'triage',
      reason: `no playbook covers ${labels.map((l) => l.type).join(', ') || 'this item'}; needs_attention p=${needsAttention.toFixed(2)} ≥ ${params.needsAttentionThreshold}`,
    };
  return {
    ...base,
    action: 'record',
    reason:
      needsAttention === null
        ? 'monitor hit without a playbook: signal only'
        : `no playbook matched; needs_attention p=${needsAttention.toFixed(2)} < ${params.needsAttentionThreshold}`,
  };
}

/** Why an unrouted item that Jev flagged still opens no card (null = open one). */
function triageQuietReason(args: {
  labels: TriggerScore[];
  top: TriggerScore | null;
  context: TriageContext;
}): string | null {
  const { labels, top, context } = args;
  const real = labels.filter((label) => label.type !== 'ROUTINE');
  if (context.acknowledgement) return 'a plain acknowledgement';
  if (top?.type === 'ROUTINE' && !real.length) return 'routine, nothing to do';
  if (context.orderClosed && !real.some((label) => AFTER_DELIVERY_TRIGGERS.includes(label.type)))
    return 'the order is delivered or cancelled and the message raises no damage, money, proof or cancellation question';
  return null;
}
