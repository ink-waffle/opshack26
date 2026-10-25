// Mock travel provider: ferries from the dataset timetable (bahn.travel_options) plus deterministic fill-ins.

import { HOUR_MS, MINUTE_MS } from '@/lib/clock/math';
import { prisma } from '@/lib/prismaClient';
import type {
  BookingResult,
  CancellableBooking,
  CancellationResult,
  FerrySailing,
  HotelOffer,
  ReconcileResult,
  Terminal,
  TrainConnection,
  TravelProvider,
} from '@/lib/providers';
import { findScriptedReply } from '@/lib/providers/scripts';
import { between, pickOne, seededRandom, shortId } from '@/lib/providers/seeded';

const DAY_MS = 24 * HOUR_MS;
const FERRY_OPERATORS = ['Vela Coast Lines', 'Nordic Tern Ferries', 'Baltic Lumen Line'];
const TRAIN_OPERATORS = ['Northrail', 'Baltic Link Rail'];
const HOTEL_FIRST = ['Harbour', 'Quay', 'Lighthouse', 'Pier', 'Anchor', 'Compass'];
const HOTEL_LAST = ['Inn', 'Hotel', 'Lodge', 'Rooms'];

type FerryRow = {
  id: string;
  provider: string;
  fromCity: string;
  toCity: string;
  departureAt: Date;
  arrivalAt: Date;
  checkInCutoffAt: Date | null;
  checkedAt: Date;
  quoteCents: number | null;
  status: string;
};

type Catalog = {
  rows: FerryRow[];
  terminals: { id: string; name: string | null; city: string | null }[];
};

let catalogPromise: Promise<Catalog> | null = null;

function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= Promise.all([
    prisma.bahnTravelOption.findMany({
      where: { kind: 'FERRY' },
      select: {
        id: true,
        provider: true,
        fromCity: true,
        toCity: true,
        departureAt: true,
        arrivalAt: true,
        checkInCutoffAt: true,
        checkedAt: true,
        quoteCents: true,
        status: true,
      },
    }),
    prisma.bahnFerryTerminal.findMany({ select: { id: true, name: true, city: true } }),
  ]).then(([rows, terminals]) => ({ rows, terminals }));
  return catalogPromise;
}

// 'West Baltic Vehicle Terminal' / 'West Baltic terminal' / 'terminal-west-baltic' → 'west baltic'.
export function portKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^terminal-/, '')
    .replace(/[-_,.]/g, ' ')
    .replace(/\b(vehicle|terminal|port|ferry|harbour|harbor)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolvePort(args: { input: string; catalog: Catalog }): {
  key: string;
  terminal: Terminal;
} {
  const { input, catalog } = args;
  const key = portKey(input);
  const match = catalog.terminals.find(
    (t) =>
      portKey(t.id) === key || portKey(t.name ?? '') === key || (t.city ?? '').toLowerCase() === key
  );
  const datasetLabel = (wanted: string) =>
    catalog.rows.flatMap((row) => [row.fromCity, row.toCity]).find((l) => portKey(l) === wanted);
  if (match) {
    const terminalKey = portKey(match.name ?? match.id);
    const label = datasetLabel(terminalKey) ?? match.city ?? match.name ?? input;
    return {
      key: terminalKey,
      terminal: { id: match.id, name: match.name ?? input, city: match.city, label },
    };
  }
  return {
    key,
    terminal: { id: null, name: input, city: null, label: datasetLabel(key) ?? input },
  };
}

function median(values: number[], fallback: number): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function startOfUtcDay(at: Date): number {
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
}

async function searchFerries(args: {
  fromPort: string;
  toPort: string;
  earliest: Date;
  days?: number;
}): Promise<FerrySailing[]> {
  const { fromPort, toPort, earliest, days = 3 } = args;
  const catalog = await loadCatalog();
  const from = resolvePort({ input: fromPort, catalog });
  const to = resolvePort({ input: toPort, catalog });
  const routeKey = `${from.key}->${to.key}`;
  const routeRows = catalog.rows.filter(
    (row) => portKey(row.fromCity) === from.key && portKey(row.toCity) === to.key
  );

  // Latest observation per recorded departure wins.
  const recorded = new Map<number, FerryRow>();
  for (const row of routeRows) {
    const existing = recorded.get(row.departureAt.getTime());
    if (!existing || existing.checkedAt < row.checkedAt)
      recorded.set(row.departureAt.getTime(), row);
  }
  const durationMs = median(
    routeRows.map((row) => row.arrivalAt.getTime() - row.departureAt.getTime()),
    20 * HOUR_MS
  );
  const cutoffMs = median(
    routeRows.flatMap((row) =>
      row.checkInCutoffAt ? [row.departureAt.getTime() - row.checkInCutoffAt.getTime()] : []
    ),
    2 * HOUR_MS
  );
  const basePrice = median(
    routeRows.flatMap((row) => (row.quoteCents ? [row.quoteCents] : [])),
    32000
  );
  const hours = [...new Set(routeRows.map((row) => row.departureAt.getUTCHours()))];
  const typicalHours = hours.length >= 2 ? hours : [10, 18];

  const sailings: FerrySailing[] = [];
  const firstDay = startOfUtcDay(earliest);
  for (let day = 0; day < days + 1; day++) {
    const dayStart = firstDay + day * DAY_MS;
    const dayRows = [...recorded.values()].filter(
      (row) =>
        row.departureAt.getTime() >= dayStart && row.departureAt.getTime() < dayStart + DAY_MS
    );
    const random = seededRandom(`${routeKey}:${new Date(dayStart).toISOString().slice(0, 10)}`);
    const departures = dayRows.length
      ? dayRows.map((row) => ({ at: row.departureAt.getTime(), row }))
      : [
          ...new Set([
            pickOne({ items: typicalHours, random }),
            pickOne({ items: typicalHours, random }),
          ]),
        ]
          .sort((a, b) => a - b)
          .map((hour) => ({ at: dayStart + hour * HOUR_MS, row: null as FerryRow | null }));

    for (const { at, row } of departures) {
      const sailingRandom = seededRandom(`${routeKey}:${at}`);
      const soldOut = row ? row.status === 'SOLD_OUT' : sailingRandom() < 0.2;
      const price =
        row?.quoteCents ??
        Math.round((basePrice * between({ min: 85, max: 115, random: sailingRandom })) / 100);
      sailings.push({
        sailingId: `sail-${shortId(`${routeKey}:${at}`)}`,
        operator: row?.provider ?? pickOne({ items: FERRY_OPERATORS, random: sailingRandom }),
        from: from.terminal,
        to: to.terminal,
        departureAt: new Date(at).toISOString(),
        arrivalAt: new Date(row?.arrivalAt.getTime() ?? at + durationMs).toISOString(),
        checkInCutoffAt: new Date(row?.checkInCutoffAt?.getTime() ?? at - cutoffMs).toISOString(),
        status: soldOut ? 'SOLD_OUT' : 'AVAILABLE',
        vehicleSpaces: soldOut ? 0 : between({ min: 2, max: 14, random: sailingRandom }),
        priceCents: soldOut ? null : price,
        currency: 'EUR',
        basis: row ? 'DATASET_TIMETABLE' : 'GENERATED',
        datasetOptionId: row?.id ?? null,
      });
    }
  }
  const windowEnd = firstDay + (days + 1) * DAY_MS;
  return sailings
    .filter(
      (sailing) =>
        new Date(sailing.checkInCutoffAt).getTime() >= earliest.getTime() &&
        new Date(sailing.departureAt).getTime() < windowEnd
    )
    .sort((a, b) => a.departureAt.localeCompare(b.departureAt))
    .slice(0, 8);
}

async function searchTrains(args: {
  from: string;
  to: string;
  earliest: Date;
}): Promise<TrainConnection[]> {
  const { from, to, earliest } = args;
  const route = `${from.toLowerCase()}->${to.toLowerCase()}`;
  const routeRandom = seededRandom(route);
  const durationMin = between({ min: 90, max: 420, random: routeRandom });
  const firstHour = Math.ceil(earliest.getTime() / HOUR_MS) * HOUR_MS;
  return [0, 1, 2].map((index) => {
    const random = seededRandom(`${route}:${firstHour}:${index}`);
    const departure =
      firstHour + index * 2 * HOUR_MS + between({ min: 0, max: 50, random }) * MINUTE_MS;
    const changes = between({ min: 0, max: 2, random });
    return {
      connectionId: `train-${shortId(`${route}:${departure}`)}`,
      operator: pickOne({ items: TRAIN_OPERATORS, random }),
      from,
      to,
      departureAt: new Date(departure).toISOString(),
      arrivalAt: new Date(departure + (durationMin + changes * 15) * MINUTE_MS).toISOString(),
      changes,
      priceCents: between({ min: 3900, max: 15900, random }),
      currency: 'EUR',
    };
  });
}

async function searchHotels(args: {
  near: string;
  checkIn: Date;
  nights: number;
}): Promise<HotelOffer[]> {
  const { near, checkIn, nights } = args;
  const day = checkIn.toISOString().slice(0, 10);
  const place =
    near
      .replace(/\b(vehicle|terminal)\b/gi, '')
      .trim()
      .split(/\s+/)
      .slice(-1)[0] ?? near;
  return [0, 1, 2].map((index) => {
    const random = seededRandom(`${near.toLowerCase()}:${day}:${index}`);
    const perNight = between({ min: 7900, max: 15900, random });
    const name = `${pickOne({ items: HOTEL_FIRST, random })} ${pickOne({ items: HOTEL_LAST, random })} ${place}`;
    return {
      hotelId: `hotel-${shortId(`${near.toLowerCase()}:${index}`)}`,
      name,
      near,
      distanceKm: between({ min: 3, max: 40, random }) / 10,
      checkIn: day,
      nights,
      pricePerNightCents: perNight,
      totalCents: perNight * nights,
      currency: 'EUR',
      available: random() > 0.15,
      securedParking: index !== 2,
    };
  });
}

async function book(args: {
  quote: Parameters<TravelProvider['book']>[0]['quote'];
  orderId: string;
  at: Date;
}): Promise<BookingResult> {
  const { quote, orderId, at } = args;
  if (quote.type === 'ferry') {
    const { sailing } = quote;
    const departure = new Date(sailing.departureAt);
    const fresh = await searchFerries({
      fromPort: sailing.from.id ?? sailing.from.name,
      toPort: sailing.to.id ?? sailing.to.name,
      earliest: new Date(departure.getTime() - 6 * HOUR_MS),
      days: 1,
    });
    const current = fresh.find((candidate) => candidate.sailingId === sailing.sailingId);
    if (!current || current.status !== 'AVAILABLE')
      return {
        ok: false,
        bookingReference: null,
        priceCents: null,
        statement: `Re-check before booking: ${sailing.operator} ${sailing.departureAt} has no vehicle space now.`,
      };
    const reference = `VCL-${shortId(`${orderId}:${sailing.sailingId}:${at.getTime()}`).toUpperCase()}`;
    return {
      ok: true,
      bookingReference: reference,
      priceCents: current.priceCents,
      statement: `${current.operator} confirmed vehicle space on the ${current.departureAt} sailing, reference ${reference}.`,
    };
  }
  if (quote.type === 'hotel') {
    const { hotel } = quote;
    if (!hotel.available)
      return {
        ok: false,
        bookingReference: null,
        priceCents: null,
        statement: `${hotel.name} is full.`,
      };
    const reference = `HTL-${shortId(`${orderId}:${hotel.hotelId}:${at.getTime()}`).toUpperCase()}`;
    return {
      ok: true,
      bookingReference: reference,
      priceCents: hotel.totalCents,
      statement: `${hotel.name} confirmed ${hotel.nights} night(s) from ${hotel.checkIn}, reference ${reference}.`,
    };
  }
  const { connection } = quote;
  const reference = `TRN-${shortId(`${orderId}:${connection.connectionId}:${at.getTime()}`).toUpperCase()}`;
  return {
    ok: true,
    bookingReference: reference,
    priceCents: connection.priceCents,
    statement: `${connection.operator} ticket ${connection.from} → ${connection.to} ${connection.departureAt}, reference ${reference}.`,
  };
}

async function cancel(args: {
  booking: CancellableBooking;
  orderId: string;
  at: Date;
}): Promise<CancellationResult> {
  const { booking, orderId, at } = args;
  const provider = booking.provider ?? 'The provider';
  if (!booking.bookingReference)
    return {
      ok: false,
      cancellationReference: null,
      statement: `${provider} cannot cancel the ${booking.description}: it carries no booking reference.`,
    };
  const reference = `CXL-${shortId(`${orderId}:${booking.bookingReference}:${at.getTime()}`).toUpperCase()}`;
  return {
    ok: true,
    cancellationReference: reference,
    statement: `${provider} cancelled the ${booking.description} (ref ${booking.bookingReference}), cancellation ${reference}.`,
  };
}

async function reconcile(args: {
  orderId: string;
  reference: string | null;
  question: string;
}): Promise<ReconcileResult> {
  const { orderId, reference, question } = args;
  const order = await prisma.bahnOrder.findFirst({
    where: { OR: [{ id: orderId }, { reference: orderId }] },
    select: { id: true, reference: true },
  });
  if (!order) throw new Error(`Unknown order ${orderId}`);

  const [reservations, attempts] = await Promise.all([
    prisma.bahnTravelReservation.findMany({ where: { orderId: order.id } }),
    prisma.bahnAgentProposal.findMany({
      where: { orderId: order.id, command: { startsWith: 'travel.book' } },
    }),
  ]);
  const scripted = await findScriptedReply({
    orderRef: order.reference,
    party: 'provider',
    question,
  });
  if (scripted)
    return {
      provider: scripted.speaker ?? 'Provider desk',
      reference,
      outcome: (scripted.outcome as ReconcileResult['outcome']) ?? 'PENDING',
      statement: scripted.reply,
      bookingReference: scripted.bookingReference ?? null,
      proposalId: attempts.find((a) => !reference || a.id === reference)?.id ?? null,
    };

  const booked = reference
    ? reservations.find((r) => r.bookingReference === reference && !r.cancelledAt)
    : undefined;
  if (booked)
    return {
      provider: booked.provider ?? 'Provider',
      reference,
      outcome: 'BOOKING_EXISTS',
      statement: `Reservation ${booked.bookingReference} exists (${booked.routeLabel}, departs ${booked.departureAt.toISOString()}).`,
      bookingReference: booked.bookingReference,
      proposalId: null,
    };

  const attempt = attempts.find((candidate) => {
    const raw = candidate.raw as { proposed_payload?: { travel_option_id?: string } };
    return (
      !reference ||
      candidate.id === reference ||
      raw.proposed_payload?.travel_option_id === reference ||
      question.includes(candidate.id)
    );
  });
  if (!attempt)
    return {
      provider: 'Provider',
      reference,
      outcome: 'NOT_FOUND',
      statement: `No booking request or reservation matches "${reference ?? question}".`,
      bookingReference: null,
      proposalId: null,
    };

  const raw = attempt.raw as {
    proposed_payload?: { travel_option_id?: string };
    execution?: { attempted_at?: string } | null;
  };
  const optionId = raw.proposed_payload?.travel_option_id ?? null;
  const option = optionId
    ? await prisma.bahnTravelOption.findUnique({ where: { id: optionId } })
    : null;
  const provider = option?.provider ?? 'Provider';
  const attemptedAt = raw.execution?.attempted_at ?? attempt.createdAt.toISOString();
  return {
    provider,
    reference: reference ?? attempt.id,
    outcome: 'NO_BOOKING',
    statement: `${provider} has no reservation from the request sent at ${attemptedAt}: no reference was issued and no vehicle space is held${option ? ` on the ${option.departureAt.toISOString()} sailing` : ''}.`,
    bookingReference: null,
    proposalId: attempt.id,
  };
}

export const mockTravel: TravelProvider = {
  id: 'mock',
  searchFerries,
  searchTrains,
  searchHotels,
  book,
  cancel,
  reconcile,
};
