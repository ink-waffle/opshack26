// Itinerary legs from booked reservations and from a change set (quote facts, travel options, resolved quotes, hotels).

import {
  arrivalRoadHours,
  bahnFactId,
  type Ctx,
  reservationKind,
  resolveQuote,
  roadToTerminalHours,
} from '@/lib/chain/compute';
import {
  addDays,
  dateLabel,
  localDate,
  nightsIn,
  nightWindow,
  placeName,
  placeTimezone,
  resolvePlace,
} from '@/lib/chain/itinerary/places';
import type {
  HotelStayInput,
  ItineraryChangeSet,
  ItineraryGap,
  ItineraryLeg,
  ItineraryLegStatus,
  ItineraryParameters,
  ItineraryPlace,
} from '@/lib/chain/itinerary/types';
import type { QuoteInput, TravelMode } from '@/lib/chain/types';
import { addHours, formatLocal } from '@/lib/evidence/time';
import { factValue } from '@/lib/facts/types';

type Reservation = Ctx['reservations'][number];

export type SimLeg = {
  leg: ItineraryLeg;
  mode: 'TRAVEL' | 'FERRY' | 'HOTEL';
  // Zone of the departure place (hotels: of the hotel).
  tz: string;
  boardBy: Date;
  // Ground transfer after arrival before the driver is in the destination city.
  transferHours: number;
  roadToTerminalHours: number | null;
  arrivalRoad: { hours: number; basis: string } | null;
  // Ferry gate record: true accepted, false rejected, null none.
  checkedIn: boolean | null;
  // Every id that names this leg: reservation id, booking fact id, quote ref, quote fact id.
  aliases: string[];
  replaces: string[];
  // Set once the simulation has given the leg its verdict.
  settled: boolean;
  // Where the driver is when an unused leg departs (verdict decided after the simulation).
  unusedReason: string | null;
};

const TRAVEL_MODES: TravelMode[] = ['TRAIN', 'FLIGHT', 'BUS', 'FERRY'];
// BOOKED facts written by the execute block (lib/playbooks/quotes bookedFact).
const OUR_BOOKING = /^tool:book_/;

type Scope = { ctx: Ctx; params: ItineraryParameters };

function tzOf(scope: Scope, place: ItineraryPlace): string {
  return placeTimezone({ place, bundle: scope.ctx.bundle, fallback: scope.ctx.pickupTz });
}

export function nightsPhrase(nights: string[]): string {
  if (!nights.length) return 'no night';
  if (nights.length === 1) return `night of ${dateLabel(nights[0])}`;
  return `nights of ${dateLabel(nights[0])} – ${dateLabel(nights[nights.length - 1])}`;
}

function travelDescription(args: {
  mode: TravelMode;
  from: ItineraryPlace;
  to: ItineraryPlace;
  departureAt: Date;
  tz: string;
}): string {
  const { mode, from, to, departureAt, tz } = args;
  const when = formatLocal({ at: departureAt, timeZone: tz });
  if (mode === 'FERRY') return `ferry ${from.label} → ${to.label} ${when}`;
  return `${mode.toLowerCase()} ${placeName(from)} → ${placeName(to)} ${when}`;
}

function legFromQuote(
  scope: Scope,
  args: {
    quote: QuoteInput;
    status: ItineraryLegStatus;
    aliases: string[];
    replaces: string[];
    terminalIds?: { from: string | null; to: string | null };
    checkedIn?: boolean | null;
  }
): SimLeg {
  const { ctx, params } = scope;
  const { quote, status, aliases, replaces, terminalIds, checkedIn = null } = args;
  const terminals = ctx.bundle.ferryTerminals;
  const from = resolvePlace({ label: quote.fromCity, terminalId: terminalIds?.from, terminals });
  const to = resolvePlace({ label: quote.toCity, terminalId: terminalIds?.to, terminals });
  const tz = tzOf(scope, from);
  const ferry = quote.mode === 'FERRY';
  return {
    leg: {
      ref: quote.ref ?? null,
      factId: quote.factId ?? null,
      kind: quote.mode,
      description: travelDescription({
        mode: quote.mode,
        from,
        to,
        departureAt: quote.departureAt,
        tz,
      }),
      from,
      to,
      departureAt: quote.departureAt,
      arrivalAt: quote.arrivalAt,
      nights: [],
      status,
      verdict: status === 'cancel' ? 'cancelled' : 'ok',
      reason: status === 'cancel' ? 'cancelled by the option' : '',
      replacedBy: null,
    },
    mode: ferry ? 'FERRY' : 'TRAVEL',
    tz,
    boardBy:
      quote.checkInCutoffAt ??
      addHours({ at: quote.departureAt, hours: -params.transferBufferHours }),
    transferHours: ferry ? 0 : (quote.localTransferHours ?? 0),
    roadToTerminalHours: ferry ? roadToTerminalHours(ctx, quote) : null,
    arrivalRoad: ferry
      ? arrivalRoadHours({
          ctx,
          capacityNote: quote.capacityNote,
          explicit: quote.arrivalRoadHours,
        })
      : null,
    checkedIn,
    aliases: [...new Set(aliases.filter(Boolean))],
    replaces,
    settled: status === 'cancel',
    unusedReason: null,
  };
}

function legFromHotel(
  scope: Scope,
  args: {
    city: string;
    checkInAt: Date;
    checkOutAt: Date;
    nights?: string[];
    status: ItineraryLegStatus;
    ref: string | null;
    factId: string | null;
    aliases: string[];
    replaces: string[];
  }
): SimLeg {
  const { ctx, params } = scope;
  const { city, checkInAt, checkOutAt, status, ref, factId, aliases, replaces } = args;
  const place = resolvePlace({ label: city, terminals: ctx.bundle.ferryTerminals });
  const tz = tzOf(scope, place);
  const nights =
    args.nights ??
    nightsIn({
      interval: { from: checkInAt, to: checkOutAt },
      timeZone: tz,
      startHour: params.nightStartHour,
      endHour: params.nightEndHour,
      minHours: params.overnightMinHours,
    });
  return {
    leg: {
      ref,
      factId,
      kind: 'HOTEL',
      description: `hotel in ${placeName(place)}, ${nightsPhrase(nights)}`,
      from: place,
      to: place,
      departureAt: checkInAt,
      arrivalAt: checkOutAt,
      nights,
      status,
      verdict: status === 'cancel' ? 'cancelled' : 'ok',
      reason: status === 'cancel' ? 'cancelled by the option' : '',
      replacedBy: null,
    },
    mode: 'HOTEL',
    tz,
    boardBy: checkInAt,
    transferHours: 0,
    roadToTerminalHours: null,
    arrivalRoad: null,
    checkedIn: null,
    aliases: [...new Set(aliases.filter(Boolean))],
    replaces,
    settled: status === 'cancel',
    unusedReason: null,
  };
}

function gateCheckIn(ctx: Ctx, reservation: Reservation): boolean | null {
  const events = ctx.bundle.ferryTerminalEvents.filter(
    (e) => e.reservationId === reservation.id && (e.occurredAt ?? ctx.now) <= ctx.now
  );
  if (events.some((e) => e.kind === 'CHECK_IN_ACCEPTED')) return true;
  if (events.some((e) => e.kind === 'CHECK_IN_REJECTED')) return false;
  return null;
}

/** Bookings made through our tools (BOOKED facts) not cancelled by a TRAVEL_CANCELLED fact, as kept legs. */
function ourBookedLegs(scope: Scope, args: { cancel: string[] }): SimLeg[] {
  const { ctx } = scope;
  const { cancel } = args;
  const visible = ctx.facts.filter((f) => f.observedAt <= ctx.now);
  const cancelled = new Set(
    visible
      .filter((f) => f.kind === 'TRAVEL_CANCELLED')
      .map((f) => factValue<string>(f, 'bookingFactId'))
  );
  const out: SimLeg[] = [];
  for (const fact of visible) {
    if (!OUR_BOOKING.test(fact.sourceRef) || fact.level !== 'BOOKED' || cancelled.has(fact.id))
      continue;
    const aliases = [fact.id, factValue<string>(fact, 'quoteFactId') ?? '', fact.sourceRef];
    const status: ItineraryLegStatus = aliases.some((id) => id && cancel.includes(id))
      ? 'cancel'
      : 'keep';
    if (factValue<string>(fact, 'mode') === 'HOTEL') {
      const hotel = hotelFromFact(scope, { fact, replaces: [], status, aliases });
      if (hotel) out.push(hotel);
      continue;
    }
    const quote = resolveQuote({ ctx, factId: fact.id });
    if (!quote) continue;
    out.push(
      legFromQuote(scope, {
        quote: { ...quote, ref: fact.id, factId: fact.id },
        status,
        aliases,
        replaces: [],
        terminalIds: {
          from: factValue<string>(fact, 'originTerminalId'),
          to: factValue<string>(fact, 'destinationTerminalId'),
        },
      })
    );
  }
  return out;
}

/** The driver's live bookings (BOOKED, not cancelled) on this assignment; `cancel` marks those the option cancels. */
export function bookedLegs(scope: Scope, args: { cancel: string[]; warnings: string[] }): SimLeg[] {
  const { ctx } = scope;
  const { cancel, warnings } = args;
  const out: SimLeg[] = [];
  for (const r of ctx.reservations.filter((r) => r.status === 'BOOKED')) {
    const factId = bahnFactId('travel_reservations', r.id, reservationKind(r.kind));
    const aliases = [r.id, factId];
    const status: ItineraryLegStatus = aliases.some((id) => cancel.includes(id))
      ? 'cancel'
      : 'keep';
    if (r.kind === 'HOTEL') {
      out.push(
        legFromHotel(scope, {
          city: r.city ?? '?',
          checkInAt: r.checkInAt ?? r.departureAt,
          checkOutAt: r.checkOutAt ?? r.expectedArrivalAt,
          status,
          ref: r.id,
          factId,
          aliases,
          replaces: [],
        })
      );
      continue;
    }
    if (!TRAVEL_MODES.includes(r.kind as TravelMode)) {
      warnings.push(`Reservation ${r.id} of kind ${r.kind} is not checked.`);
      continue;
    }
    const option = ctx.bundle.travelOptions.find((o) => o.id === r.sourceOptionId);
    const estimate = ctx.bundle.terminalRoadEstimates.find(
      (e) => e.id === r.terminalRoadEstimateId
    );
    const quote: QuoteInput = {
      mode: r.kind as TravelMode,
      provider: r.provider,
      fromCity: r.originTerminal ?? r.fromCity ?? '?',
      toCity: r.destinationTerminal ?? r.toCity ?? '?',
      departureAt: r.departureAt,
      arrivalAt: r.expectedArrivalAt,
      checkInCutoffAt: r.checkInCutoffAt,
      checkedAt: r.bookedAt,
      priceCents: r.fareCents,
      currency: r.currency,
      roadTimeToTerminalHours:
        option?.roadTimeToTerminalHours ?? (estimate ? estimate.driveMinutesHigh / 60 : null),
      localTransferHours: r.localTransferHours,
      capacityNote: option?.capacityNote ?? null,
      ref: r.id,
      factId,
    };
    out.push(
      legFromQuote(scope, {
        quote,
        status,
        aliases,
        replaces: [],
        terminalIds: { from: r.originTerminalId, to: r.destinationTerminalId },
        checkedIn: r.kind === 'FERRY' ? gateCheckIn(ctx, r) : null,
      })
    );
  }
  return [...out, ...ourBookedLegs(scope, { cancel })];
}

function hotelFromFact(
  scope: Scope,
  args: {
    fact: Ctx['facts'][number];
    replaces: string[];
    // Our own BOOKED hotel facts are kept (or cancelled) legs; quotes are new ones.
    status?: ItineraryLegStatus;
    aliases?: string[];
  }
): SimLeg | null {
  const { params } = scope;
  const { fact, replaces, status = 'new', aliases = [fact.sourceRef, fact.id] } = args;
  const city = factValue<string>(fact, 'city');
  const checkIn = factValue<string>(fact, 'checkInAt');
  const count = factValue<number>(fact, 'nights') ?? 1;
  if (!city || !checkIn || count < 1) return null;
  const place = resolvePlace({ label: city, terminals: scope.ctx.bundle.ferryTerminals });
  const tz = tzOf(scope, place);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(checkIn);
  const first = dateOnly ? checkIn : localDate(new Date(checkIn), tz);
  const nights = Array.from({ length: count }, (_, i) => addDays(first, i));
  const window = (date: string) =>
    nightWindow({
      date,
      timeZone: tz,
      startHour: params.nightStartHour,
      endHour: params.nightEndHour,
    });
  return legFromHotel(scope, {
    city,
    checkInAt: dateOnly ? window(first).from : new Date(checkIn),
    checkOutAt: window(nights[nights.length - 1]).to,
    nights,
    status,
    ref: status === 'new' ? fact.sourceRef : fact.id,
    factId: fact.id,
    aliases,
    replaces,
  });
}

/** The change set's new legs; a leg that cannot be read becomes an UNRESOLVED_LEG gap. */
export function newLegs(
  scope: Scope,
  args: { changeSet: ItineraryChangeSet; gaps: ItineraryGap[]; warnings: string[] }
): SimLeg[] {
  const { ctx } = scope;
  const { changeSet, gaps, warnings } = args;
  const out: SimLeg[] = [];
  const unresolved = (ref: string) =>
    gaps.push({
      kind: 'UNRESOLVED_LEG',
      at: null,
      city: null,
      legRef: ref,
      message:
        'A proposed booking cites a quote that is not on record or has no times; it cannot be checked.',
    });
  for (const input of changeSet.add ?? []) {
    const replaces = input.replaces ?? [];
    if (input.source === 'hotel') {
      const hotel: HotelStayInput = input.hotel;
      out.push(
        legFromHotel(scope, {
          city: hotel.city,
          checkInAt: hotel.checkInAt,
          checkOutAt: hotel.checkOutAt,
          status: 'new',
          ref: hotel.ref ?? null,
          factId: hotel.factId ?? null,
          aliases: [hotel.ref ?? '', hotel.factId ?? ''],
          replaces,
        })
      );
      continue;
    }
    const fact = input.source === 'fact' ? ctx.facts.find((f) => f.id === input.factId) : undefined;
    if (input.source === 'fact' && !fact) {
      unresolved(input.factId);
      continue;
    }
    if (fact && factValue<string>(fact, 'mode') === 'HOTEL') {
      const hotel = hotelFromFact(scope, { fact, replaces });
      if (hotel) out.push(hotel);
      else unresolved(fact.id);
      continue;
    }
    if (fact && factValue<string>(fact, 'status') === 'SOLD_OUT')
      warnings.push(`Quote ${fact.id} had no space at the check.`);
    const quote =
      input.source === 'quote'
        ? input.quote
        : resolveQuote({
            ctx,
            travelOptionId: input.source === 'option' ? input.travelOptionId : undefined,
            factId: fact?.id,
          });
    if (!quote) {
      unresolved(input.source === 'option' ? input.travelOptionId : (fact?.id ?? '?'));
      continue;
    }
    out.push(
      legFromQuote(scope, {
        quote,
        status: 'new',
        aliases: [quote.ref ?? '', quote.factId ?? ''],
        replaces,
        terminalIds: fact
          ? {
              from: factValue<string>(fact, 'originTerminalId'),
              to: factValue<string>(fact, 'destinationTerminalId'),
            }
          : undefined,
      })
    );
  }
  return out;
}
