// Facts as the UI shows them: short chip label, source in human words, local time with UTC alongside.

import {
  formatAge,
  formatDay,
  formatDayTime,
  formatTime,
  formatUtc,
  humanize,
} from '@/lib/control-room/format';
import type { FactSourceView, FactView } from '@/lib/control-room/types';
import { FACT_KINDS } from '@/lib/evidence/ladder';
import type { Fact } from '@/lib/generated/prisma/client';
import { plainText } from '@/lib/text';

const CHIP_LABEL: Record<string, string> = {
  DRIVER_STATEMENT: 'Driver said',
  CUSTOMER_STATEMENT: 'Customer said',
  SITE_STATEMENT: 'Site said',
  HANDOFF_STATEMENT: 'Receiver said',
  OPERATOR_MESSAGE: 'Ops message',
  OPERATOR_NOTE: 'Ops note',
  AGENT_MESSAGE: 'Agent message',
  INBOX_MESSAGE: 'Support inbox',
  FERRY_QUOTE: 'Ferry quote',
  TRAVEL_QUOTE: 'Quote',
  FERRY_SOLD_OUT: 'Sold out',
  FERRY_BOOKING: 'Ferry booked',
  TRAVEL_BOOKING: 'Ticket booked',
  HOTEL_BOOKING: 'Hotel booked',
  BOOKING_OUTCOME_UNKNOWN: 'Outcome unknown',
  BOOKING_RECONCILED: 'Provider answer',
  GATE_SCAN: 'Gate scan',
  PICKUP_EVENT: 'Pickup scan',
  DELIVERY_EVENT: 'Delivery scan',
  PROMISE_WINDOW: 'Promise',
  SLOT_WINDOW: 'Slot',
  REQUESTED_WINDOW: 'Requested slot',
  AVAILABILITY_WINDOW: 'Availability',
  HARD_DEADLINE: 'Hard deadline',
  TRACKING_OBSERVATION: 'App estimate',
  DRIVER_ASSIGNED: 'Driver assigned',
  DRIVER_STATED_LIMIT: 'Driver limit',
  OPERATOR_DECISION: 'Operator decided',
  ORDER_STATUS: 'Order status',
  VEHICLE_IDENTITY: 'Car record',
  ENDPOINT_CONTACT: 'Contact',
  ENDPOINT_ACCESS: 'Access',
  SITE_PROFILE: 'Site procedure',
  WORK_ITEM: 'Work item',
  AGENT_PROPOSAL: 'Proposal',
  POSITIONING_PLAN: 'Positioning',
};

const COLLECTION_WORDS: Record<string, string> = {
  messages: 'Message',
  support_inbox_messages: 'Support inbox message',
  time_windows: 'Time window',
  travel_options: 'Travel quote',
  travel_reservations: 'Travel reservation',
  travel_confirmations: 'Travel confirmation',
  order_endpoint_details: 'Pickup or delivery details',
  endpoint_claims: 'Claim about an endpoint',
  tracking_observations: 'Tracking estimate',
  work_assignments: 'Driver assignment',
  operational_events: 'Event log',
  order_items: 'Order item',
  orders: 'Order',
  market_offers: 'Driver offer',
  market_offer_exposures: 'Directed offer',
  agent_proposals: 'Agent proposal',
  ferry_terminal_events: 'Terminal gate event',
  order_notes: 'Internal note',
  custody_assets: 'Keys or papers',
  custody_reports: 'Custody report',
  site_visits: 'Site visit',
  sites: 'Site profile',
};

const TOOL_WORDS: Record<string, string> = {
  ask_provider: 'Asked the provider',
  ask_driver: 'Asked the driver',
  ask_site: 'Asked the site',
  search_ferries: 'Searched ferries',
  search_hotels: 'Searched hotels',
  search_trains: 'Searched trains',
  find_roadside: 'Looked up roadside help',
  get_order_context: 'Read the order',
  list_facts: 'Read the facts',
  record_interpretation: 'Noted a reading',
  record_note: 'Wrote a note',
  get_time: 'Checked the time',
  book: 'Booked',
  execute: 'Carried out the approved plan',
};

export function toolWords(tool: string): string {
  const name = tool.replace(/^mcp__control__/, '');
  return TOOL_WORDS[name] ?? humanize(name);
}

export function collectionWords(collection: string): string {
  return COLLECTION_WORDS[collection] ?? humanize(collection.replace(/s$/, ''));
}

export function kindLabel(kind: string): string {
  const spec = (FACT_KINDS as Record<string, { label: string } | undefined>)[kind];
  return spec?.label ?? humanize(kind);
}

export type ParsedSource =
  | { kind: 'bahn'; collection: string; id: string }
  | { kind: 'tool'; tool: string; ref: string | null }
  | { kind: 'card'; id: string }
  | { kind: 'other'; ref: string };

export function parseSourceRef(ref: string): ParsedSource {
  const bahn = ref.match(/^bahn\.([a-z_]+):(.+)$/);
  if (bahn) return { kind: 'bahn', collection: bahn[1], id: bahn[2] };
  const tool = ref.match(/^tool:([a-z_]+)(?::(.+))?$/);
  if (tool) return { kind: 'tool', tool: tool[1], ref: tool[2] ?? null };
  const card = ref.match(/^card:(.+)$/);
  if (card) return { kind: 'card', id: card[1] };
  return { kind: 'other', ref };
}

export function describeSource(fact: Pick<Fact, 'sourceType' | 'sourceRef'>): FactSourceView {
  const parsed = parseSourceRef(fact.sourceRef);
  const base = { type: fact.sourceType, raw: fact.sourceRef };
  if (parsed.kind === 'bahn')
    return {
      ...base,
      title: `Bahn record · ${collectionWords(parsed.collection)}`,
      detail: parsed.id,
      href: null,
    };
  if (parsed.kind === 'tool')
    return {
      ...base,
      title: `${fact.sourceType === 'AGENT_INTERPRETATION' ? "Agent's reading" : 'Agent tool'} · ${toolWords(parsed.tool)}`,
      detail: parsed.ref,
      href: null,
    };
  if (parsed.kind === 'card')
    return {
      ...base,
      title: 'Operator decision on a card',
      detail: null,
      href: `/cards/${parsed.id}`,
    };
  return {
    ...base,
    title:
      fact.sourceType === 'AGENT_INTERPRETATION'
        ? "Agent's reading (counts as stated at most)"
        : humanize(fact.sourceType),
    detail: parsed.ref,
    href: null,
  };
}

const QUOTE_KINDS = new Set(['FERRY_QUOTE', 'TRAVEL_QUOTE']);

// Kinds whose observed time is the moment it happened, so the chip shows it; windows and records do not.
const TIMED_KINDS = new Set([
  'DRIVER_STATEMENT',
  'CUSTOMER_STATEMENT',
  'SITE_STATEMENT',
  'HANDOFF_STATEMENT',
  'OPERATOR_MESSAGE',
  'OPERATOR_NOTE',
  'AGENT_MESSAGE',
  'INBOX_MESSAGE',
  'BOOKING_RECONCILED',
  'BOOKING_OUTCOME_UNKNOWN',
  'GATE_SCAN',
  'PICKUP_EVENT',
  'DELIVERY_EVENT',
  'TRACKING_OBSERVATION',
  'OPERATOR_DECISION',
  'FERRY_SOLD_OUT',
  'FERRY_BOOKING',
  'TRAVEL_BOOKING',
  'HOTEL_BOOKING',
  'ALERT',
  'INCIDENT',
  'PICKUP_ATTEMPT',
]);
const QUOTE_LIMIT_MINUTES = 90;

function quoteCheckedAt(fact: Fact): Date {
  const value = fact.value as Record<string, unknown> | null;
  const checked = value && typeof value.checkedAt === 'string' ? new Date(value.checkedAt) : null;
  return checked && !Number.isNaN(checked.getTime()) ? checked : fact.observedAt;
}

export function toFactView(args: { fact: Fact; now: Date }): FactView {
  const { fact, now } = args;
  const short = CHIP_LABEL[fact.kind] ?? kindLabel(fact.kind);
  let label = TIMED_KINDS.has(fact.kind)
    ? `${short} · ${
        formatDay({ at: fact.observedAt }) === formatDay({ at: now })
          ? formatTime({ at: fact.observedAt }).split(' ')[0]
          : formatDay({ at: fact.observedAt }).replace(/^\w+ /, '')
      }`
    : short;
  let caution: string | null = null;
  if (QUOTE_KINDS.has(fact.kind) && fact.level === 'QUOTED') {
    const checkedAt = quoteCheckedAt(fact);
    const minutes = (now.getTime() - checkedAt.getTime()) / 60_000;
    label = `${short} · ${minutes < 1 ? 'just checked' : `${formatAge({ at: checkedAt, now }).replace(' ago', '')} old`}`;
    if (minutes > QUOTE_LIMIT_MINUTES)
      caution = 'Older than 90 min. Re-check before booking or showing it as capacity.';
  }
  const source = describeSource(fact);
  return {
    id: fact.id,
    kind: fact.kind,
    kindLabel: kindLabel(fact.kind),
    level: fact.level,
    label,
    statement: plainText(fact.statement, now),
    source,
    observedLocal: formatDayTime({ at: fact.observedAt }),
    observedUtc: formatUtc(fact.observedAt),
    age: formatAge({ at: fact.observedAt, now }),
    caution,
    hasRecord:
      parseSourceRef(fact.sourceRef).kind === 'bahn' ||
      (fact.value !== null && typeof fact.value === 'object'),
  };
}
