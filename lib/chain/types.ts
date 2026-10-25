import type { ActionClass } from '@/lib/gate/actions';

export type ChainParameters = {
  defaultArrivalRoadHours: number;
  earlyCustodyHours: number;
  overnightWaitHours: number;
  nextDutyMinGapHours: number;
  roadSpeedKmh: number;
  dailyDrivingHours: number;
  dailyRestHours: number;
  quoteBlockMinutes: number;
  quoteWarnMinutes: number;
};

export const DEFAULT_CHAIN_PARAMETERS: ChainParameters = {
  defaultArrivalRoadHours: 3,
  earlyCustodyHours: 12,
  overnightWaitHours: 8,
  nextDutyMinGapHours: 4,
  roadSpeedKmh: 70,
  dailyDrivingHours: 9,
  dailyRestHours: 11,
  quoteBlockMinutes: 90,
  quoteWarnMinutes: 60,
};

export type TravelMode = 'FERRY' | 'TRAIN' | 'FLIGHT' | 'BUS';

// A sailing or train that is not (only) a bahn record, e.g. a tool search result.
export type QuoteInput = {
  mode: TravelMode;
  provider?: string | null;
  fromCity: string;
  toCity: string;
  departureAt: Date;
  arrivalAt: Date;
  checkInCutoffAt?: Date | null;
  checkedAt: Date;
  priceCents?: number | null;
  currency?: string | null;
  roadTimeToTerminalHours?: number | null;
  arrivalRoadHours?: number | null;
  localTransferHours?: number | null;
  capacityNote?: string | null;
  ref?: string | null;
  factId?: string | null;
};

export type ChainOption =
  | { type: 'NO_CHANGE'; assignmentId?: string }
  | {
      type: 'NEW_SAILING';
      travelOptionId?: string;
      factId?: string;
      quote?: QuoteInput;
      assignmentId?: string;
    }
  | {
      type: 'NEW_TRAIN';
      travelOptionId?: string;
      factId?: string;
      quote?: QuoteInput;
      assignmentId?: string;
    }
  | {
      type: 'HOTEL_NIGHTS';
      nights: number;
      city?: string;
      costCents?: number | null;
      currency?: string;
      assignmentId?: string;
    }
  | { type: 'MOVE_PICKUP_SLOT'; startAt: Date; endAt: Date; assignmentId?: string }
  | { type: 'REPLACE_DRIVER'; driverId: string; assignmentId?: string }
  | { type: 'EARLY_DELIVERY'; startAt: Date; endAt: Date; assignmentId?: string };

export type ChainOptionType = ChainOption['type'];

export type PromiseVerdict = 'holds' | 'early' | 'breaks' | 'unknown';

export type PromiseDelta = {
  windowId: string | null;
  factId: string | null;
  purpose: string | null;
  startAt: Date | null;
  endAt: Date | null;
  timezone: string | null;
  local: string | null;
  source: string | null;
  customerAgreed: boolean;
  hardDeadlineAt: Date | null;
  etaAt: Date | null;
  etaLocal: string | null;
  etaBasis: string;
  slackHours: number | null;
  earlyHours: number | null;
  verdict: PromiseVerdict;
  keepsPromise: boolean | null;
  custodyNights: number;
};

export type DecideByKind =
  | 'FIRST_PAID_DEPARTURE'
  | 'FERRY_CUTOFF'
  | 'POSITIONING_PURCHASE'
  | 'DRIVER_STATED_LIMIT'
  | 'SLOT_START'
  | 'OPTION_CUTOFF'
  | 'OPTION_DEPARTURE';

export type DecideBy = {
  at: Date;
  local: string;
  kind: DecideByKind;
  reason: string;
  label: string;
  factId: string | null;
};

export type DutyRef = {
  assignmentId: string;
  orderId: string;
  orderRef: string | null;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
  startCity: string | null;
  endCity: string | null;
};

export type DriverChainDelta = {
  driverId: string;
  previous: DutyRef | null;
  current: DutyRef | null;
  next: DutyRef | null;
  gapBeforeHours: number | null;
  gapAfterHours: number | null;
  positioningRecord: {
    factId: string;
    previousAssignmentId: string | null;
    previousOrderId: string | null;
    plannedReleaseCity: string | null;
  } | null;
  flags: { positioning_record_mismatch: boolean; next_duty_at_risk: boolean };
  notes: string[];
};

export type BookingDelta = {
  mode: string;
  ref: string | null;
  factId: string | null;
  description: string;
  departureAt: Date | null;
  costCents: number | null;
  currency: string | null;
  quoteAgeMinutes?: number | null;
  quoteFreshness?: 'fresh' | 'warn' | 'stale';
  refundability?: 'unknown' | 'known';
  nights?: number;
};

export type CostLine = { label: string; cents: number | null; currency: string; known: boolean };

export type CostDelta = {
  eurCents: number;
  lines: CostLine[];
  unknown: string[];
  nonEur: string[];
};

export type NotifyItem = {
  party: 'driver' | 'site' | 'customer' | 'other_driver' | 'provider';
  mode: 'auto' | 'draft';
  reason: string;
};

export type ChainResult = {
  option: ChainOption;
  label: string;
  feasible: boolean;
  promise: PromiseDelta;
  decideBy: DecideBy | null;
  decideByCandidates: DecideBy[];
  driverChain: DriverChainDelta | null;
  bookings: { create: BookingDelta[]; cancel: BookingDelta[]; keep: BookingDelta[] };
  cost: CostDelta;
  approvals: ActionClass[];
  notify: NotifyItem[];
  locks: string[];
  warnings: string[];
};
