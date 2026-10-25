// The evidence ladder as data: the single source for fact kinds, claim requirements and "X is not proof of Y" rules.

import type { EvidenceLevel } from '@/lib/generated/prisma/client';

export type { EvidenceLevel };

export const EVIDENCE_LEVELS = [
  'REQUESTED',
  'STATED',
  'QUOTED',
  'PLANNED',
  'BOOKED',
  'OBSERVED',
  'VERIFIED',
] as const satisfies readonly EvidenceLevel[];

export const LEVEL_MEANING: Record<EvidenceLevel, string> = {
  REQUESTED: 'A wish or a request (requested slot, proposal awaiting review). Not agreed.',
  STATED:
    'Someone said or reported it (driver, site, customer, app estimate, alert). Attributed, unverified.',
  QUOTED: 'A provider showed price or space at the moment of the check. Goes stale; not a booking.',
  PLANNED:
    'Our own plan or selection (selected slot, published offer, prepared document, work item).',
  BOOKED: 'An outside party committed (reservation, accepted assignment, customer-agreed window).',
  OBSERVED:
    'A recorded event at the moment it happened (gate scan, pickup scan, submitted file, sent message).',
  VERIFIED:
    'A person reviewed and verified it (approved proof, verified document, resolved claim).',
};

export function levelRank(level: EvidenceLevel): number {
  return EVIDENCE_LEVELS.indexOf(level);
}

export function atLeast(args: { level: EvidenceLevel; min: EvidenceLevel }): boolean {
  const { level, min } = args;
  return levelRank(level) >= levelRank(min);
}

export const DOMAINS = {
  travel: 'Ferry and driver travel',
  dispatch: 'Driver to job',
  location: 'Driver location',
  handover: 'Car and handover',
  time: 'Time',
  site: 'Site and access',
  documents: 'Documents',
  messages: 'Messages',
  alerts: 'Alerts and work',
  money: 'Money',
  agents: 'Agents',
  order: 'Order',
  absence: 'Absence',
} as const;

export type Domain = keyof typeof DOMAINS;

export type FactKindSpec = {
  domain: Domain;
  label: string;
  level: EvidenceLevel;
  levelNote?: string;
  sources: string[];
  doesNotProve: string[];
};

export const FACT_KINDS = {
  // time
  PROMISE_WINDOW: {
    domain: 'time',
    label: 'Delivery promise window',
    level: 'BOOKED',
    levelNote: 'BOOKED when the customer supplied it; PLANNED when SYSTEM or OPS selected it.',
    sources: ['time_windows (CUSTOMER_DELIVERY_PROMISE)'],
    doesNotProve: [
      'A window selected by the system or an operator is not customer approval.',
      'A target window is not an ETA and not the hard deadline.',
    ],
  },
  SLOT_WINDOW: {
    domain: 'time',
    label: 'Selected pickup or delivery slot',
    level: 'PLANNED',
    levelNote:
      'BOOKED when the customer or site supplied it; PLANNED when SYSTEM or OPS selected it.',
    sources: ['time_windows (SELECTED_PICKUP_SLOT, SELECTED_DELIVERY_SLOT)'],
    doesNotProve: [
      'A selected slot is not customer or site agreement unless they supplied it.',
      'A slot is not proof the car is ready or was collected.',
    ],
  },
  REQUESTED_WINDOW: {
    domain: 'time',
    label: 'Requested slot',
    level: 'REQUESTED',
    sources: ['time_windows (REQUESTED_PICKUP_SLOT, REQUESTED_DELIVERY_SLOT)'],
    doesNotProve: ['A requested slot is a wish, not an agreement.'],
  },
  AVAILABILITY_WINDOW: {
    domain: 'time',
    label: 'Stated pickup availability',
    level: 'STATED',
    sources: ['time_windows (PICKUP_AVAILABILITY)'],
    doesNotProve: ['Availability is not a selected slot.'],
  },
  HARD_DEADLINE: {
    domain: 'time',
    label: 'Hard delivery deadline',
    level: 'BOOKED',
    sources: ['time_windows.commitment_deadline_at'],
    doesNotProve: ['The outer limit is not the target window and not an ETA.'],
  },
  WINDOW_REVISED: {
    domain: 'time',
    label: 'Window revised by an operator',
    level: 'PLANNED',
    sources: ['operational_events (pickup.window_revised, delivery.window_revised, …)'],
    doesNotProve: ['An operator revision is not customer approval.'],
  },
  CUSTOMER_APPROVAL: {
    domain: 'time',
    label: 'Customer approval recorded',
    level: 'OBSERVED',
    sources: [
      'operational_events by the customer (delivery.promise_revised, order.cancellation_confirmed)',
    ],
    doesNotProve: ['Approval of one change does not approve any other change.'],
  },
  // travel
  FERRY_QUOTE: {
    domain: 'travel',
    label: 'Ferry quote',
    level: 'QUOTED',
    sources: ['travel_options (FERRY, AVAILABLE_QUOTE)', 'tool: search_ferries'],
    doesNotProve: [
      'A quote means space was offered at that price at checked_at, not that space exists now.',
      'A quote is not a booking.',
      'Quotes go stale: older than 90 min cannot be booked or presented as capacity; 60–90 min is a warning.',
    ],
  },
  FERRY_SOLD_OUT: {
    domain: 'travel',
    label: 'Ferry sold out at check',
    level: 'QUOTED',
    sources: ['travel_options (FERRY, SOLD_OUT)'],
    doesNotProve: ['Sold out at the check time; space can reappear on a recheck.'],
  },
  TRAVEL_QUOTE: {
    domain: 'travel',
    label: 'Train or flight quote',
    level: 'QUOTED',
    sources: ['travel_options (TRAIN, FLIGHT)', 'tool: search_trains'],
    doesNotProve: ['A quote is not a ticket.', 'Quotes go stale (same freshness rule as ferries).'],
  },
  FERRY_BOOKING: {
    domain: 'travel',
    label: 'Ferry reservation',
    level: 'BOOKED',
    sources: ['travel_reservations (FERRY)', 'tool: book_ferry (simulated)'],
    doesNotProve: [
      'A booking does not mean the driver checked in or boarded.',
      'A booking on one sailing says nothing about space on another.',
    ],
  },
  TRAVEL_BOOKING: {
    domain: 'travel',
    label: 'Train or flight reservation',
    level: 'BOOKED',
    sources: ['travel_reservations (TRAIN, FLIGHT)'],
    doesNotProve: ['A ticket does not prove the driver travelled.'],
  },
  HOTEL_BOOKING: {
    domain: 'travel',
    label: 'Hotel reservation',
    level: 'BOOKED',
    sources: ['travel_reservations (HOTEL)'],
    doesNotProve: [
      'A hotel booking does not prove the driver stayed there or create an expense claim.',
    ],
  },
  GATE_SCAN: {
    domain: 'travel',
    label: 'Ferry terminal gate scan',
    level: 'OBSERVED',
    sources: ['ferry_terminal_events'],
    doesNotProve: [
      'A check-in scan is not boarding.',
      'Tracking near the terminal is not a gate scan.',
    ],
  },
  TRAVEL_REPORT: {
    domain: 'travel',
    label: 'Driver travel report',
    level: 'STATED',
    sources: [
      'travel_confirmations',
      'travel_reservations.boarding_confirmation = DRIVER_REPORTED',
    ],
    doesNotProve: ['A driver report is not a carrier or gate record.'],
  },
  BOOKING_OUTCOME_UNKNOWN: {
    domain: 'travel',
    label: 'Booking attempt with unknown outcome',
    level: 'OBSERVED',
    sources: ['agent_proposals (travel.book_* / travel.rebook) with execution FAILED'],
    doesNotProve: [
      'A booking timeout does not mean "not booked". Reconcile with the provider before any retry or alternative purchase.',
    ],
  },
  BOOKING_RECONCILED: {
    domain: 'travel',
    label: 'Provider reconciliation of an attempt',
    level: 'OBSERVED',
    sources: ['tool: reconcile_booking'],
    doesNotProve: ['Reconciliation covers the named attempt only.'],
  },
  TRAVEL_CANCELLED: {
    domain: 'travel',
    label: 'Provider-confirmed cancellation of a booking',
    level: 'BOOKED',
    sources: ['tool: cancel_travel'],
    doesNotProve: ['A cancellation does not prove a refund or that the replacement was used.'],
  },
  TRAVEL_AMENDMENT_REQUESTED: {
    domain: 'travel',
    label: 'Carrier amendment requested',
    level: 'REQUESTED',
    sources: ['travel_reservations.amendment_request'],
    doesNotProve: ['A request is not a confirmed change.'],
  },
  // dispatch
  OFFER_PUBLISHED: {
    domain: 'dispatch',
    label: 'Offer published to drivers',
    level: 'PLANNED',
    sources: ['market_offers'],
    doesNotProve: [
      'A published offer is not an assignment.',
      'Zero recorded views does not mean nobody saw it.',
    ],
  },
  OFFER_EXPOSURE: {
    domain: 'dispatch',
    label: 'Directed offer exposure',
    level: 'PLANNED',
    levelNote: 'SHOWN = PLANNED, NOTIFIED/VIEWED/REJECTED/EXPIRED = OBSERVED, ACCEPTED = BOOKED.',
    sources: ['market_offer_exposures'],
    doesNotProve: ['SHOWN means the exposure was created, not that the driver saw it.'],
  },
  DRIVER_ASSIGNED: {
    domain: 'dispatch',
    label: 'Driver assignment',
    level: 'BOOKED',
    sources: ['work_assignments'],
    doesNotProve: [
      'An assigned driver does not mean the car was collected.',
      'A chat message "I\'ll take it" creates no assignment.',
    ],
  },
  ASSIGNMENT_STARTED: {
    domain: 'dispatch',
    label: 'Assignment started in the driver app',
    level: 'OBSERVED',
    sources: ['work_assignments.started_at', 'operational_events (assignment.started)'],
    doesNotProve: ['Started is not collected.'],
  },
  ASSIGNMENT_CANCELLED: {
    domain: 'dispatch',
    label: 'Assignment cancelled',
    level: 'OBSERVED',
    sources: ['work_assignments.cancelled_at'],
    doesNotProve: ['PAYOUT_DUE is not paid.'],
  },
  POSITIONING_PLAN: {
    domain: 'dispatch',
    label: 'Positioning projection',
    level: 'PLANNED',
    sources: ['work_assignments.positioning'],
    doesNotProve: [
      'A planned release city and a tracking ETA are not the current location.',
      'Matching quotes are not purchased reservations.',
    ],
  },
  // location
  TRACKING_OBSERVATION: {
    domain: 'location',
    label: 'App tracking estimate',
    level: 'STATED',
    sources: ['tracking_observations'],
    doesNotProve: [
      'A coarse app estimate is not a verified location or a terminal ETA.',
      'Uploads can be late or stop; quiet does not mean safe.',
    ],
  },
  DRIVER_STATED_LIMIT: {
    domain: 'location',
    label: "Driver's own stated limit",
    level: 'STATED',
    sources: ['messages (driver), parsed', 'agent interpretation'],
    doesNotProve: ['"I can wait 30 minutes" is a statement, not a verified commitment.'],
  },
  // handover
  PICKUP_EVENT: {
    domain: 'handover',
    label: 'Pickup scan',
    level: 'OBSERVED',
    sources: ['operational_events (vehicle.picked_up)'],
    doesNotProve: [
      'A pickup scan proves the car left. It does not prove key count, who took the papers, or a CMR signature.',
      'It does not verify the entrance used or the contact.',
    ],
  },
  DELIVERY_EVENT: {
    domain: 'handover',
    label: 'Delivery scan',
    level: 'OBSERVED',
    sources: ['operational_events (vehicle.delivered)'],
    doesNotProve: ['A delivery scan does not prove a signed handover or who received the car.'],
  },
  PICKUP_ATTEMPT: {
    domain: 'handover',
    label: 'Site visit or pickup attempt',
    level: 'OBSERVED',
    sources: ['site_visits', 'operational_events (pickup.attempted)'],
    doesNotProve: ['A site visit is not a collection.'],
  },
  CUSTODY_REPORT: {
    domain: 'handover',
    label: 'Driver custody report',
    level: 'STATED',
    sources: ['custody_reports'],
    doesNotProve: ['A driver statement, not continuous observation of the car.'],
  },
  CUSTODY_ASSET: {
    domain: 'handover',
    label: 'Keys, papers or CMR custody',
    level: 'STATED',
    levelNote: 'VERIFIED only with a verified physical handover.',
    sources: ['custody_assets', 'custody_asset_events'],
    doesNotProve: ['A key count or holder is unknown unless a source establishes it.'],
  },
  PROOF: {
    domain: 'handover',
    label: 'Proof requirement or photos',
    level: 'OBSERVED',
    levelNote: 'REQUIRED = PLANNED, SUBMITTED/REJECTED = OBSERVED, APPROVED = VERIFIED.',
    sources: ['proofs'],
    doesNotProve: [
      'Photos show condition; they say nothing about when or by whom damage happened.',
      'A physical handover does not satisfy every proof requirement.',
    ],
  },
  VEHICLE_IDENTITY: {
    domain: 'handover',
    label: 'Vehicle on the order',
    level: 'STATED',
    sources: ['vehicles', 'order_items'],
    doesNotProve: ['A similar stock reference is not a VIN match.'],
  },
  // site
  ENDPOINT_ACCESS: {
    domain: 'site',
    label: 'Access instruction for this order',
    level: 'STATED',
    sources: ['order_endpoint_details'],
    doesNotProve: [
      'CONFIRMED from a site profile means a standard instruction existed when the order was created, not a call about this car.',
      "A contact on site cannot override the customer's instruction.",
    ],
  },
  ENDPOINT_CONTACT: {
    domain: 'site',
    label: 'Handover contact for this order',
    level: 'STATED',
    sources: ['order_endpoint_details'],
    doesNotProve: ['An access instruction can be CONFIRMED while the named contact is not.'],
  },
  ENDPOINT_CLAIM: {
    domain: 'site',
    label: 'Attributed claim about an endpoint',
    level: 'STATED',
    levelNote: 'VERIFIED when resolved as VERIFIED.',
    sources: ['endpoint_claims'],
    doesNotProve: ['A handoff contact reports; only the customer authorizes a change.'],
  },
  SITE_PROFILE: {
    domain: 'site',
    label: 'Site standing procedure',
    level: 'STATED',
    sources: ['sites'],
    doesNotProve: ['A site profile is the standard procedure, not an order-specific confirmation.'],
  },
  // documents
  DOCUMENT: {
    domain: 'documents',
    label: 'Document state',
    level: 'PLANNED',
    levelNote:
      'REQUESTED = REQUESTED, PREPARED/MISSING = PLANNED, SIGNED = OBSERVED, VERIFIED = VERIFIED.',
    sources: ['documents'],
    doesNotProve: [
      'A prepared CMR is not signed.',
      'SIGNED does not mean the receiver signed.',
      "BOTH means two marks exist, not that the receiver's name was verified.",
    ],
  },
  // messages
  DRIVER_STATEMENT: {
    domain: 'messages',
    label: 'Driver said',
    level: 'STATED',
    sources: ['messages (author driver)'],
    doesNotProve: [
      '"I\'ll be there at 14:00" is a statement, not a verified fact.',
      'A chat message creates no assignment.',
    ],
  },
  CUSTOMER_STATEMENT: {
    domain: 'messages',
    label: 'Customer said',
    level: 'STATED',
    sources: ['messages (author customer)'],
    doesNotProve: ['A customer request is not an executed change.'],
  },
  SITE_STATEMENT: {
    domain: 'messages',
    label: 'Site contact said',
    level: 'STATED',
    sources: ['messages (author site_contact)'],
    doesNotProve: ['A site reply about one car is not a rule for other cars at the site.'],
  },
  HANDOFF_STATEMENT: {
    domain: 'messages',
    label: 'Handoff contact said',
    level: 'STATED',
    sources: ['messages (author handoff_contact)'],
    doesNotProve: [
      "A handoff contact's message is a report, not authority over the customer's instruction.",
    ],
  },
  OPERATOR_MESSAGE: {
    domain: 'messages',
    label: 'Operator message sent',
    level: 'OBSERVED',
    sources: ['messages (author operator, PUBLIC)'],
    doesNotProve: ['Sent is not read or agreed.'],
  },
  OPERATOR_NOTE: {
    domain: 'messages',
    label: 'Internal operator note',
    level: 'STATED',
    sources: ['messages (internal_note)', 'order_notes'],
    doesNotProve: ['An internal interpretation, not independent proof.'],
  },
  AGENT_MESSAGE: {
    domain: 'messages',
    label: 'Agent message sent',
    level: 'OBSERVED',
    sources: ['messages (author agent)'],
    doesNotProve: ['An agent-authored message is not a customer or driver reply.'],
  },
  INBOX_MESSAGE: {
    domain: 'messages',
    label: 'Support inbox message',
    level: 'STATED',
    sources: ['support_inbox_messages'],
    doesNotProve: ['A candidate order match is not a confirmed link.'],
  },
  // alerts and work
  ALERT: {
    domain: 'alerts',
    label: 'Alert raised',
    level: 'STATED',
    sources: ['alerts'],
    doesNotProve: ['An alert is a reason to look, not a diagnosis.'],
  },
  ALERT_ACKNOWLEDGED: {
    domain: 'alerts',
    label: 'Alert acknowledged',
    level: 'OBSERVED',
    sources: ['alerts.acknowledged_at'],
    doesNotProve: ['ACKNOWLEDGED records that a person took notice, not that the risk is gone.'],
  },
  ALERT_RESOLVED: {
    domain: 'alerts',
    label: 'Alert resolved',
    level: 'OBSERVED',
    sources: ['alerts.resolved_at'],
    doesNotProve: ['A resolved alert covers that episode only.'],
  },
  INCIDENT: {
    domain: 'alerts',
    label: 'Incident opened',
    level: 'STATED',
    sources: ['incidents'],
    doesNotProve: ['Reported symptoms and stop locations stay unverified.'],
  },
  WORK_ITEM: {
    domain: 'alerts',
    label: 'Work item in the queue',
    level: 'PLANNED',
    sources: ['work_items'],
    doesNotProve: [
      'An owner does not mean anyone read it.',
      'due_at is a queue reminder, not a customer promise.',
    ],
  },
  // money
  EXPENSE: {
    domain: 'money',
    label: 'Expense claim',
    level: 'STATED',
    levelNote: 'SUBMITTED/SUPERSEDED = STATED, APPROVED/REJECTED = VERIFIED (a review decision).',
    sources: ['expenses'],
    doesNotProve: ['An approved expense does not mean money moved.', 'DKK is not EUR.'],
  },
  PAYOUT_DECISION: {
    domain: 'money',
    label: 'Cancellation payout decision',
    level: 'PLANNED',
    sources: ['work_assignments.cancellation_payout_decision'],
    doesNotProve: ['PAYOUT_DUE is not paid.'],
  },
  PAYMENT_RECORD: {
    domain: 'money',
    label: 'Payment or invoice record',
    level: 'OBSERVED',
    sources: ['tool: billing lookup (not in the packet)'],
    doesNotProve: ['A payment record covers its own amount and payee only.'],
  },
  // agents
  AGENT_PROPOSAL: {
    domain: 'agents',
    label: 'Agent proposal',
    level: 'REQUESTED',
    sources: ['agent_proposals'],
    doesNotProve: ['Proposal text proves nothing changed.'],
  },
  PROPOSAL_REVIEW: {
    domain: 'agents',
    label: 'Proposal review',
    level: 'OBSERVED',
    sources: ['agent_proposals.review'],
    doesNotProve: ['Approved is not executed.'],
  },
  PROPOSAL_EXECUTED: {
    domain: 'agents',
    label: 'Proposal executed',
    level: 'OBSERVED',
    sources: ['agent_proposals.execution (SUCCEEDED)'],
    doesNotProve: ['Read the effect event for what changed and who committed it.'],
  },
  EXECUTION_FAILED: {
    domain: 'agents',
    label: 'Proposal execution failed',
    level: 'OBSERVED',
    sources: ['agent_proposals.execution (FAILED)'],
    doesNotProve: ['After a failure the outcome may be unknown: reconcile first.'],
  },
  // order
  ORDER_STATUS: {
    domain: 'order',
    label: 'Order status',
    level: 'PLANNED',
    sources: ['orders'],
    doesNotProve: ['A lane or status is broad progress, not physical evidence.'],
  },
  // catch-alls for tools and people
  TOOL_RESULT: {
    domain: 'agents',
    label: 'Tool result',
    level: 'OBSERVED',
    sources: ['tool calls'],
    doesNotProve: ['A tool result is true for its query and time only.'],
  },
  OPERATOR_DECISION: {
    domain: 'agents',
    label: 'Operator decision or verification',
    level: 'VERIFIED',
    sources: ['card decisions'],
    doesNotProve: ['A decision covers only what it names.'],
  },
} as const satisfies Record<string, FactKindSpec>;

export type FactKind = keyof typeof FACT_KINDS;

export function isFactKind(kind: string): kind is FactKind {
  return kind in FACT_KINDS;
}

export function factKindSpec(kind: string): FactKindSpec | null {
  return isFactKind(kind) ? FACT_KINDS[kind] : null;
}

// One way to satisfy a claim: a fact of one of these kinds, at or above minLevel, whose value fields match `where`.
export type EvidenceRequirement = {
  kinds: FactKind[];
  minLevel: EvidenceLevel;
  where?: Record<string, readonly (string | boolean | number)[]>;
  maxAgeMinutes?: number;
};

export type ClaimSpec = {
  domain: Domain;
  label: string;
  anyOf: EvidenceRequirement[];
  agentMayAssert: boolean;
  note?: string;
};

export const CLAIM_KINDS = {
  BOOKED_CAPACITY: {
    domain: 'travel',
    label: 'Space is booked on this sailing or train',
    anyOf: [
      {
        kinds: ['FERRY_BOOKING', 'TRAVEL_BOOKING'],
        minLevel: 'BOOKED',
        where: { status: ['BOOKED'] },
      },
    ],
    agentMayAssert: true,
  },
  CAPACITY_AVAILABLE: {
    domain: 'travel',
    label: 'Space is available now',
    anyOf: [
      { kinds: ['FERRY_QUOTE', 'TRAVEL_QUOTE'], minLevel: 'QUOTED', maxAgeMinutes: 90 },
      {
        kinds: ['FERRY_BOOKING', 'TRAVEL_BOOKING'],
        minLevel: 'BOOKED',
        where: { status: ['BOOKED'] },
      },
    ],
    agentMayAssert: true,
    note: 'Only a quote checked within the freshness limit counts.',
  },
  NOT_BOOKED: {
    domain: 'travel',
    label: 'No booking exists',
    anyOf: [{ kinds: ['BOOKING_RECONCILED'], minLevel: 'OBSERVED' }],
    agentMayAssert: true,
    note: 'After a timed-out attempt only a provider reconciliation proves "not booked".',
  },
  HOTEL_BOOKED: {
    domain: 'travel',
    label: 'Hotel is booked',
    anyOf: [{ kinds: ['HOTEL_BOOKING'], minLevel: 'BOOKED' }],
    agentMayAssert: true,
  },
  CHECKED_IN: {
    domain: 'travel',
    label: 'Car checked in at the terminal',
    anyOf: [
      { kinds: ['GATE_SCAN'], minLevel: 'OBSERVED', where: { scanKind: ['CHECK_IN_ACCEPTED'] } },
    ],
    agentMayAssert: true,
  },
  BOARDED: {
    domain: 'travel',
    label: 'Car boarded the ferry',
    anyOf: [
      {
        kinds: ['GATE_SCAN'],
        minLevel: 'OBSERVED',
        where: { scanKind: ['BOARDED', 'BOARDING_CONFIRMED'] },
      },
      {
        kinds: ['OPERATOR_DECISION'],
        minLevel: 'VERIFIED',
        where: { decision: ['BOARDING_VERIFIED'] },
      },
    ],
    agentMayAssert: true,
    note: 'Tracking, a booking or a check-in scan never proves boarding.',
  },
  DRIVER_REPORTED_TRAVEL: {
    domain: 'travel',
    label: 'Driver reports travelling (as a report)',
    anyOf: [{ kinds: ['TRAVEL_REPORT', 'DRIVER_STATEMENT'], minLevel: 'STATED' }],
    agentMayAssert: true,
  },
  ASSIGNED: {
    domain: 'dispatch',
    label: 'A driver is assigned',
    anyOf: [
      {
        kinds: ['DRIVER_ASSIGNED'],
        minLevel: 'BOOKED',
        where: { status: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] },
      },
    ],
    agentMayAssert: true,
  },
  OFFER_ACCEPTED: {
    domain: 'dispatch',
    label: 'The driver accepted the offer',
    anyOf: [
      { kinds: ['OFFER_EXPOSURE'], minLevel: 'BOOKED', where: { status: ['ACCEPTED'] } },
      { kinds: ['DRIVER_ASSIGNED'], minLevel: 'BOOKED' },
    ],
    agentMayAssert: true,
  },
  OFFER_SEEN: {
    domain: 'dispatch',
    label: 'The driver saw the offer',
    anyOf: [
      {
        kinds: ['OFFER_EXPOSURE'],
        minLevel: 'OBSERVED',
        where: { status: ['VIEWED', 'ACCEPTED', 'REJECTED'] },
      },
    ],
    agentMayAssert: true,
  },
  DRIVER_REPORTED_LOCATION: {
    domain: 'location',
    label: 'Driver reports a location or ETA (as a report)',
    anyOf: [
      { kinds: ['DRIVER_STATEMENT', 'TRACKING_OBSERVATION', 'CUSTODY_REPORT'], minLevel: 'STATED' },
    ],
    agentMayAssert: true,
  },
  DRIVER_LOCATION_VERIFIED: {
    domain: 'location',
    label: 'Driver location verified',
    anyOf: [
      {
        kinds: ['GATE_SCAN', 'PICKUP_EVENT', 'DELIVERY_EVENT', 'PICKUP_ATTEMPT'],
        minLevel: 'OBSERVED',
      },
      { kinds: ['OPERATOR_DECISION'], minLevel: 'VERIFIED' },
    ],
    agentMayAssert: true,
    note: 'Only at the moment of the scan; a planned release city or ETA never counts.',
  },
  DRIVER_CONFIRMED_AVAILABLE: {
    domain: 'dispatch',
    label: 'Driver says they can do the job (as a report)',
    anyOf: [{ kinds: ['DRIVER_STATEMENT'], minLevel: 'STATED' }],
    agentMayAssert: true,
  },
  PICKED_UP: {
    domain: 'handover',
    label: 'The car was collected',
    anyOf: [{ kinds: ['PICKUP_EVENT'], minLevel: 'OBSERVED' }],
    agentMayAssert: true,
  },
  DELIVERED: {
    domain: 'handover',
    label: 'The car was delivered',
    anyOf: [{ kinds: ['DELIVERY_EVENT'], minLevel: 'OBSERVED' }],
    agentMayAssert: true,
  },
  KEYS_HANDED_OVER: {
    domain: 'handover',
    label: 'Keys were handed over',
    anyOf: [
      { kinds: ['CUSTODY_ASSET'], minLevel: 'VERIFIED' },
      {
        kinds: ['PROOF'],
        minLevel: 'VERIFIED',
        where: { proofKind: ['KEY_PICKUP_PHOTOS', 'KEY_DELIVERY_PHOTOS'] },
      },
    ],
    agentMayAssert: true,
  },
  CONDITION_DOCUMENTED: {
    domain: 'handover',
    label: 'Condition photos exist',
    anyOf: [{ kinds: ['PROOF'], minLevel: 'OBSERVED' }],
    agentMayAssert: true,
  },
  DAMAGE_ATTRIBUTED: {
    domain: 'handover',
    label: 'Who or what caused damage',
    anyOf: [
      { kinds: ['OPERATOR_DECISION'], minLevel: 'VERIFIED', where: { decision: ['LIABILITY'] } },
    ],
    agentMayAssert: false,
    note: "Liability is never the agent's call (G4).",
  },
  DOCUMENT_SIGNED: {
    domain: 'documents',
    label: 'A document carries a signature',
    anyOf: [{ kinds: ['DOCUMENT'], minLevel: 'OBSERVED' }],
    agentMayAssert: true,
  },
  RECEIVER_SIGNED: {
    domain: 'documents',
    label: 'The receiver signed',
    anyOf: [
      { kinds: ['DOCUMENT'], minLevel: 'VERIFIED', where: { docKind: ['SIGNED_HANDOVER', 'CMR'] } },
    ],
    agentMayAssert: true,
    note: 'SIGNED or BOTH marks are not enough; the document must be VERIFIED.',
  },
  CUSTOMER_APPROVED_PROMISE: {
    domain: 'time',
    label: 'The customer agreed the promise',
    anyOf: [
      { kinds: ['PROMISE_WINDOW'], minLevel: 'BOOKED' },
      { kinds: ['CUSTOMER_APPROVAL'], minLevel: 'OBSERVED' },
    ],
    agentMayAssert: true,
  },
  PROMISE_CHANGED: {
    domain: 'time',
    label: 'The promise changed',
    anyOf: [{ kinds: ['CUSTOMER_APPROVAL'], minLevel: 'OBSERVED' }],
    agentMayAssert: true,
    note: 'Only with recorded customer approval (G6).',
  },
  SLOT_AGREED: {
    domain: 'time',
    label: 'The slot is agreed by the site or customer',
    anyOf: [
      { kinds: ['SLOT_WINDOW'], minLevel: 'BOOKED' },
      { kinds: ['CUSTOMER_APPROVAL'], minLevel: 'OBSERVED' },
    ],
    agentMayAssert: true,
  },
  ACCESS_CONFIRMED: {
    domain: 'site',
    label: 'Access is confirmed for this car',
    anyOf: [
      {
        kinds: ['ENDPOINT_ACCESS'],
        minLevel: 'STATED',
        where: { orderSpecific: [true], accessStatus: ['CONFIRMED'] },
      },
      { kinds: ['SITE_STATEMENT'], minLevel: 'STATED' },
    ],
    agentMayAssert: true,
    note: 'A site-profile CONFIRMED is not an order-specific confirmation.',
  },
  RECEIVER_CONFIRMED: {
    domain: 'site',
    label: 'The receiver is confirmed',
    anyOf: [
      {
        kinds: ['ENDPOINT_CONTACT'],
        minLevel: 'STATED',
        where: { orderSpecific: [true], contactStatus: ['CONFIRMED'] },
      },
      { kinds: ['ENDPOINT_CLAIM'], minLevel: 'VERIFIED' },
    ],
    agentMayAssert: true,
  },
  SIGNAL_RESTORED: {
    domain: 'location',
    label: 'Tracking signal restored',
    anyOf: [{ kinds: ['TRACKING_OBSERVATION'], minLevel: 'STATED' }],
    agentMayAssert: true,
    note: 'Closes the connectivity gap only; never upgrades boarding or location claims.',
  },
  RISK_RESOLVED: {
    domain: 'alerts',
    label: 'The alert episode is resolved',
    anyOf: [{ kinds: ['ALERT_RESOLVED'], minLevel: 'OBSERVED' }],
    agentMayAssert: true,
    note: 'Acknowledged is not resolved.',
  },
  EXPENSE_APPROVED: {
    domain: 'money',
    label: 'The expense claim is approved',
    anyOf: [{ kinds: ['EXPENSE'], minLevel: 'VERIFIED', where: { status: ['APPROVED'] } }],
    agentMayAssert: true,
  },
  PAID: {
    domain: 'money',
    label: 'Money was paid',
    anyOf: [{ kinds: ['PAYMENT_RECORD'], minLevel: 'OBSERVED' }],
    agentMayAssert: true,
    note: 'Approved or PAYOUT_DUE is not paid; the packet has no payment ledger.',
  },
  INVOICE_ISSUED: {
    domain: 'money',
    label: 'An invoice was issued',
    anyOf: [
      { kinds: ['PAYMENT_RECORD'], minLevel: 'OBSERVED', where: { recordKind: ['INVOICE'] } },
    ],
    agentMayAssert: true,
  },
  CHANGE_EXECUTED: {
    domain: 'agents',
    label: 'A proposed change was executed',
    anyOf: [{ kinds: ['PROPOSAL_EXECUTED'], minLevel: 'OBSERVED' }],
    agentMayAssert: true,
    note: 'Approved is not executed.',
  },
} as const satisfies Record<string, ClaimSpec>;

export type ClaimKind = keyof typeof CLAIM_KINDS;

export function isClaimKind(kind: string): kind is ClaimKind {
  return kind in CLAIM_KINDS;
}

// Damir's ladder per domain, bottom → top, plus the rules that keep the rungs apart.
export type LadderChain = { domain: Domain; title: string; rungs: string[]; rules: string[] };

export const LADDER_CHAINS: LadderChain[] = [
  {
    domain: 'travel',
    title: 'Ferry and driver travel',
    rungs: ['quote', 'booking', 'gate scan', 'boarding'],
    rules: [
      'A quote does not mean space exists now; it goes stale.',
      'A booking does not mean the driver boarded.',
      'Tracking near the terminal is not a gate scan.',
      'A booking timeout does not mean "not booked"; reconcile first.',
    ],
  },
  {
    domain: 'dispatch',
    title: 'Driver to job',
    rungs: [
      'chat "I\'ll take it"',
      'offer published',
      'shown',
      'delivered',
      'viewed',
      'accepted',
      'assignment',
    ],
    rules: [
      'A chat message creates no assignment.',
      'SHOWN means the offer was created, not that the driver saw it.',
    ],
  },
  {
    domain: 'location',
    title: 'Driver location',
    rungs: ['planned release city / tracking ETA', 'driver statement', 'scan at a known place'],
    rules: [
      'A planned release city and a tracking ETA are not the current location.',
      '"I\'ll be there at 14:00" is a statement, not a verified fact.',
    ],
  },
  {
    domain: 'handover',
    title: 'Car and handover',
    rungs: [
      'driver assigned',
      'pickup scan',
      'keys / papers / CMR evidence',
      'delivery scan',
      'signed handover',
    ],
    rules: [
      'An assigned driver does not mean the car was collected.',
      'A pickup scan proves the car left. It does not prove key count, who took papers, or a CMR signature.',
      'Photos show condition; they say nothing about when or by whom damage happened.',
    ],
  },
  {
    domain: 'time',
    title: 'Time',
    rungs: ['requested slot', 'selected by system or operator', 'agreed by customer or site'],
    rules: [
      'A requested slot is a wish, not an agreement.',
      'A window selected by the system or an operator is not customer approval.',
      'ETA, target window and hard deadline are three different things.',
    ],
  },
  {
    domain: 'site',
    title: 'Site and access',
    rungs: ['site profile', 'order-specific reply', 'verified'],
    rules: [
      'CONFIRMED from a site profile means a standard instruction existed when the order was created, not a call about this car.',
      "A contact on site can't override the customer's instruction.",
    ],
  },
  {
    domain: 'documents',
    title: 'Documents',
    rungs: ['prepared', 'signed', 'both marks', 'verified receiver'],
    rules: [
      'A prepared CMR is not signed.',
      'SIGNED does not mean the receiver signed.',
      "BOTH means two marks exist, not that the receiver's name was verified.",
    ],
  },
  {
    domain: 'alerts',
    title: 'Alerts and work',
    rungs: ['alert', 'acknowledged', 'resolved'],
    rules: [
      'An alert is a reason to look, not a diagnosis.',
      'ACKNOWLEDGED does not mean the risk is gone.',
      'An owner does not mean anyone read it.',
    ],
  },
  {
    domain: 'money',
    title: 'Money',
    rungs: ['submitted', 'approved', 'paid (record outside the packet)'],
    rules: [
      'An approved expense does not mean money moved.',
      'PAYOUT_DUE is not "paid".',
      'DKK is not EUR.',
    ],
  },
  {
    domain: 'agents',
    title: 'Agents',
    rungs: ['proposal', 'approved', 'executed'],
    rules: [
      'Proposal text proves nothing changed.',
      'Approved is not executed.',
      'After a failure, reconcile first.',
    ],
  },
  {
    domain: 'absence',
    title: 'Absence',
    rungs: [],
    rules: [
      'Null and empty fields carry meaning: "not supplied" is not "none".',
      'Zero views does not mean nobody saw the offer.',
      'Quiet does not mean safe.',
    ],
  },
];
