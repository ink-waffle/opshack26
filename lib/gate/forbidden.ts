// G4 detectors: structural payload fields first, then a conservative phrase list with a negation guard.

import type { ClaimKind } from '@/lib/evidence/ladder';

export type ForbiddenKind = 'MECHANICAL_ADVICE' | 'LIABILITY' | 'OTHER_CUSTOMER' | 'SUBSTITUTE_CAR';

export const FORBIDDEN_LABEL: Record<ForbiddenKind, string> = {
  MECHANICAL_ADVICE: 'mechanical or driving advice in a warning or accident case',
  LIABILITY: 'liability attribution',
  OTHER_CUSTOMER: "naming another customer's job",
  SUBSTITUTE_CAR: 'substituting a different car',
};

// Payload fields that are forbidden when truthy (or, for liability, when they name a cause).
export const MECHANICAL_FIELDS = [
  'authorize_restart',
  'cleared_to_drive',
  'continue_driving',
  'restart_allowed',
  'drive_allowed',
];
export const LIABILITY_FIELDS = [
  'attribution',
  'liability',
  'fault',
  'responsible_party',
  'liable_party',
  'damage_cause',
];
export const SUBSTITUTE_FIELDS = [
  'substitute_vehicle_id',
  'replacement_vehicle_id',
  'substitute_vehicle',
  'use_similar_vehicle',
];
export const OTHER_CUSTOMER_FIELDS = ['mention_order_ids', 'other_customer_reference'];
export const NEUTRAL_ATTRIBUTION = [
  'UNKNOWN',
  'UNDETERMINED',
  'NONE',
  'NOT_ATTRIBUTED',
  'OPEN',
  'PENDING',
];

// Outbound text lives in the action's `text` or in these payload fields.
export const TEXT_FIELDS = [
  'message',
  'text',
  'body',
  'draft',
  'customer_message',
  'driver_message',
  'site_message',
];

export const MECHANICAL_ADVICE_PATTERNS: RegExp[] = [
  /\bre-?start(?:ing|ed)?\b/i,
  /\b(?:try|attempt)(?:ing)? (?:to )?start(?:ing)?\b/i,
  /\bstart (?:the |your )?(?:engine|car|vehicle)\b/i,
  /\b(?:turn|switch) (?:the |your )?(?:engine|ignition) (?:back )?on\b/i,
  /\b(?:keep|continue|carry on|resume) driving\b/i,
  /\bdrive (?:on|slowly|carefully)\b/i,
  /\b(?:safe|ok|okay|fine|cleared|good) to (?:drive|continue)\b/i,
  /\btop (?:it )?up\b/i,
  /\b(?:add|refill|check) (?:the |some )?(?:oil|coolant|water|fluid|adblue|tyre pressure|tire pressure)\b/i,
  /\b(?:reset|clear|ignore) (?:the )?(?:warning|light|fault|error)\b/i,
  /\bdisconnect the battery\b/i,
  /\bjump[- ]start\b/i,
  /\bturn (?:the |your )?key\b/i,
  /\b(?:give|try) (?:the (?:engine|car|vehicle|ignition)|it) (?:another|a|one more) (?:go|try|shot|attempt)\b/i,
  /\b(?:see|check|test) (?:if|whether) (?:it|the (?:engine|car|vehicle)) (?:starts|will start|runs|turns over|drives)\b/i,
  /\b(?:crank|fire up) (?:it|the (?:engine|car|vehicle))\b|\bfire (?:it|the engine) up\b/i,
  /\b(?:switch|turn) (?:it|the (?:engine|car|vehicle|ignition)) off and (?:back )?on\b/i,
];

export const LIABILITY_PATTERNS: RegExp[] = [
  /\b(?:the )?driver (?:caused|damaged|scratched|dented|is responsible|was responsible|is at fault)\b/i,
  /\bcaused by (?:the |our )?(?:driver|transport|transporter|bahn)\b/i,
  /\b(?:is|are|was|were) (?:liable|at fault)\b/i,
  /\b(?:we|bahn) (?:accept|admit)s? (?:liability|responsibility|fault)\b/i,
  /\b(?:your|the driver's|our) fault\b/i,
  /\bhappened during (?:the )?(?:transport|delivery)\b/i,
];

export const OTHER_CUSTOMER_PATTERNS: RegExp[] = [
  /\b(?:another|other|previous|earlier) customer'?s?\b/i,
  /\b(?:previous|earlier|other) (?:job|trip|delivery|order) for\b/i,
];

export const SUBSTITUTE_PATTERNS: RegExp[] = [
  /\b(?:similar|substitute|alternative|different|replacement) (?:car|vehicle)\b/i,
  /\bsubstitut(?:e|ing) (?:the |a |another )?(?:car|vehicle)\b/i,
];

export const ORDER_REFERENCE = /\b(?:CD-\d{6}|ord-\d{5})\b/g;

// Sentences that assert a state; the gate then demands the matching evidence (G3).
export const TEXT_CLAIM_PATTERNS: { claim: ClaimKind; pattern: RegExp }[] = [
  {
    claim: 'BOOKED_CAPACITY',
    pattern: /\b(?:is|are|has been|have been|was|were|now) (?:confirmed and )?booked\b/i,
  },
  { claim: 'BOARDED', pattern: /\b(?:has|have) boarded\b|\b(?:is|are) (?:now )?on board\b/i },
  { claim: 'CHECKED_IN', pattern: /\b(?:has|have) checked in\b|\bis checked in\b/i },
  { claim: 'PICKED_UP', pattern: /\b(?:has been|was) (?:picked up|collected)\b/i },
  { claim: 'DELIVERED', pattern: /\b(?:has been|was) delivered\b/i },
  { claim: 'PAID', pattern: /\b(?:has been|was|were) paid\b/i },
  { claim: 'INVOICE_ISSUED', pattern: /\binvoice (?:has been|was|is) (?:issued|sent)\b/i },
  { claim: 'RECEIVER_SIGNED', pattern: /\b(?:receiver|recipient) (?:has )?signed\b/i },
];

// Payload fields that assert a state when true.
export const PAYLOAD_CLAIM_FIELDS: Record<string, ClaimKind> = {
  mark_boarding_confirmed: 'BOARDED',
  boarding_confirmed: 'BOARDED',
  mark_checked_in: 'CHECKED_IN',
  mark_picked_up: 'PICKED_UP',
  mark_delivered: 'DELIVERED',
  mark_paid: 'PAID',
  tell_customer_issued: 'INVOICE_ISSUED',
  tell_customer_booked: 'BOOKED_CAPACITY',
  mark_receiver_signed: 'RECEIVER_SIGNED',
  mark_keys_handed_over: 'KEYS_HANDED_OVER',
  mark_receiver_confirmed: 'RECEIVER_CONFIRMED',
  mark_access_confirmed: 'ACCESS_CONFIRMED',
};

// A negation counts only when it governs the phrase: at most three words before it, no comma or clause break.
const NEGATION =
  /\b(?:do not|don't|don’t|dont|not|never|no one|nobody|without|avoid|refrain from|cannot|can't|can’t|won't|won’t|must not|should not)(?:\s+[\w'’-]+){0,3}\s*$/i;

/** Matched phrases in `text`, skipping those negated just before ("do not restart"). */
export function findPhrases(args: { text: string; patterns: RegExp[] }): string[] {
  const { text, patterns } = args;
  const hits: string[] = [];
  for (const pattern of patterns) {
    const global = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
    );
    for (const match of text.matchAll(global)) {
      const before = text.slice(Math.max(0, (match.index ?? 0) - 60), match.index ?? 0);
      if (NEGATION.test(before)) continue;
      hits.push(match[0]);
    }
  }
  return hits;
}

// ── Payload keys by meaning, not by exact name (held-out rewordings: lib/gate/heldOut.ts) ──

/** "allow_engineRestart" → ['allow', 'engine', 'restart']. */
export function keyTokens(key: string): string[] {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

const NEGATING = new Set(['not', 'no', 'never', 'without', 'avoid', 'prevent', 'dont', 'skip']);
// Keys that ask for or check a state rather than assert it ("request_signed_handover").
const SEEKING = new Set([
  'request',
  'ask',
  'check',
  'verify',
  'refresh',
  'await',
  'wait',
  'require',
  'review',
  'look',
  'find',
  'search',
  'compare',
]);

function negatedKey(tokens: string[]): boolean {
  return tokens.some((token) => NEGATING.has(token) || /^un[a-z]{3,}/.test(token));
}

const ASSERTED_VALUES = new Set([
  'CONFIRMED',
  'DONE',
  'YES',
  'TRUE',
  'COMPLETE',
  'COMPLETED',
  'VERIFIED',
  'OK',
  'BOARDED',
  'DELIVERED',
  'PAID',
  'ISSUED',
  'SIGNED',
  'PICKED_UP',
  'CHECKED_IN',
  'BOOKED',
]);

function asserted(value: unknown): boolean {
  return value === true || (typeof value === 'string' && ASSERTED_VALUES.has(value.toUpperCase()));
}

const STATE_TOKENS: { claim: ClaimKind; match: (tokens: string[]) => boolean }[] = [
  {
    claim: 'BOARDED',
    match: (t) => t.some((w) => ['board', 'boarded', 'boarding', 'onboard'].includes(w)),
  },
  {
    claim: 'CHECKED_IN',
    match: (t) => t.includes('checkin') || (t.includes('checked') && t.includes('in')),
  },
  {
    claim: 'PICKED_UP',
    match: (t) => t.includes('collected') || (t.includes('picked') && t.includes('up')),
  },
  { claim: 'DELIVERED', match: (t) => t.includes('delivered') },
  { claim: 'PAID', match: (t) => t.includes('paid') },
  { claim: 'INVOICE_ISSUED', match: (t) => t.includes('invoice') && t.includes('issued') },
  { claim: 'BOOKED_CAPACITY', match: (t) => t.includes('booked') },
  { claim: 'RECEIVER_SIGNED', match: (t) => t.includes('signed') },
  { claim: 'KEYS_HANDED_OVER', match: (t) => t.includes('keys') && t.includes('handed') },
];

/** States a payload asserts through any key that names one (beyond PAYLOAD_CLAIM_FIELDS). */
export function payloadStateClaims(
  payload: Record<string, unknown>
): { claim: ClaimKind; key: string }[] {
  const found: { claim: ClaimKind; key: string }[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (key in PAYLOAD_CLAIM_FIELDS || !asserted(value)) continue;
    const tokens = keyTokens(key);
    if (negatedKey(tokens) || SEEKING.has(tokens[0] ?? '')) continue;
    const state = STATE_TOKENS.find((entry) => entry.match(tokens));
    if (state) found.push({ claim: state.claim, key });
  }
  return found;
}

const BLAME_TOKENS = /^(?:attribut\w*|liab\w*|fault|faults|blame\w*|culprit|responsib\w*)$/;
const CAUSE_TOKENS = /^(?:cause|caused|causer|origin)$/;
const OUR_PARTY =
  /\b(?:driver|drivers|transport|transporter|carrier|bahn|delivery|haulier|we|us|our)\b/i;

/** Liability attributed through any blame/cause key (a cause only counts when it names our side). */
export function payloadLiability(payload: Record<string, unknown>): string[] {
  const hits: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (LIABILITY_FIELDS.includes(key)) continue;
    const tokens = keyTokens(key);
    if (negatedKey(tokens) || SEEKING.has(tokens[0] ?? '')) continue;
    const text = typeof value === 'string' ? value.replace(/_/g, ' ') : '';
    if (!text && value !== true) continue;
    if (text && NEUTRAL_ATTRIBUTION.includes(value as string)) continue;
    const blame = tokens.some((token) => BLAME_TOKENS.test(token));
    const cause = tokens.some((token) => CAUSE_TOKENS.test(token));
    const namesUs = OUR_PARTY.test(text) || tokens.some((token) => OUR_PARTY.test(token));
    if ((blame && (text || namesUs)) || (cause && namesUs))
      hits.push(`${key}=${JSON.stringify(value)}`);
  }
  return hits;
}

const OPERATE_TOKENS = new Set([
  'restart',
  'start',
  'ignition',
  'engine',
  'drive',
  'driving',
  'resume',
  'operate',
  'continue',
  'proceed',
]);
const PERMIT_TOKENS = new Set([
  'allow',
  'allowed',
  'authorize',
  'authorise',
  'authorized',
  'permit',
  'permitted',
  'ok',
  'okay',
  'cleared',
  'clear',
  'can',
  'may',
  'enable',
  'approve',
  'approved',
  'try',
  'attempt',
]);

/** Permission to operate the car through any key that combines "allow" with "restart/drive". */
export function payloadMechanical(payload: Record<string, unknown>): string[] {
  const hits: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (MECHANICAL_FIELDS.includes(key) || !asserted(value)) continue;
    const tokens = keyTokens(key);
    if (negatedKey(tokens)) continue;
    if (tokens.some((t) => OPERATE_TOKENS.has(t)) && tokens.some((t) => PERMIT_TOKENS.has(t)))
      hits.push(`${key}=${JSON.stringify(value)}`);
  }
  return hits;
}

// States written into a record's free text ("the car boarded as planned"); only for record assertions.
export const RECORD_TEXT_CLAIM_PATTERNS: { claim: ClaimKind; pattern: RegExp }[] = [
  { claim: 'BOARDED', pattern: /\bboarded\b|\bon board\b/i },
  { claim: 'CHECKED_IN', pattern: /\bchecked in\b/i },
  { claim: 'PICKED_UP', pattern: /\b(?:picked up|collected)\b/i },
  { claim: 'DELIVERED', pattern: /\bdelivered\b/i },
  { claim: 'PAID', pattern: /\bpaid\b/i },
  { claim: 'RECEIVER_SIGNED', pattern: /\bsigned\b/i },
];

/** Free-text values of a record payload (notes, resolutions), excluding ids and flags. */
export function recordTexts(payload: Record<string, unknown>): string[] {
  return Object.values(payload).filter(
    (value): value is string => typeof value === 'string' && /\s/.test(value.trim())
  );
}
