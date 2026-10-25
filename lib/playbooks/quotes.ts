// Quote and booking facts written by search tools and the execute block; values mirror the projection's fields.

import { cityTimezone, formatLocal, formatMoney } from '@/lib/evidence/time';
import type { Fact } from '@/lib/generated/prisma/client';
import type { NewFact } from '@/lib/playbooks/facts';
import type {
  BookableQuote,
  BookingResult,
  CancellableBooking,
  CancellationResult,
  FerrySailing,
  HotelOffer,
  TrainConnection,
} from '@/lib/providers';

type Scope = { orderId: string | null; runId: string | null; simNow: Date; tool: string };

const when = (iso: string, city: string | null) =>
  formatLocal({ at: new Date(iso), timeZone: cityTimezone(city) });

// roadTimeToTerminalHours: the order's pickup → departure terminal drive (lets the chain place the driver).
export function ferryFact(
  args: Scope & { sailing: FerrySailing; roadTimeToTerminalHours?: number | null }
): NewFact {
  const { orderId, runId, simNow, tool, sailing, roadTimeToTerminalHours = null } = args;
  const soldOut = sailing.status === 'SOLD_OUT';
  const fromCity = sailing.from.city;
  const toCity = sailing.to.city;
  const route = `${sailing.operator} ferry ${sailing.from.name} → ${sailing.to.name}, departs ${when(sailing.departureAt, fromCity)}, arrives ${when(sailing.arrivalAt, toCity)}, check-in cutoff ${when(sailing.checkInCutoffAt, fromCity)}`;
  const checked = formatLocal({ at: simNow, timeZone: cityTimezone(fromCity) });
  return {
    orderId,
    runId,
    kind: soldOut ? 'FERRY_SOLD_OUT' : 'FERRY_QUOTE',
    subject: `ferry:${sailing.sailingId}`,
    statement: soldOut
      ? `Sold out at the check ${checked}: ${route}.`
      : `Quote only, not booked: ${route}, ${formatMoney({ cents: sailing.priceCents, currency: sailing.currency })}, ${sailing.vehicleSpaces} vehicle spaces; checked ${checked}.`,
    value: {
      mode: 'FERRY',
      status: soldOut ? 'SOLD_OUT' : 'AVAILABLE_QUOTE',
      provider: sailing.operator,
      fromCity: sailing.from.label,
      toCity: sailing.to.label,
      originTerminalId: sailing.from.id,
      destinationTerminalId: sailing.to.id,
      departureAt: sailing.departureAt,
      arrivalAt: sailing.arrivalAt,
      checkInCutoffAt: sailing.checkInCutoffAt,
      checkedAt: simNow.toISOString(),
      quoteCents: sailing.priceCents,
      currency: sailing.currency,
      roadTimeToTerminalHours,
      // Not `travelOptionId`: the chain would resolve that to the older dataset quote.
      datasetOptionId: sailing.datasetOptionId,
      quote: { type: 'ferry', sailing } satisfies BookableQuote,
    },
    level: 'QUOTED',
    sourceType: 'TOOL',
    sourceRef: `tool:${tool}:${sailing.sailingId}`,
    observedAt: simNow,
    dedupeKey: `tool:${tool}:${runId ?? orderId}:${sailing.sailingId}:${simNow.toISOString()}`,
  };
}

export function trainFact(args: Scope & { connection: TrainConnection }): NewFact {
  const { orderId, runId, simNow, tool, connection } = args;
  return {
    orderId,
    runId,
    kind: 'TRAVEL_QUOTE',
    subject: `train:${connection.connectionId}`,
    statement: `Quote only, not booked: ${connection.operator} train ${connection.from} → ${connection.to}, departs ${when(connection.departureAt, connection.from)}, arrives ${when(connection.arrivalAt, connection.to)}, ${connection.changes} change(s), ${formatMoney({ cents: connection.priceCents, currency: connection.currency })}; checked ${formatLocal({ at: simNow, timeZone: cityTimezone(connection.from) })}.`,
    value: {
      mode: 'TRAIN',
      status: 'AVAILABLE_QUOTE',
      provider: connection.operator,
      fromCity: connection.from,
      toCity: connection.to,
      departureAt: connection.departureAt,
      arrivalAt: connection.arrivalAt,
      checkedAt: simNow.toISOString(),
      quoteCents: connection.priceCents,
      currency: connection.currency,
      quote: { type: 'train', connection } satisfies BookableQuote,
    },
    level: 'QUOTED',
    sourceType: 'TOOL',
    sourceRef: `tool:${tool}:${connection.connectionId}`,
    observedAt: simNow,
    dedupeKey: `tool:${tool}:${runId ?? orderId}:${connection.connectionId}:${simNow.toISOString()}`,
  };
}

export function hotelFact(args: Scope & { hotel: HotelOffer }): NewFact {
  const { orderId, runId, simNow, tool, hotel } = args;
  const parking = hotel.securedParking ? 'secured parking' : 'no secured parking';
  return {
    orderId,
    runId,
    kind: 'TRAVEL_QUOTE',
    subject: `hotel:${hotel.hotelId}`,
    statement: hotel.available
      ? `Quote only, not booked: ${hotel.name}, ${hotel.distanceKm} km from ${hotel.near}, ${hotel.nights} night(s) from ${hotel.checkIn}, ${formatMoney({ cents: hotel.totalCents, currency: hotel.currency })} total, ${parking}.`
      : `${hotel.name} near ${hotel.near} has no room for ${hotel.checkIn} at the check.`,
    value: {
      mode: 'HOTEL',
      status: hotel.available ? 'AVAILABLE_QUOTE' : 'SOLD_OUT',
      provider: hotel.name,
      city: hotel.near,
      checkInAt: hotel.checkIn,
      nights: hotel.nights,
      checkedAt: simNow.toISOString(),
      quoteCents: hotel.totalCents,
      currency: hotel.currency,
      securedParking: hotel.securedParking,
      quote: { type: 'hotel', hotel } satisfies BookableQuote,
    },
    level: 'QUOTED',
    sourceType: 'TOOL',
    sourceRef: `tool:${tool}:${hotel.hotelId}`,
    observedAt: simNow,
    dedupeKey: `tool:${tool}:${runId ?? orderId}:${hotel.hotelId}:${hotel.checkIn}:${simNow.toISOString()}`,
  };
}

export function readQuote(fact: Pick<Fact, 'value'> | undefined): BookableQuote | null {
  const quote = (fact?.value as { quote?: BookableQuote } | null)?.quote;
  return quote && ['ferry', 'hotel', 'train'].includes(quote.type) ? quote : null;
}

const BOOKED_KIND = {
  ferry: 'FERRY_BOOKING',
  hotel: 'HOTEL_BOOKING',
  train: 'TRAVEL_BOOKING',
} as const;

export function bookedFact(args: {
  quoteFact: Fact;
  quote: BookableQuote;
  result: BookingResult;
  runId: string;
  simNow: Date;
}): NewFact {
  const { quoteFact, quote, result, runId, simNow } = args;
  const reference = result.bookingReference ?? 'unknown';
  return {
    orderId: quoteFact.orderId,
    runId,
    kind: BOOKED_KIND[quote.type],
    subject: quoteFact.subject,
    statement: `Booked (simulated): ${result.statement}`,
    value: {
      ...(quoteFact.value as Record<string, unknown>),
      status: 'BOOKED',
      bookingReference: reference,
      fareCents: result.priceCents,
      quoteFactId: quoteFact.id,
    },
    level: 'BOOKED',
    sourceType: 'TOOL',
    sourceRef: `tool:book_${quote.type}:${reference}`,
    observedAt: simNow,
    dedupeKey: `booking:${runId}:${quoteFact.id}`,
  };
}

/** A provider-confirmed cancellation; the chain and the itinerary treat the reservation it names as cancelled. */
export function cancelledFact(args: {
  orderId: string;
  subject: string;
  booking: CancellableBooking;
  // The bahn reservation and/or the booking fact the cancellation covers.
  reservationId: string | null;
  bookingFactId: string | null;
  result: CancellationResult;
  runId: string;
  simNow: Date;
}): NewFact {
  const { orderId, subject, booking, reservationId, bookingFactId, result, runId, simNow } = args;
  const reference = result.cancellationReference ?? 'unknown';
  return {
    orderId,
    runId,
    kind: 'TRAVEL_CANCELLED',
    subject,
    statement: `Cancelled (simulated): ${result.statement}`,
    value: {
      mode: booking.mode,
      status: 'CANCELLED',
      provider: booking.provider,
      reservationId,
      bookingFactId,
      bookingReference: booking.bookingReference,
      cancellationReference: reference,
    },
    level: 'BOOKED',
    sourceType: 'TOOL',
    sourceRef: `tool:cancel_travel:${reference}`,
    observedAt: simNow,
    dedupeKey: `cancellation:${runId}:${reservationId ?? bookingFactId}`,
  };
}
