// Test-only: synthetic OrderBundle / DriverDuties / quote facts for itinerary scenarios (no dataset, no DB).

import type { DriverDuties } from '@/lib/bahn/drivers';
import type { OrderBundle } from '@/lib/bahn/orders';
import type { FactLike } from '@/lib/facts/types';
import type {
  BahnAddress,
  BahnFerryTerminal,
  BahnOperationalEvent,
  BahnTerminalRoadEstimate,
  BahnTimeWindow,
  BahnTravelOption,
  BahnTravelReservation,
} from '@/lib/generated/prisma/client';

export const ORDER_ID = 'ord-test';
export const ASSIGNMENT_ID = 'asg-test';
export const DRIVER_ID = 'drv-test';

export function reservationRow(
  args: Pick<BahnTravelReservation, 'id' | 'kind' | 'departureAt' | 'expectedArrivalAt'> &
    Partial<BahnTravelReservation>
): BahnTravelReservation {
  return {
    amendmentRequest: null,
    arrivalConfirmation: null,
    assignmentId: ASSIGNMENT_ID,
    boardingConfirmation: null,
    bookedAt: at('2026-10-20T09:00:00Z'),
    bookingBasis: null,
    bookingReference: `REF-${args.id}`,
    cancelledAt: null,
    checkInAt: null,
    checkInConfirmation: null,
    checkInCutoffAt: null,
    checkOutAt: null,
    city: null,
    currency: 'EUR',
    dataOrigin: null,
    destinationTerminal: null,
    destinationTerminalArrivalConfirmation: null,
    destinationTerminalId: null,
    fareCents: 10000,
    fromCity: null,
    itineraryGroupId: null,
    journeyState: null,
    journeyStateBasis: null,
    legSequence: null,
    localTransferHours: null,
    orderId: ORDER_ID,
    originTerminal: null,
    originTerminalId: null,
    provider: null,
    replacementEvidenceId: null,
    replacementReason: null,
    replacementReservationId: null,
    replacesReservationId: null,
    routeLabel: `${args.kind} leg`,
    scheduleBasis: null,
    snapshotJourneyState: null,
    sourceOptionId: null,
    status: 'BOOKED',
    terminalRoadEstimateId: null,
    toCity: null,
    verifiedMilestones: null,
    raw: {},
    ...args,
  };
}

export function terminalRow(
  args: Pick<BahnFerryTerminal, 'id' | 'name' | 'city' | 'timezone'>
): BahnFerryTerminal {
  return {
    country: null,
    isFictional: true,
    locationPrecision: 'CITY_ONLY',
    note: null,
    raw: {},
    ...args,
  };
}

function addressRow(args: Pick<BahnAddress, 'id' | 'city' | 'timezone'>): BahnAddress {
  return {
    accessNote: null,
    addressLine1: null,
    boundary: null,
    country: 'XX',
    kind: 'SITE',
    managedSiteId: null,
    name: `${args.city} site`,
    openingHours: null,
    orderId: ORDER_ID,
    rawInput: args.city,
    raw: {},
    ...args,
  };
}

function windowRow(
  args: Pick<BahnTimeWindow, 'id' | 'purpose' | 'startAt' | 'endAt' | 'timezone'>
): BahnTimeWindow {
  return {
    commitmentDeadlineAt: null,
    deadlineSource: null,
    deadlineStatedAt: null,
    isSelected: true,
    orderId: ORDER_ID,
    pointId: `point-${args.id}`,
    source: 'CUSTOMER',
    statedAt: null,
    raw: {},
    ...args,
  };
}

export function ferryOptionRow(
  args: Pick<BahnTravelOption, 'id' | 'fromCity' | 'toCity' | 'departureAt' | 'arrivalAt'> &
    Partial<BahnTravelOption>
): BahnTravelOption {
  return {
    assignmentId: ASSIGNMENT_ID,
    capacityNote: 'Vehicle slot booked',
    checkInCutoffAt: null,
    checkedAt: at('2026-10-20T09:00:00Z'),
    connectionCount: null,
    currency: 'EUR',
    dataOrigin: null,
    kind: 'FERRY',
    localTransferHours: null,
    orderId: ORDER_ID,
    provider: 'Test Line',
    quoteCents: 30000,
    roadTimeToTerminalHours: null,
    status: 'BOOKED',
    raw: {},
    ...args,
  };
}

export function roadEstimateRow(
  args: Pick<BahnTerminalRoadEstimate, 'id' | 'fromCity' | 'toTerminalId' | 'driveMinutesHigh'>
): BahnTerminalRoadEstimate {
  return {
    approximateRoadDistanceKm: 10,
    coverage: 'CITY_CENTRE_TO_TERMINAL',
    driveMinutesLow: args.driveMinutesHigh,
    excludes: [],
    fromCountry: 'XX',
    note: 'test estimate',
    source: 'TEST',
    raw: {},
    ...args,
  };
}

export function eventRow(args: {
  id: string;
  command: string;
  occurredAt: Date;
}): BahnOperationalEvent {
  const { id, command, occurredAt } = args;
  return {
    id,
    actorId: null,
    actorType: 'driver',
    changes: { occurred_at: occurredAt.toISOString() },
    command,
    fromState: null,
    orderId: ORDER_ID,
    recordedAt: occurredAt,
    source: 'TEST',
    targetId: ORDER_ID,
    targetType: 'order',
    toState: null,
    raw: {},
  };
}

type Endpoint = { city: string; timezone: string; startAt: Date; endAt: Date };

/** A one-assignment order with a pickup slot and a delivery promise; every other collection empty. */
export function syntheticBundle(args: {
  pickup: Endpoint;
  delivery: Endpoint;
  reservations: BahnTravelReservation[];
  travelOptions?: BahnTravelOption[];
  ferryTerminals?: BahnFerryTerminal[];
  roadEstimates?: BahnTerminalRoadEstimate[];
  events?: BahnOperationalEvent[];
  driverHomeCity?: string;
}): OrderBundle {
  const {
    pickup,
    delivery,
    reservations,
    travelOptions = [],
    ferryTerminals = [],
    roadEstimates = [],
    events = [],
    driverHomeCity = 'Turku',
  } = args;
  const bundle = {
    order: {
      id: ORDER_ID,
      reference: 'CD-TEST',
      pickupAddressId: 'addr-pickup',
      deliveryAddressId: 'addr-delivery',
      activePlanId: null,
    },
    customer: null,
    items: [],
    addresses: [
      addressRow({ id: 'addr-pickup', city: pickup.city, timezone: pickup.timezone }),
      addressRow({ id: 'addr-delivery', city: delivery.city, timezone: delivery.timezone }),
    ],
    sites: [],
    plans: [],
    activePlan: null,
    timeWindows: [
      windowRow({
        id: 'tw-pickup',
        purpose: 'SELECTED_PICKUP_SLOT',
        startAt: pickup.startAt,
        endAt: pickup.endAt,
        timezone: pickup.timezone,
      }),
      windowRow({
        id: 'tw-promise',
        purpose: 'CUSTOMER_DELIVERY_PROMISE',
        startAt: delivery.startAt,
        endAt: delivery.endAt,
        timezone: delivery.timezone,
      }),
    ],
    offers: [],
    offerExposures: [],
    reachChecks: [],
    assignments: [
      {
        id: ASSIGNMENT_ID,
        orderId: ORDER_ID,
        driverId: DRIVER_ID,
        status: 'ASSIGNED',
        cancelledAt: null,
        startedAt: null,
        completedAt: null,
        positioning: null,
        segmentIds: [],
        driver: { id: DRIVER_ID, displayName: 'Test Driver', homeCity: driverHomeCity },
        steps: [],
      },
    ],
    travelOptions,
    travelReservations: [...reservations].sort(
      (a, b) => a.departureAt.getTime() - b.departureAt.getTime()
    ),
    travelConfirmations: [],
    ferryTerminals,
    ferryTerminalEvents: [],
    terminalRoadEstimates: roadEstimates,
    conversations: [],
    supportThreads: [],
    alerts: [],
    incidents: [],
    workItems: [],
    agentProposals: [],
    internalNotifications: [],
    events,
    endpointDetails: [],
    trackingObservations: [],
    proofs: [],
    documents: [],
    expenses: [],
    custodyAssets: [],
    custodyReports: [],
    notes: [],
    siteVisits: [],
  };
  return bundle as unknown as OrderBundle;
}

/** A QUOTED fact as search_trains / search_ferries write it. */
export function quoteFact(args: {
  id: string;
  mode: 'TRAIN' | 'FLIGHT' | 'BUS' | 'FERRY';
  fromCity: string;
  toCity: string;
  departureAt: string;
  arrivalAt: string;
  observedAt: Date;
  checkInCutoffAt?: string;
  roadTimeToTerminalHours?: number;
  localTransferHours?: number;
  originTerminalId?: string;
  destinationTerminalId?: string;
}): FactLike {
  const { id, mode, observedAt, ...value } = args;
  const tool = mode === 'FERRY' ? 'search_ferries' : 'search_trains';
  return {
    id,
    kind: mode === 'FERRY' ? 'FERRY_QUOTE' : 'TRAVEL_QUOTE',
    subject: `${mode.toLowerCase()}:${id}`,
    statement: `Quote only, not booked: ${mode.toLowerCase()} ${args.fromCity} → ${args.toCity}.`,
    value: {
      mode,
      status: 'AVAILABLE_QUOTE',
      ...value,
      checkedAt: observedAt.toISOString(),
      quoteCents: 9900,
      currency: 'EUR',
    },
    level: 'QUOTED',
    sourceType: 'TOOL',
    sourceRef: `tool:${tool}:${id}`,
    observedAt,
  };
}

/** A QUOTED hotel fact as search_hotels writes it (check-in date, nights). */
export function hotelFact(args: {
  id: string;
  near: string;
  checkIn: string;
  nights: number;
  observedAt: Date;
}): FactLike {
  const { id, near, checkIn, nights, observedAt } = args;
  return {
    id,
    kind: 'TRAVEL_QUOTE',
    subject: `hotel:${id}`,
    statement: `Quote only, not booked: hotel near ${near}, ${nights} night(s) from ${checkIn}.`,
    value: {
      mode: 'HOTEL',
      status: 'AVAILABLE_QUOTE',
      city: near,
      checkInAt: checkIn,
      nights,
      checkedAt: observedAt.toISOString(),
      quoteCents: 12000 * nights,
      currency: 'EUR',
    },
    level: 'QUOTED',
    sourceType: 'TOOL',
    sourceRef: `tool:search_hotels:${id}`,
    observedAt,
  };
}

/** The driver's duty chain: this assignment plus an optional next duty. */
export function syntheticDuties(args: {
  current: { startAt: Date; endAt: Date };
  next?: { startAt: Date; endAt: Date; startCity: string; endCity: string };
  homeCity?: string;
}): DriverDuties {
  const { current, next, homeCity = 'Turku' } = args;
  const duty = (
    id: string,
    reference: string,
    span: { startAt: Date; endAt: Date },
    cities?: [string, string]
  ) => ({
    assignment: { id, orderId: `ord-${id}`, status: 'ASSIGNED' },
    order: { reference },
    steps: [],
    segments: cities
      ? [{ from: { address: { city: cities[0] } }, to: { address: { city: cities[1] } } }]
      : [],
    selectedWindows: [],
    reservations: [],
    startAt: span.startAt,
    endAt: span.endAt,
  });
  const duties = [
    {
      ...duty(ASSIGNMENT_ID, 'CD-TEST', current),
      assignment: { id: ASSIGNMENT_ID, orderId: ORDER_ID, status: 'ASSIGNED' },
    },
    ...(next ? [duty('asg-next', 'CD-NEXT', next, [next.startCity, next.endCity])] : []),
  ];
  return {
    driver: { id: DRIVER_ID, displayName: 'Test Driver', homeCity },
    duties,
  } as unknown as DriverDuties;
}

const at = (iso: string) => new Date(iso);

const TERMINALS = [
  terminalRow({
    id: 'terminal-tallinn',
    name: 'Tallinn Vehicle Terminal',
    city: 'Tallinn',
    timezone: 'Europe/Tallinn',
  }),
  terminalRow({
    id: 'terminal-south-finland',
    name: 'South Finland Vehicle Terminal',
    city: 'Helsinki',
    timezone: 'Europe/Helsinki',
  }),
];

const positioningTrain = reservationRow({
  id: 'res-train',
  kind: 'TRAIN',
  fromCity: 'Munich',
  toCity: 'Tallinn',
  departureAt: at('2026-10-27T06:00:00Z'),
  expectedArrivalAt: at('2026-10-27T18:00:00Z'),
  localTransferHours: 0.5,
});
const tallinnHotel = reservationRow({
  id: 'res-hotel-tallinn',
  kind: 'HOTEL',
  city: 'Tallinn',
  departureAt: at('2026-10-27T18:30:00Z'),
  expectedArrivalAt: at('2026-10-28T06:00:00Z'),
  checkInAt: at('2026-10-27T18:30:00Z'),
  checkOutAt: at('2026-10-28T06:00:00Z'),
});
const ferry = reservationRow({
  id: 'res-ferry',
  kind: 'FERRY',
  originTerminal: 'Tallinn Vehicle Terminal',
  originTerminalId: 'terminal-tallinn',
  destinationTerminal: 'South Finland Vehicle Terminal',
  destinationTerminalId: 'terminal-south-finland',
  departureAt: at('2026-10-28T15:00:00Z'),
  expectedArrivalAt: at('2026-10-28T17:00:00Z'),
  checkInCutoffAt: at('2026-10-28T14:00:00Z'),
  sourceOptionId: 'opt-ferry',
  terminalRoadEstimateId: 'road-tallinn',
});
const tampereHotel = reservationRow({
  id: 'res-hotel-tampere',
  kind: 'HOTEL',
  city: 'Tampere',
  departureAt: at('2026-10-28T19:30:00Z'),
  expectedArrivalAt: at('2026-10-29T06:30:00Z'),
  checkInAt: at('2026-10-28T19:30:00Z'),
  checkOutAt: at('2026-10-29T06:30:00Z'),
});
const returnTrain = reservationRow({
  id: 'res-return',
  kind: 'TRAIN',
  fromCity: 'Tampere',
  toCity: 'Helsinki',
  departureAt: at('2026-10-29T10:00:00Z'),
  expectedArrivalAt: at('2026-10-29T12:00:00Z'),
  localTransferHours: 0,
});

/** Munich ─train→ Tallinn (hotel) → pickup → ferry → drive (hotel) → delivery Tampere → train Helsinki, all booked. */
export function munichTallinnBundle(
  args: { extraReservations?: BahnTravelReservation[]; events?: BahnOperationalEvent[] } = {}
) {
  const { extraReservations = [], events = [] } = args;
  return syntheticBundle({
    pickup: {
      city: 'Tallinn',
      timezone: 'Europe/Tallinn',
      startAt: at('2026-10-28T07:00:00Z'),
      endAt: at('2026-10-28T15:00:00Z'),
    },
    delivery: {
      city: 'Tampere',
      timezone: 'Europe/Helsinki',
      startAt: at('2026-10-29T07:00:00Z'),
      endAt: at('2026-10-29T10:00:00Z'),
    },
    reservations: [
      positioningTrain,
      tallinnHotel,
      ferry,
      tampereHotel,
      returnTrain,
      ...extraReservations,
    ],
    travelOptions: [
      ferryOptionRow({
        id: 'opt-ferry',
        fromCity: 'Tallinn terminal',
        toCity: 'South Finland terminal',
        departureAt: ferry.departureAt,
        arrivalAt: ferry.expectedArrivalAt,
        capacityNote: 'Vehicle slot booked; about 2 hours from arrival terminal to delivery',
      }),
    ],
    ferryTerminals: TERMINALS,
    roadEstimates: [
      roadEstimateRow({
        id: 'road-tallinn',
        fromCity: 'Tallinn',
        toTerminalId: 'terminal-tallinn',
        driveMinutesHigh: 30,
      }),
    ],
    events,
  });
}
