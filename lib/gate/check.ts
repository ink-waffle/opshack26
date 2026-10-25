// Deterministic gate over an agent proposal: G1–G7, G9, G11 plus the authority table. Pure (G12 is the gate step's).

import {
  atLeast,
  CLAIM_KINDS,
  type ClaimKind,
  type EvidenceLevel,
  type EvidenceRequirement,
  isClaimKind,
} from '@/lib/evidence/ladder';
import { describeClaimRequirement } from '@/lib/evidence/render';
import { formatLocal, minutesBetween } from '@/lib/evidence/time';
import { bahnRecordId, type FactLike, factValue } from '@/lib/facts/types';
import {
  ACTION_CLASSES,
  type ActionClass,
  type Authority,
  type GuardrailId,
} from '@/lib/gate/actions';
import {
  findPhrases,
  FORBIDDEN_LABEL,
  type ForbiddenKind,
  LIABILITY_FIELDS,
  LIABILITY_PATTERNS,
  MECHANICAL_ADVICE_PATTERNS,
  MECHANICAL_FIELDS,
  NEUTRAL_ATTRIBUTION,
  ORDER_REFERENCE,
  OTHER_CUSTOMER_FIELDS,
  OTHER_CUSTOMER_PATTERNS,
  PAYLOAD_CLAIM_FIELDS,
  payloadLiability,
  payloadMechanical,
  payloadStateClaims,
  RECORD_TEXT_CLAIM_PATTERNS,
  recordTexts,
  SUBSTITUTE_FIELDS,
  SUBSTITUTE_PATTERNS,
  TEXT_CLAIM_PATTERNS,
  TEXT_FIELDS,
} from '@/lib/gate/forbidden';
import { type GateParameters, gateParameters } from '@/lib/gate/params';

export type ProposalClaim = { kind: ClaimKind; factIds: string[]; text?: string };

export type ProposalAction = {
  class: ActionClass;
  summary?: string;
  payload?: Record<string, unknown>;
  claims?: ProposalClaim[];
  evidenceFactIds?: string[];
  text?: string;
  mode?: 'draft' | 'execute';
};

export type Proposal = {
  id?: string;
  orderId?: string | null;
  orderRef?: string | null;
  summary?: string;
  actions: ProposalAction[];
  // brokenLegs: ids of booked legs the itinerary marks missed, unreachable or redundant (G7 lets them be cancelled).
  context?: { vehicleWarning?: boolean; brokenLegs?: string[] };
};

export type GateViolation = { ruleId: GuardrailId; message: string; actionIndex: number | null };
export type GateWarning = GateViolation;
export type GateApproval = {
  actionIndex: number;
  actionClass: ActionClass;
  authority: Authority;
  reason: string;
};
export type GateAuto = { actionIndex: number; actionClass: ActionClass; notify: boolean };
export type CheckedClaim = {
  actionIndex: number;
  kind: ClaimKind;
  source: 'declared' | 'payload' | 'text';
  satisfiedBy: string | null;
};

export type GateResult = {
  ok: boolean;
  violations: GateViolation[];
  warnings: GateWarning[];
  approvalsRequired: GateApproval[];
  autoAllowed: GateAuto[];
  claims: CheckedClaim[];
};

const QUOTE_KINDS = ['FERRY_QUOTE', 'TRAVEL_QUOTE', 'FERRY_SOLD_OUT'];
const DEAD_BOOKING = ['MISSED_CHECK_IN', 'CANCELLED'];

// An agent's interpretation never counts above what was said.
function effectiveLevel(fact: FactLike): EvidenceLevel {
  if (fact.sourceType === 'AGENT_INTERPRETATION' && !atLeast({ level: 'STATED', min: fact.level }))
    return 'STATED';
  return fact.level;
}

function quoteCheckedAt(fact: FactLike): Date {
  const checked = factValue<string>(fact, 'checkedAt');
  return checked ? new Date(checked) : fact.observedAt;
}

function satisfies(args: {
  fact: FactLike;
  requirement: EvidenceRequirement;
  now: Date;
  params: GateParameters;
}): boolean {
  const { fact, requirement, now, params } = args;
  if (!(requirement.kinds as string[]).includes(fact.kind)) return false;
  if (!atLeast({ level: effectiveLevel(fact), min: requirement.minLevel })) return false;
  for (const [field, allowed] of Object.entries(requirement.where ?? {})) {
    if (!(allowed as readonly unknown[]).includes(factValue(fact, field))) return false;
  }
  if (requirement.maxAgeMinutes !== undefined) {
    if (minutesBetween({ from: quoteCheckedAt(fact), to: now }) > params.quoteBlockMinutes)
      return false;
  }
  return true;
}

function supportingFact(args: {
  kind: ClaimKind;
  facts: FactLike[];
  now: Date;
  params: GateParameters;
}): FactLike | null {
  const { kind, facts, now, params } = args;
  for (const requirement of CLAIM_KINDS[kind].anyOf as readonly EvidenceRequirement[]) {
    const fact = facts.find((f) => satisfies({ fact: f, requirement, now, params }));
    if (fact) return fact;
  }
  return null;
}

function describeFacts(facts: FactLike[]): string {
  if (!facts.length) return 'no facts';
  return facts.map((f) => `${f.kind} (${effectiveLevel(f)})`).join(', ');
}

function outboundTexts(action: ProposalAction): string[] {
  const payload = action.payload ?? {};
  const texts = TEXT_FIELDS.map((field) => payload[field]).filter(
    (v): v is string => typeof v === 'string'
  );
  return [...(action.text ? [action.text] : []), ...texts];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== false && value !== '';
}

function isVehicleWarningCase(facts: FactLike[]): boolean {
  return facts.some(
    (f) =>
      (f.kind === 'INCIDENT' &&
        /WARNING|BREAKDOWN|ACCIDENT|COLLISION/i.test(String(factValue(f, 'incidentKind') ?? ''))) ||
      (f.kind === 'ALERT' &&
        /WARNING|SAFETY_STOP|BREAKDOWN|ACCIDENT|COLLISION/i.test(
          String(factValue(f, 'signal') ?? '')
        ))
  );
}

function unreconciledAttempts(facts: FactLike[]): FactLike[] {
  const reconciled = facts.filter((f) => f.kind === 'BOOKING_RECONCILED');
  return facts.filter(
    (attempt) =>
      attempt.kind === 'BOOKING_OUTCOME_UNKNOWN' &&
      !reconciled.some(
        (r) =>
          r.observedAt >= attempt.observedAt &&
          (factValue(r, 'proposalId') === factValue(attempt, 'proposalId') ||
            factValue(r, 'attemptFactId') === attempt.id)
      )
  );
}

function recordIndex(facts: FactLike[]): Map<string, FactLike[]> {
  const index = new Map<string, FactLike[]>();
  for (const fact of facts) {
    const id = bahnRecordId(fact);
    if (id) index.set(id, [...(index.get(id) ?? []), fact]);
  }
  return index;
}

/** Checks one proposal against the guardrails; facts observed after `now` are invisible. */
export function checkProposal(args: {
  proposal: Proposal;
  facts: FactLike[];
  now: Date;
  parameters?: Partial<GateParameters>;
}): GateResult {
  const { proposal, facts, now } = args;
  const params = gateParameters(args.parameters);
  const visible = facts.filter((f) => f.observedAt <= now);
  const visibleById = new Map(visible.map((f) => [f.id, f]));
  const allIds = new Set(facts.map((f) => f.id));
  const byRecord = recordIndex(visible);
  const violations: GateViolation[] = [];
  const warnings: GateWarning[] = [];
  const approvalsRequired: GateApproval[] = [];
  const autoAllowed: GateAuto[] = [];
  const claims: CheckedClaim[] = [];
  const vehicleWarning = proposal.context?.vehicleWarning ?? isVehicleWarningCase(visible);
  const attempts = unreconciledAttempts(visible);
  const ownRefs = new Set(
    [
      proposal.orderRef,
      proposal.orderId,
      ...visible
        .filter((f) => f.kind === 'ORDER_STATUS')
        .map((f) => factValue<string>(f, 'reference')),
    ].filter((v): v is string => !!v)
  );
  const orderCancelled = visible.some(
    (f) =>
      f.kind === 'CUSTOMER_APPROVAL' && factValue(f, 'command') === 'order.cancellation_confirmed'
  );
  const block = (ruleId: GuardrailId, message: string, actionIndex: number | null) =>
    violations.push({ ruleId, message, actionIndex });
  const warn = (ruleId: GuardrailId, message: string, actionIndex: number | null) =>
    warnings.push({ ruleId, message, actionIndex });
  const forbidden = (kind: ForbiddenKind, detail: string, index: number) =>
    block('G4', `Forbidden for the agent: ${FORBIDDEN_LABEL[kind]} (${detail}).`, index);

  proposal.actions.forEach((action, index) => {
    const payload = action.payload ?? {};
    const spec = ACTION_CLASSES[action.class];
    if (!spec) {
      block('G2', `Unknown action class ${String(action.class)}.`, index);
      return;
    }

    // G11: every cited id must be a fact that existed at decision time.
    const citedIds = [
      ...(action.evidenceFactIds ?? []),
      ...(action.claims ?? []).flatMap((c) => c.factIds),
    ];
    for (const id of new Set(citedIds)) {
      if (visibleById.has(id)) continue;
      block(
        'G11',
        allIds.has(id)
          ? `Cites fact ${id}, which was observed after the decision time.`
          : `Cites unknown fact id ${id}.`,
        index
      );
    }
    const cited = [...new Set(citedIds)]
      .map((id) => visibleById.get(id))
      .filter((f): f is FactLike => !!f);

    // G4: forbidden class, structural fields, then phrases.
    if (action.class === 'FORBIDDEN')
      forbidden('MECHANICAL_ADVICE', 'action class FORBIDDEN', index);
    for (const field of MECHANICAL_FIELDS) {
      if (truthy(payload[field]))
        forbidden('MECHANICAL_ADVICE', `payload ${field}=${JSON.stringify(payload[field])}`, index);
    }
    for (const field of LIABILITY_FIELDS) {
      const value = payload[field];
      if (truthy(value) && !NEUTRAL_ATTRIBUTION.includes(String(value).toUpperCase())) {
        forbidden('LIABILITY', `payload ${field}=${JSON.stringify(value)}`, index);
      }
    }
    for (const hit of payloadMechanical(payload))
      forbidden('MECHANICAL_ADVICE', `payload ${hit}`, index);
    for (const hit of payloadLiability(payload)) forbidden('LIABILITY', `payload ${hit}`, index);
    for (const field of SUBSTITUTE_FIELDS) {
      if (truthy(payload[field])) forbidden('SUBSTITUTE_CAR', `payload ${field}`, index);
    }
    for (const field of OTHER_CUSTOMER_FIELDS) {
      if (truthy(payload[field])) forbidden('OTHER_CUSTOMER', `payload ${field}`, index);
    }
    const texts = outboundTexts(action);
    for (const text of texts) {
      if (vehicleWarning) {
        for (const hit of findPhrases({ text, patterns: MECHANICAL_ADVICE_PATTERNS }))
          forbidden('MECHANICAL_ADVICE', `"${hit}"`, index);
      }
      for (const hit of findPhrases({ text, patterns: LIABILITY_PATTERNS }))
        forbidden('LIABILITY', `"${hit}"`, index);
      for (const hit of findPhrases({ text, patterns: SUBSTITUTE_PATTERNS }))
        forbidden('SUBSTITUTE_CAR', `"${hit}"`, index);
      if (action.class === 'CUSTOMER_MESSAGE') {
        for (const hit of findPhrases({ text, patterns: OTHER_CUSTOMER_PATTERNS }))
          forbidden('OTHER_CUSTOMER', `"${hit}"`, index);
        for (const ref of text.match(ORDER_REFERENCE) ?? []) {
          if (ownRefs.size && !ownRefs.has(ref))
            forbidden('OTHER_CUSTOMER', `mentions ${ref}`, index);
        }
      }
    }

    // G3: declared claims must be supported by their own citations.
    for (const claim of action.claims ?? []) {
      if (!isClaimKind(claim.kind)) {
        block('G3', `Unknown claim kind ${String(claim.kind)}.`, index);
        continue;
      }
      const claimSpec = CLAIM_KINDS[claim.kind];
      if (!claimSpec.agentMayAssert) {
        forbidden('LIABILITY', `claim ${claim.kind} is a human decision`, index);
        claims.push({
          actionIndex: index,
          kind: claim.kind,
          source: 'declared',
          satisfiedBy: null,
        });
        continue;
      }
      const own = claim.factIds.map((id) => visibleById.get(id)).filter((f): f is FactLike => !!f);
      const support = supportingFact({
        kind: claim.kind,
        facts: own.length ? own : cited,
        now,
        params,
      });
      claims.push({
        actionIndex: index,
        kind: claim.kind,
        source: 'declared',
        satisfiedBy: support?.id ?? null,
      });
      if (!support) {
        block(
          'G3',
          `Claim ${claim.kind} ("${claimSpec.label}") cites ${describeFacts(own.length ? own : cited)}; it needs ${describeClaimRequirement(claim.kind)}.`,
          index
        );
      }
    }

    // G3: states asserted by payload fields or by outbound sentences.
    const implied: { kind: ClaimKind; source: 'payload' | 'text'; detail: string }[] = [];
    for (const [field, kind] of Object.entries(PAYLOAD_CLAIM_FIELDS)) {
      if (payload[field] === true)
        implied.push({ kind, source: 'payload', detail: `payload ${field}=true` });
    }
    for (const { claim, key } of payloadStateClaims(payload))
      implied.push({
        kind: claim,
        source: 'payload',
        detail: `payload ${key}=${JSON.stringify(payload[key])}`,
      });
    if (action.class === 'RECORD_ASSERTION') {
      for (const text of recordTexts(payload)) {
        for (const hit of findPhrases({ text, patterns: LIABILITY_PATTERNS }))
          forbidden('LIABILITY', `"${hit}"`, index);
        for (const { claim, pattern } of RECORD_TEXT_CLAIM_PATTERNS) {
          for (const hit of findPhrases({ text, patterns: [pattern] }))
            implied.push({ kind: claim, source: 'text', detail: `"${hit}"` });
        }
      }
    }
    for (const text of texts) {
      for (const { claim, pattern } of TEXT_CLAIM_PATTERNS) {
        for (const hit of findPhrases({ text, patterns: [pattern] }))
          implied.push({ kind: claim, source: 'text', detail: `"${hit}"` });
      }
    }
    const declaredKinds = new Set((action.claims ?? []).map((c) => c.kind));
    for (const claim of implied) {
      if (declaredKinds.has(claim.kind)) continue;
      const fromCited = supportingFact({ kind: claim.kind, facts: cited, now, params });
      const fromAll =
        fromCited ?? supportingFact({ kind: claim.kind, facts: visible, now, params });
      claims.push({
        actionIndex: index,
        kind: claim.kind,
        source: claim.source,
        satisfiedBy: fromAll?.id ?? null,
      });
      if (!fromAll) {
        block(
          'G3',
          `${claim.detail} asserts ${claim.kind} ("${CLAIM_KINDS[claim.kind].label}") but the cited evidence is ${describeFacts(cited)}; it needs ${describeClaimRequirement(claim.kind)}.`,
          index
        );
      } else if (!fromCited) {
        warn(
          'G11',
          `${claim.detail} is supported by fact ${fromAll.id} (${fromAll.kind}) but does not cite it.`,
          index
        );
      }
    }
    if (action.class === 'RECORD_ASSERTION' && !(action.claims ?? []).length && !implied.length) {
      warn(
        'G3',
        'A record assertion should declare the claim it makes and cite its evidence.',
        index
      );
    }

    // G5: a booking needs a fresh quote (or an explicit fresh check at execution).
    const isBooking = action.class === 'BOOK_TRAVEL' || payload.buy_ticket === true;
    if (isBooking) {
      if (payload.use_first_available === true) {
        block(
          'G5',
          'Selects "the first available" crossing from an unrefreshed list; book only a freshly verified option.',
          index
        );
      }
      const quoteRefs = ['travel_option_id', 'option_id', 'quote_id', 'quote_fact_id']
        .map((field) => payload[field])
        .filter((v): v is string => typeof v === 'string');
      // The booked quote is the one the payload names; other cited quotes are context (e.g. the sold-out sailing).
      const named = quoteRefs.flatMap((ref) => [
        ...(byRecord.get(ref) ?? []),
        ...(visibleById.has(ref) ? [visibleById.get(ref) as FactLike] : []),
      ]);
      const quotes = (quoteRefs.length ? named : cited).filter(
        (f, i, all) => QUOTE_KINDS.includes(f.kind) && all.findIndex((g) => g.id === f.id) === i
      );
      for (const ref of quoteRefs) {
        if (!byRecord.has(ref) && !visibleById.has(ref))
          block(
            'G11',
            `Booking references ${ref}, which is not a known quote at decision time.`,
            index
          );
      }
      if (!quotes.length && !payload.use_first_available) {
        if (
          payload.require_fresh_capacity_check === true ||
          payload.recheck_before_booking === true
        ) {
          warn('G5', 'The booking waits for a fresh capacity check at execution (G8).', index);
        } else {
          block('G5', 'The booking cites no quote; check capacity first.', index);
        }
      }
      for (const quote of quotes) {
        const age = Math.round(minutesBetween({ from: quoteCheckedAt(quote), to: now }));
        if (quote.kind === 'FERRY_SOLD_OUT') {
          block('G5', `Quote ${quote.id} shows the sailing sold out.`, index);
        } else if (age > params.quoteBlockMinutes) {
          block(
            'G5',
            `Quote ${quote.id} is ${age} min old (limit ${params.quoteBlockMinutes}); refresh capacity before booking.`,
            index
          );
        } else if (age > params.quoteWarnMinutes) {
          warn(
            'G5',
            `Quote ${quote.id} is ${age} min old (warning above ${params.quoteWarnMinutes}).`,
            index
          );
        }
      }
      // G9: no retry or alternative purchase while an attempt's outcome is unknown.
      for (const attempt of attempts) {
        block(
          'G9',
          `An earlier booking attempt (${factValue<string>(attempt, 'proposalId') ?? attempt.id}, ${formatLocal({ at: attempt.observedAt, timeZone: 'UTC' })}) has an unknown outcome; reconcile with the provider before any retry or alternative purchase.`,
          index
        );
      }
    }

    // G6: a promise changes only with customer approval (and a booked replacement).
    const windowTarget = String(payload.window ?? payload.target ?? payload.window_kind ?? '');
    const promiseChange =
      (action.class === 'CHANGE_WINDOW' && /promise|delivery/i.test(windowTarget)) ||
      payload.change_promise === true ||
      payload.present_new_promise === true ||
      truthy(payload.new_promise_start_at) ||
      declaredKinds.has('PROMISE_CHANGED');
    if (promiseChange) {
      const approval = supportingFact({ kind: 'PROMISE_CHANGED', facts: cited, now, params });
      if (!approval) {
        block(
          'G6',
          'Changes or presents a new promise without a cited customer approval; keep the promise and send an approval request draft instead.',
          index
        );
      }
    }

    // G7: cancel only a dead, broken or redundant booking, or one this option or a confirmed booking replaces.
    const cancelling =
      action.class === 'CANCEL_TRAVEL' ||
      payload.cancel_current === true ||
      (action.class === 'CHANGE_ASSIGNMENT' &&
        (payload.cancel === true || payload.action === 'cancel'));
    if (cancelling && !orderCancelled) {
      const targetId = ['reservation_id', 'cancel_reservation_id', 'assignment_id']
        .map((f) => payload[f])
        .find((v): v is string => typeof v === 'string');
      const targetFact = targetId ? visibleById.get(targetId) : undefined;
      const target = targetId
        ? [...(byRecord.get(targetId) ?? []), ...(targetFact ? [targetFact] : [])]
        : [];
      const aliases = new Set(
        [targetId, ...target.flatMap((f) => [f.id, bahnRecordId(f)])].filter(
          (id): id is string => !!id
        )
      );
      const dead = target.some((f) => DEAD_BOOKING.includes(String(factValue(f, 'status') ?? '')));
      const broken = [...aliases].some((id) => proposal.context?.brokenLegs?.includes(id));
      const replacedHere = proposal.actions.some(
        (other) =>
          other.class === 'BOOK_TRAVEL' &&
          stringList(other.payload?.replaces).some((id) => aliases.has(id))
      );
      const replacement = ['BOOKED_CAPACITY', 'ASSIGNED', 'OFFER_ACCEPTED']
        .map((kind) =>
          supportingFact({
            kind: kind as ClaimKind,
            facts: cited.filter((f) => !targetId || bahnRecordId(f) !== targetId),
            now,
            params,
          })
        )
        .find(Boolean);
      if (action.class === 'CANCEL_TRAVEL' && targetId && !target.length && !broken) {
        block('G7', `Cancels ${targetId}, which is not a booking on record.`, index);
      } else if (!dead && !broken && !replacedHere && !replacement) {
        block(
          'G7',
          targetId && action.class === 'CANCEL_TRAVEL'
            ? `Cancels booking ${targetId}, which still works and which this option does not replace; keep it, or book its replacement in the same option.`
            : 'Cancels the current booking or assignment before a replacement is confirmed; cite the confirmed replacement or keep the current one.',
          index
        );
      }
    }

    // G1/G2 and the authority table.
    const recipient = String(payload.recipient ?? payload.to ?? '');
    if (action.class !== 'CUSTOMER_MESSAGE' && /customer|buyer|receiver/i.test(recipient)) {
      block('G1', 'Customer contact must be a CUSTOMER_MESSAGE draft approved by a person.', index);
    }
    const authority = spec.authority as Authority;
    if (authority === 'AUTO' || authority === 'AUTO_NOTIFY') {
      autoAllowed.push({
        actionIndex: index,
        actionClass: action.class,
        notify: authority === 'AUTO_NOTIFY',
      });
    } else if (authority !== 'BLOCKED') {
      const reason =
        authority === 'HUMAN_ONLY'
          ? 'Money decisions are made by a person; the agent may only prepare them.'
          : authority === 'EVIDENCE_THEN_YES'
            ? 'After the evidence check (G3), a person approves record changes.'
            : action.class === 'CUSTOMER_MESSAGE'
              ? 'Customer-facing text is a draft until approved (G1).'
              : 'A commitment needs a yes (G2).';
      approvalsRequired.push({ actionIndex: index, actionClass: action.class, authority, reason });
      if (action.mode === 'execute') {
        block(
          action.class === 'CUSTOMER_MESSAGE' ? 'G1' : 'G2',
          `${action.class} cannot be executed without a person's yes.`,
          index
        );
      }
    }
  });

  const seen = new Set<string>();
  const unique = violations.filter((v) => {
    const key = `${v.ruleId}|${v.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    ok: unique.length === 0,
    violations: unique,
    warnings,
    approvalsRequired,
    autoAllowed,
    claims,
  };
}
