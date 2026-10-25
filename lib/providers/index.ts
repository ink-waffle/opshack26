// External providers behind adapters: travel search + booking, roadside, simulated conversations.

import { mockDriverPool } from '@/lib/providers/adapters/mockDriverPool';
import { mockRoadside } from '@/lib/providers/adapters/mockRoadside';
import { mockTravel } from '@/lib/providers/adapters/mockTravel';
import { simConversation } from '@/lib/providers/adapters/simConversation';

// label: the dataset's place label ('West Baltic terminal'), used as fromCity/toCity in facts.
export type Terminal = { id: string | null; name: string; city: string | null; label: string };

export type FerrySailing = {
  sailingId: string;
  operator: string;
  from: Terminal;
  to: Terminal;
  departureAt: string;
  arrivalAt: string;
  checkInCutoffAt: string;
  status: 'AVAILABLE' | 'SOLD_OUT';
  vehicleSpaces: number | null;
  priceCents: number | null;
  currency: string;
  // DATASET_TIMETABLE: a sailing recorded in bahn.travel_options; GENERATED: deterministic mock.
  basis: 'DATASET_TIMETABLE' | 'GENERATED';
  datasetOptionId: string | null;
};

export type TrainConnection = {
  connectionId: string;
  operator: string;
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  changes: number;
  priceCents: number;
  currency: string;
};

export type HotelOffer = {
  hotelId: string;
  name: string;
  near: string;
  distanceKm: number;
  checkIn: string;
  nights: number;
  pricePerNightCents: number;
  totalCents: number;
  currency: string;
  available: boolean;
  securedParking: boolean;
};

export type RoadsideOption = {
  providerId: string;
  name: string;
  kind: 'ROADSIDE_ASSIST' | 'TOW';
  etaMinutes: number;
  coverage: string;
  note: string;
};

export type ReconcileResult = {
  provider: string;
  reference: string | null;
  outcome: 'NO_BOOKING' | 'BOOKING_EXISTS' | 'PENDING' | 'NOT_FOUND';
  statement: string;
  bookingReference: string | null;
  // The earlier booking attempt (bahn.agent_proposals id) this answer covers, when known.
  proposalId: string | null;
};

export type BookingResult = {
  ok: boolean;
  bookingReference: string | null;
  priceCents: number | null;
  statement: string;
};

// What gets cancelled: a bahn reservation or one of our BOOKED facts, in the words both carry.
export type CancellableBooking = {
  mode: string;
  provider: string | null;
  bookingReference: string | null;
  // Plain words for statements, e.g. 'train Munich → Tallinn 23 Oct 18:05'.
  description: string;
};

export type CancellationResult = {
  ok: boolean;
  cancellationReference: string | null;
  statement: string;
};

// What gets booked: the `value` of a QUOTED fact written by a search tool.
export type BookableQuote =
  | { type: 'ferry'; sailing: FerrySailing }
  | { type: 'train'; connection: TrainConnection }
  | { type: 'hotel'; hotel: HotelOffer };

export type TravelProvider = {
  id: string;
  searchFerries: (args: {
    fromPort: string;
    toPort: string;
    earliest: Date;
    days?: number;
  }) => Promise<FerrySailing[]>;
  searchTrains: (args: { from: string; to: string; earliest: Date }) => Promise<TrainConnection[]>;
  searchHotels: (args: { near: string; checkIn: Date; nights: number }) => Promise<HotelOffer[]>;
  // Books a quote after re-checking it (G8); never books a sold-out sailing.
  book: (args: { quote: BookableQuote; orderId: string; at: Date }) => Promise<BookingResult>;
  // Cancels a booking by its reference; never without one.
  cancel: (args: {
    booking: CancellableBooking;
    orderId: string;
    at: Date;
  }) => Promise<CancellationResult>;
  // Looks up an earlier attempt by proposal id, travel option id or booking reference.
  reconcile: (args: {
    orderId: string;
    reference: string | null;
    question: string;
  }) => Promise<ReconcileResult>;
};

export type RoadsideProvider = {
  id: string;
  find: (args: { location: string }) => Promise<RoadsideOption[]>;
  // Orders a found candidate (simulated); the caller records the BOOKED fact.
  order: (args: {
    option: RoadsideOption;
    location: string;
    orderId: string;
    at: Date;
  }) => Promise<BookingResult>;
};

export type ConversationParty = 'driver' | 'site' | 'provider';

export type ConversationReply = {
  // null: the party did not answer (scripted silence); the question stays unanswered.
  reply: string | null;
  speaker: { type: ConversationParty; id: string; name: string | null };
  scripted: boolean;
  costUsd: number;
};

export type ConversationProvider = {
  id: string;
  reply: (args: {
    party: ConversationParty;
    question: string;
    orderRef: string;
    scenarioHint?: string;
  }) => Promise<ConversationReply>;
};

// A driver who could take over an order: free in Bahn's duty records around the pickup (a pool check, not an offer).
export type BackupCandidate = {
  driverId: string;
  name: string;
  homeCity: string;
  homeCountry: string;
  proximity: 'SAME_CITY' | 'SAME_COUNTRY';
  // Estimated travel time from home to the pickup.
  reachMinutes: number;
  // Seeded guess from past offer behaviour; never a commitment.
  likelihood: 'HIGH' | 'MEDIUM' | 'LOW';
  activeDuties: number;
  basis: string;
};

export type DriverPoolProvider = {
  id: string;
  findBackups: (args: {
    pickupCity: string;
    pickupCountry: string;
    busyFrom: Date;
    busyUntil: Date;
    excludeDriverIds: string[];
    limit?: number;
  }) => Promise<BackupCandidate[]>;
};

const travelProviders: Record<string, TravelProvider> = { [mockTravel.id]: mockTravel };
const driverPools: Record<string, DriverPoolProvider> = { [mockDriverPool.id]: mockDriverPool };
const roadsideProviders: Record<string, RoadsideProvider> = { [mockRoadside.id]: mockRoadside };
const conversationProviders: Record<string, ConversationProvider> = {
  [simConversation.id]: simConversation,
};

function pick<T>(args: { registry: Record<string, T>; id: string; kind: string }): T {
  const { registry, id, kind } = args;
  const adapter = registry[id];
  if (!adapter) throw new Error(`Unknown ${kind} provider adapter: ${id}`);
  return adapter;
}

export function getTravelProvider(id = process.env.TRAVEL_PROVIDER ?? 'mock'): TravelProvider {
  return pick({ registry: travelProviders, id, kind: 'travel' });
}

export function getRoadsideProvider(
  id = process.env.ROADSIDE_PROVIDER ?? 'mock'
): RoadsideProvider {
  return pick({ registry: roadsideProviders, id, kind: 'roadside' });
}

export function getDriverPoolProvider(
  id = process.env.DRIVER_POOL_PROVIDER ?? 'mock'
): DriverPoolProvider {
  return pick({ registry: driverPools, id, kind: 'driver pool' });
}

export function getConversationProvider(
  id = process.env.CONVERSATION_PROVIDER ?? 'sim'
): ConversationProvider {
  return pick({ registry: conversationProviders, id, kind: 'conversation' });
}
