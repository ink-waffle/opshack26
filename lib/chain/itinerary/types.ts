import {
  type ChainParameters,
  DEFAULT_CHAIN_PARAMETERS,
  type PromiseDelta,
  type QuoteInput,
  type TravelMode,
} from '@/lib/chain/types';

export type ItineraryParameters = ChainParameters & {
  // Minimum time between being ready in a place and the boarding deadline of the next departure from it.
  transferBufferHours: number;
  // Car handover at the pickup and at the delivery.
  handoverHours: number;
  // Local night window (hours, wraps midnight) used for overnight stays and hotel nights.
  nightStartHour: number;
  nightEndHour: number;
  // A stay overlapping the night window at least this long needs a bed.
  overnightMinHours: number;
};

export const DEFAULT_ITINERARY_PARAMETERS: ItineraryParameters = {
  ...DEFAULT_CHAIN_PARAMETERS,
  transferBufferHours: 0.5,
  handoverHours: 0.5,
  nightStartHour: 22,
  nightEndHour: 6,
  overnightMinHours: 4,
};

// A city, or a ferry terminal resolved to its city when the terminal is on record.
export type ItineraryPlace = { label: string; city: string | null };

export type ItineraryLegKind = TravelMode | 'HOTEL';

export type ItineraryLegStatus = 'keep' | 'new' | 'cancel';

// unreachable: elsewhere or with the car at departure; missed: there, but after boarding; redundant: not needed.
export type ItineraryVerdict = 'ok' | 'unreachable' | 'missed' | 'redundant' | 'cancelled';

export type ItineraryLeg = {
  // keep/cancel: reservation id; new: quote ref (travel option id or tool source ref).
  ref: string | null;
  // keep/cancel: the booking fact id; new: the quote fact id.
  factId: string | null;
  kind: ItineraryLegKind;
  description: string;
  from: ItineraryPlace;
  to: ItineraryPlace;
  // Hotels: check-in and check-out.
  departureAt: Date;
  arrivalAt: Date;
  // Hotels: local dates ('YYYY-MM-DD') of the nights covered; [] for travel.
  nights: string[];
  status: ItineraryLegStatus;
  verdict: ItineraryVerdict;
  reason: string;
  // A broken booked leg that a new leg takes over (explicitly or same mode family and route): that leg's ref or fact id.
  replacedBy: string | null;
};

export type HotelStayInput = {
  city: string;
  checkInAt: Date;
  checkOutAt: Date;
  ref?: string | null;
  factId?: string | null;
};

// replaces: reservation ids or booking fact ids this leg takes over (route matches are found automatically).
export type ItineraryNewLeg =
  | { source: 'fact'; factId: string; replaces?: string[] }
  | { source: 'option'; travelOptionId: string; replaces?: string[] }
  | { source: 'quote'; quote: QuoteInput; replaces?: string[] }
  | { source: 'hotel'; hotel: HotelStayInput; replaces?: string[] };

export type ItineraryChangeSet = {
  add?: ItineraryNewLeg[];
  // Reservation ids or their booking fact ids.
  cancel?: string[];
  pickupSlot?: { startAt: Date; endAt: Date } | null;
  deliveryWindow?: { startAt: Date; endAt: Date } | null;
};

// Where the driver is known to be (e.g. from chat); legs departing before `at` are judged against it.
export type ItineraryStart = { city: string; at: Date };

export type ItineraryGapKind =
  | 'UNRESOLVED_LEG'
  | 'PICKUP_UNREACHABLE'
  | 'FERRY_CUTOFF'
  | 'NO_CROSSING'
  | 'DELIVERY_LATE'
  | 'RETURN_BEFORE_DELIVERY'
  | 'NEXT_DUTY_UNREACHABLE';

export type ItineraryGap = {
  kind: ItineraryGapKind;
  at: Date | null;
  city: string | null;
  // The leg the gap is about, when there is one (ref or fact id).
  legRef: string | null;
  message: string;
};

// hold: with the car waiting for the delivery window (custody nights are a cost decision, not a gap).
export type ItineraryActivity =
  'wait' | 'travel' | 'pickup' | 'drive' | 'sail' | 'hold' | 'deliver';

// Where the driver is over time; a wait with two places is a road leg whose overnight can be at either end.
export type ItinerarySegment = {
  activity: ItineraryActivity;
  places: ItineraryPlace[];
  from: Date;
  to: Date | null;
  withCar: boolean;
  legRef: string | null;
  // What the driver is doing, as it reads after "the driver is": 'in Munich', 'on the ferry …'.
  note: string;
};

export type ItineraryNight = {
  date: string;
  places: ItineraryPlace[];
  hotel: string | null;
  home: boolean;
};

export type ItineraryResult = {
  feasible: boolean;
  start: { city: string | null; at: Date | null; basis: string };
  legs: ItineraryLeg[];
  // Booked legs left broken or redundant that the change set neither cancels nor replaces.
  unaddressed: ItineraryLeg[];
  gaps: ItineraryGap[];
  // One plain line per problem (unaddressed legs, broken new legs, gaps); empty when feasible.
  violations: string[];
  warnings: string[];
  pickup: {
    city: string | null;
    slotStartAt: Date | null;
    slotEndAt: Date | null;
    at: Date | null;
  };
  delivery: {
    city: string | null;
    etaAt: Date | null;
    at: Date | null;
    promise: PromiseDelta | null;
  };
  nextDuty: {
    orderRef: string | null;
    city: string | null;
    startAt: Date | null;
    readyAt: Date | null;
    ok: boolean;
  } | null;
  nights: ItineraryNight[];
  trace: ItinerarySegment[];
};
