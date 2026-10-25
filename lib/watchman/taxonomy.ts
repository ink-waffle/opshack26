// Closed list of watchman trigger types, aligned with playbooks P1–P18 (research/decision-tree/decision_tree.md §5).

export const TRIGGER_TYPES = [
  'CROSSING_CAPACITY',
  'TRAVEL_LEG_LOST',
  'CROSSING_AT_RISK',
  'GATE_REJECTED',
  'DRIVER_CANNOT_MAKE_PICKUP',
  'PICKUP_NOT_CONFIRMED',
  'VEHICLE_WARNING',
  'SIGNAL_GAP',
  'VEHICLE_NOT_AT_PICKUP',
  'RELEASE_BLOCKED',
  'INTAKE_INPUT_MISSING',
  'RECEIVER_DELIVERY_ACCESS',
  'PROMISE_AT_RISK',
  'EVIDENCE_DEFECT',
  'CONDITION_CLAIM',
  'CUSTODY_QUESTION',
  'CANCELLATION',
  'OFFER_UNFILLED',
  'MONEY_QUERY',
  'INFO_REQUEST',
  'DATA_CONFLICT',
  'ROUTINE',
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

export type TriggerDefinition = {
  id: TriggerType;
  // Research playbook this trigger maps to (P1–P18), or null for the two cross-cutting types.
  researchPlaybook: string | null;
  label: string;
  // Criteria text for Jev: when the trigger applies and when it does not.
  applies: string;
  doesNotApply: string;
};

export const TRIGGERS: Record<TriggerType, TriggerDefinition> = {
  CROSSING_CAPACITY: {
    id: 'CROSSING_CAPACITY',
    researchPlaybook: 'P1',
    label: 'Ferry sold out, booking failed or sailing missed',
    applies:
      'The ferry crossing this order needs has no space (sold out, full, no vehicle deck), a booking attempt failed or its outcome is unknown, nobody can show a ferry booking reference, or the car has already missed its sailing.',
    doesNotApply:
      'Crossings are booked and nobody reports a capacity, booking or missed-sailing problem; or the order has no ferry leg.',
  },
  TRAVEL_LEG_LOST: {
    id: 'TRAVEL_LEG_LOST',
    researchPlaybook: 'P1',
    label: 'Booked train, flight, bus or hotel lost',
    applies:
      'A booked train, flight, bus or hotel of the driver can no longer be used: missed, cancelled by the provider, or delayed past the next connection, and the driver can still do the job with new travel.',
    doesNotApply:
      'Every booked leg still works; the lost leg is the ferry crossing (that is CROSSING_CAPACITY); or the driver cannot or will not do the job at all (that is DRIVER_CANNOT_MAKE_PICKUP).',
  },
  CROSSING_AT_RISK: {
    id: 'CROSSING_AT_RISK',
    researchPlaybook: 'P2',
    label: 'Booked crossing may miss its check-in cutoff',
    applies:
      'A ferry IS booked, but the car may not reach the check-in gate before the cutoff: queue, traffic, late start, "may not make it", or the cutoff is close with no gate check-in.',
    doesNotApply:
      'No ferry is booked, the car is already checked in or on board, or the sailing is already missed or sold out (that is CROSSING_CAPACITY).',
  },
  GATE_REJECTED: {
    id: 'GATE_REJECTED',
    researchPlaybook: 'P3',
    label: 'Ferry gate rejected the check-in',
    applies:
      'The ferry terminal gate refused the car: arrived after the cutoff, manifest or registration mismatch, wrong booking details.',
    doesNotApply: 'No gate refusal is reported or recorded.',
  },
  DRIVER_CANNOT_MAKE_PICKUP: {
    id: 'DRIVER_CANNOT_MAKE_PICKUP',
    researchPlaybook: 'P4',
    label: 'Driver cannot make the pickup',
    applies:
      'The assigned driver cannot or will not do the job: unwell, needs rest, unreachable, refuses, conflicting earlier duty, or cannot reach the pickup by any travel.',
    doesNotApply:
      'The driver is on track for the pickup, the pickup is already done, or only a booked train, flight, bus or hotel was lost and new travel solves it (that is TRAVEL_LEG_LOST).',
  },
  PICKUP_NOT_CONFIRMED: {
    id: 'PICKUP_NOT_CONFIRMED',
    researchPlaybook: 'P4',
    label: 'Pickup slot passed without a confirmed pickup',
    applies:
      'The selected pickup slot has started or ended, but there is no pickup event and nobody (driver or site) has confirmed the car was collected or the driver is there.',
    doesNotApply:
      'The pickup slot is still in the future, or a pickup event or a driver/site confirmation of collection exists.',
  },
  VEHICLE_WARNING: {
    id: 'VEHICLE_WARNING',
    researchPlaybook: 'P5',
    label: 'Warning light, breakdown or accident',
    applies:
      'The car shows a warning light or fault, makes a noise, smokes, will not start or charge, wrong fuel, a breakdown, or an accident during the move.',
    doesNotApply: 'Nobody reports a technical problem, fault or accident with the car being moved.',
  },
  SIGNAL_GAP: {
    id: 'SIGNAL_GAP',
    researchPlaybook: 'P6',
    label: 'Tracking stale or missing',
    applies:
      'A moving car has no recent tracking observation (none, or older than about 3 hours) and no fresh driver word.',
    doesNotApply: 'Tracking is fresh, or the car is not moving yet or already delivered.',
  },
  VEHICLE_NOT_AT_PICKUP: {
    id: 'VEHICLE_NOT_AT_PICKUP',
    researchPlaybook: 'P7',
    label: 'Car not found or VIN mismatch at pickup',
    applies:
      'The driver or site cannot find the car at the pickup place, the car is not in the release list, or the VIN or plate does not match the order.',
    doesNotApply: 'The car is present and matches the order, or nobody is at the pickup yet.',
  },
  RELEASE_BLOCKED: {
    id: 'RELEASE_BLOCKED',
    researchPlaybook: 'P8',
    label: 'Release blocked: keys, access, papers, hold or car not ready',
    applies:
      'The pickup site or customer reports keys missing, gate or access problems, release document missing, a seller or stock hold, "do not send a driver", or the car not ready on the planned date.',
    doesNotApply: 'Release and access are clear or not discussed.',
  },
  INTAKE_INPUT_MISSING: {
    id: 'INTAKE_INPUT_MISSING',
    researchPlaybook: 'P9',
    label: 'Order input missing or conflicting',
    applies:
      'The triggering item says a VIN, contact, street address or other order input is missing, wrong or conflicting, supplies one, or asks for one.',
    doesNotApply:
      'The item does not raise order inputs. Missing or unconfirmed fields that are only visible in the records do not count.',
  },
  RECEIVER_DELIVERY_ACCESS: {
    id: 'RECEIVER_DELIVERY_ACCESS',
    researchPlaybook: 'P10',
    label: 'Receiver or delivery access unclear',
    applies:
      'Who receives the car at delivery is unknown, changed or absent; delivery hours or access are in question; someone other than the customer claims authority to change the handover.',
    doesNotApply: 'The receiver and delivery access are confirmed or not discussed.',
  },
  PROMISE_AT_RISK: {
    id: 'PROMISE_AT_RISK',
    researchPlaybook: 'P11',
    label: 'Delivery promise at risk or being changed',
    applies:
      'The car will likely arrive after the promised delivery window, someone says it will miss the slot, or a new delivery date is requested or proposed.',
    doesNotApply: 'The promise is expected to hold and nobody proposes changing it.',
  },
  EVIDENCE_DEFECT: {
    id: 'EVIDENCE_DEFECT',
    researchPlaybook: 'P12',
    label: 'Proof or document missing or rejected',
    applies:
      'Photos or proof were rejected or are wrong, a signed handover or CMR document is missing, or someone asks for a document or proof.',
    doesNotApply: 'Proofs and documents are not in question.',
  },
  CONDITION_CLAIM: {
    id: 'CONDITION_CLAIM',
    researchPlaybook: 'P13',
    label: 'Damage or mark reported',
    applies:
      'Someone reports damage, a scratch, dent or mark on the car, or disputes its condition.',
    doesNotApply: 'Nobody reports damage or disputes the condition.',
  },
  CUSTODY_QUESTION: {
    id: 'CUSTODY_QUESTION',
    researchPlaybook: 'P14',
    label: 'Overnight, key or third-party custody question',
    applies:
      'Where the car or keys stay overnight, handing car or keys to a hotel, another branch or a third party, or an overnight stop with the car.',
    doesNotApply: 'Custody of the car and keys is not discussed.',
  },
  CANCELLATION: {
    id: 'CANCELLATION',
    researchPlaybook: 'P15',
    label: 'Customer cancels',
    applies: 'The customer cancels the order or asks to cancel or stop the move.',
    doesNotApply: 'Nobody cancels or asks to cancel.',
  },
  OFFER_UNFILLED: {
    id: 'OFFER_UNFILLED',
    researchPlaybook: 'P16',
    label: 'Offer unbooked or fee request',
    applies:
      'A driver offer is still unbooked near its cutoff, or a driver asks for a higher fee or different terms before taking the job.',
    doesNotApply: 'The job is booked and nobody negotiates the fee.',
  },
  MONEY_QUERY: {
    id: 'MONEY_QUERY',
    researchPlaybook: 'P17',
    label: 'Invoice, expense or payout question',
    applies:
      'An invoice, receipt, expense claim, reimbursement or driver payout is asked about or disputed.',
    doesNotApply: 'Money is not discussed.',
  },
  INFO_REQUEST: {
    id: 'INFO_REQUEST',
    researchPlaybook: 'P18',
    label: 'Status or information request',
    applies:
      'Someone asks for status, ETA, document state, which job or instructions, and the answer can come from the records; or an instruction is ambiguous.',
    doesNotApply:
      'No question is asked, or the question is about a problem covered by another trigger.',
  },
  DATA_CONFLICT: {
    id: 'DATA_CONFLICT',
    researchPlaybook: null,
    label: 'Records or statements contradict each other or are stale',
    applies:
      'The triggering item contradicts a record or an earlier statement (including an explicit correction), or it depends on a record that is stale (an old quote, old tracking, an unconfirmed claim).',
    doesNotApply:
      'The item agrees with the records and earlier statements, or adds new information that does not contradict anything.',
  },
  ROUTINE: {
    id: 'ROUTINE',
    researchPlaybook: null,
    label: 'Routine, nothing to do',
    applies:
      'A routine update, acknowledgement, thanks, or confirmation that things are on plan; nobody needs to act beyond reading it.',
    doesNotApply: 'Something needs checking, an answer, a decision or a change.',
  },
};

export function isTriggerType(value: string): value is TriggerType {
  return (TRIGGER_TYPES as readonly string[]).includes(value);
}

export const CLAIM_TYPES = ['REPORT', 'REQUEST', 'INSTRUCTION', 'CORRECTION', 'ROUTINE'] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];
