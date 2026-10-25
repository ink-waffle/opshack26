// Full-chain feasibility (pure, no DB or LLM): where the driver is across the remaining itinerary under a change set.

import type { DriverDuties } from '@/lib/bahn/drivers';
import type { OrderBundle } from '@/lib/bahn/orders';
import { buildCtx, type Ctx, driveHours, dutyRef, promiseDelta } from '@/lib/chain/compute';
import { bookedLegs, newLegs, nightsPhrase, type SimLeg } from '@/lib/chain/itinerary/legs';
import {
  type Interval,
  nightsIn,
  nightWindow,
  overlapHours,
  placeKey,
  placeName,
  placeTimezone,
  resolvePlace,
  samePlace,
} from '@/lib/chain/itinerary/places';
import {
  DEFAULT_ITINERARY_PARAMETERS,
  type ItineraryChangeSet,
  type ItineraryGap,
  type ItineraryLeg,
  type ItineraryNight,
  type ItineraryParameters,
  type ItineraryPlace,
  type ItineraryResult,
  type ItinerarySegment,
  type ItineraryStart,
  type ItineraryVerdict,
} from '@/lib/chain/itinerary/types';
import type { PromiseDelta } from '@/lib/chain/types';
import { addHours, formatLocal, formatWindow, HOUR_MS, round1 } from '@/lib/evidence/time';
import { projectOrderFacts } from '@/lib/facts/projection';
import type { FactLike } from '@/lib/facts/types';

export * from '@/lib/chain/itinerary/types';

type Window = { startAt: Date; endAt: Date };

type Sim = {
  ctx: Ctx;
  params: ItineraryParameters;
  now: Date;
  pickupPlace: ItineraryPlace;
  deliveryPlace: ItineraryPlace;
  slot: Window | null;
  window: (Window & { timezone: string; source: string }) | null;
  needsCrossing: boolean;
  trace: ItinerarySegment[];
  traceStart: Date | null;
  // null: where the driver is has no record yet (the next positioning leg is trusted).
  place: ItineraryPlace | null;
  readyAt: Date;
  phase: 'positioning' | 'returning' | 'stranded';
  hasCar: boolean;
  strandedAt: Date | null;
  gaps: ItineraryGap[];
  warnings: string[];
  pickupAt: Date | null;
  etaAt: Date | null;
  deliveredAt: Date | null;
  freeAfterDeliveryAt: Date | null;
  promise: PromiseDelta | null;
};

const FAR_FUTURE = new Date(8.64e15);

function tz(sim: Sim, place: ItineraryPlace | null): string {
  return placeTimezone({ place, bundle: sim.ctx.bundle, fallback: sim.ctx.pickupTz });
}

function when(sim: Sim, at: Date, place: ItineraryPlace | null): string {
  return formatLocal({ at, timeZone: tz(sim, place) });
}

/** Distinct places; of two in one city the one named by the city wins ('Tallinn' over 'Tallinn terminal'). */
function uniqPlaces(places: ItineraryPlace[]): ItineraryPlace[] {
  const out: ItineraryPlace[] = [];
  for (const place of places) {
    const index = out.findIndex((p) => samePlace(p, place));
    if (index < 0) out.push(place);
    else if (place.city && placeName(place) === place.label) out[index] = place;
  }
  return out;
}

function names(places: ItineraryPlace[]): string {
  return uniqPlaces(places).map(placeName).join(' or ');
}

function byDeparture(a: SimLeg, b: SimLeg): number {
  return a.leg.departureAt.getTime() - b.leg.departureAt.getTime();
}

function refOf(s: SimLeg): string | null {
  return s.leg.status === 'new' ? (s.leg.factId ?? s.leg.ref) : (s.leg.ref ?? s.leg.factId);
}

function settle(s: SimLeg, verdict: ItineraryVerdict, reason: string): void {
  s.leg.verdict = verdict;
  s.leg.reason = reason;
  s.settled = true;
}

function push(sim: Sim, segment: ItinerarySegment): void {
  if (segment.to && segment.to <= segment.from) return;
  sim.trace.push(segment);
}

function isStay(segment: ItinerarySegment): boolean {
  return ['wait', 'pickup', 'hold', 'deliver'].includes(segment.activity);
}

function interval(segment: ItinerarySegment): Interval {
  return { from: segment.from, to: segment.to ?? FAR_FUTURE };
}

function segmentAt(sim: Sim, at: Date): ItinerarySegment | null {
  return sim.trace.find((s) => s.from <= at && (s.to === null || at < s.to)) ?? null;
}

function describeAt(sim: Sim, at: Date): string {
  const segment = segmentAt(sim, at);
  if (segment) return segment.note;
  if (sim.traceStart && at < sim.traceStart)
    return `not on record before ${when(sim, sim.traceStart, sim.place)}`;
  return sim.place ? `in ${placeName(sim.place)}` : 'not on record';
}

function strand(sim: Sim, at: Date): void {
  sim.phase = 'stranded';
  sim.strandedAt = at;
}

function slotLabel(sim: Sim, slot: Window): string {
  return formatWindow({ startAt: slot.startAt, endAt: slot.endAt, timeZone: sim.ctx.pickupTz });
}

/** The driver takes a travel leg: wait where they are, then ride. */
function ride(sim: Sim, s: SimLeg): void {
  const { leg } = s;
  if (sim.place)
    push(sim, {
      activity: 'wait',
      places: [sim.place],
      from: sim.readyAt,
      to: leg.departureAt,
      withCar: false,
      legRef: null,
      note: `in ${placeName(sim.place)}`,
    });
  const readyAt = addHours({ at: leg.arrivalAt, hours: s.transferHours });
  push(sim, {
    activity: 'travel',
    places: [leg.from, leg.to],
    from: leg.departureAt,
    to: readyAt,
    withCar: false,
    legRef: refOf(s),
    note: `on the ${leg.description}`,
  });
  sim.place = leg.to;
  sim.readyAt = readyAt;
}

function evaluateTravel(sim: Sim, s: SimLeg): void {
  const { leg } = s;
  if (sim.place === null) {
    settle(s, 'ok', 'assumed: where the driver is before this leg is not on record');
    sim.traceStart ??= leg.departureAt;
    ride(sim, s);
    return;
  }
  if (leg.departureAt < sim.readyAt) {
    s.unusedReason = describeAt(sim, leg.departureAt);
    return;
  }
  if (sim.hasCar) {
    s.unusedReason = `still with the car in ${placeName(sim.place)}`;
    return;
  }
  if (!samePlace(leg.from, sim.place)) {
    s.unusedReason = `in ${placeName(sim.place)}`;
    return;
  }
  const ready = when(sim, sim.readyAt, leg.from);
  if (s.boardBy < sim.readyAt) {
    settle(
      s,
      'missed',
      `the driver is in ${placeName(leg.from)} only from ${ready}, after its boarding deadline ${when(sim, s.boardBy, leg.from)}`
    );
    return;
  }
  settle(s, 'ok', `the driver is in ${placeName(leg.from)} from ${ready}`);
  ride(sim, s);
}

/** Pickup → sailing(s) → delivery, run as soon as the driver is at the pickup (or already has the car). */
function runCustody(sim: Sim, ferries: SimLeg[]): void {
  const { ctx, params } = sim;
  const P = sim.pickupPlace;
  const D = sim.deliveryPlace;
  if (!sim.hasCar) {
    const ready = sim.readyAt;
    const slot = sim.slot;
    if (slot && ready > slot.endAt) {
      sim.gaps.push({
        kind: 'PICKUP_UNREACHABLE',
        at: ready,
        city: P.city,
        legRef: null,
        message: `The driver reaches ${placeName(P)} ${when(sim, ready, P)}, after the pickup slot ${slotLabel(sim, slot)} ends.`,
      });
      strand(sim, slot.endAt);
      return;
    }
    if (!slot)
      sim.warnings.push(
        `No pickup slot is on record; the car is assumed collected as soon as the driver is in ${placeName(P)}.`
      );
    const pickupAt = slot && slot.startAt > ready ? slot.startAt : ready;
    push(sim, {
      activity: 'wait',
      places: [P],
      from: ready,
      to: pickupAt,
      withCar: false,
      legRef: null,
      note: `in ${placeName(P)}, waiting for the pickup slot`,
    });
    sim.pickupAt = pickupAt;
    sim.readyAt = addHours({ at: pickupAt, hours: params.handoverHours });
    push(sim, {
      activity: 'pickup',
      places: [P],
      from: pickupAt,
      to: sim.readyAt,
      withCar: true,
      legRef: null,
      note: `collecting the car in ${placeName(P)}`,
    });
    sim.place = P;
    sim.hasCar = true;
  }
  // The plan's timeline: a car already collected left at the scan, not at `now`.
  const leaveAt = sim.readyAt;
  const handedOver = sim.pickupAt
    ? addHours({ at: sim.pickupAt, hours: params.handoverHours })
    : null;
  const origin = sim.place ?? P;
  let crossed: SimLeg | null = null;
  let firstMiss: SimLeg | null = null;
  for (const f of ferries) {
    if (f.settled) continue;
    const { leg } = f;
    const here = sim.place ?? origin;
    if (crossed) {
      if (samePlace(leg.from, crossed.leg.from) || samePlace(leg.to, crossed.leg.to)) {
        settle(f, 'redundant', `the car already crosses on the ${crossed.leg.description}`);
        continue;
      }
      if (!samePlace(leg.from, here)) {
        settle(f, 'unreachable', `when it sails the driver is ${describeAt(sim, leg.departureAt)}`);
        continue;
      }
    }
    let reason: string;
    if (f.checkedIn === true) reason = 'check-in accepted at the gate';
    else if (f.checkedIn === false) {
      settle(f, 'missed', 'check-in was rejected at the gate');
      firstMiss ??= f;
      continue;
    } else {
      // A terminal in the pickup city still takes the pickup → terminal road time.
      const road =
        !crossed && samePlace(here, P)
          ? f.roadToTerminalHours
          : samePlace(here, leg.from)
            ? 0
            : null;
      if (road === null) {
        sim.warnings.push(
          `Road time from ${placeName(here)} to ${leg.from.label} is unknown; the ${leg.description} is assumed reachable.`
        );
        reason = 'road time to the terminal unknown; assumed reachable';
      } else {
        const departFrom = crossed ? sim.readyAt : leaveAt;
        const atTerminal = addHours({ at: departFrom, hours: road });
        const cutoff = when(sim, f.boardBy, leg.from);
        if (atTerminal > f.boardBy) {
          const basis =
            sim.pickupAt && !crossed && departFrom.getTime() === handedOver?.getTime()
              ? `car collected ${when(sim, sim.pickupAt, P)}, ${params.handoverHours} h handover, ${round1(road)} h road`
              : `leaving ${placeName(here)} ${when(sim, departFrom, here)}, ${round1(road)} h road`;
          reason = `the driver reaches the terminal ${when(sim, atTerminal, leg.from)} (${basis}), after the check-in cutoff ${cutoff}`;
          settle(f, 'missed', reason);
          sim.gaps.push({
            kind: 'FERRY_CUTOFF',
            at: f.boardBy,
            city: leg.from.city,
            legRef: refOf(f),
            message: `The ${leg.description} is missed: ${reason}.`,
          });
          firstMiss ??= f;
          continue;
        }
        reason = `the driver reaches the terminal ${when(sim, atTerminal, leg.from)}, before the check-in cutoff ${cutoff}`;
      }
    }
    settle(f, 'ok', reason);
    const places = uniqPlaces([here, leg.from]);
    push(sim, {
      activity: 'wait',
      places,
      from: sim.readyAt,
      to: leg.departureAt,
      withCar: true,
      legRef: null,
      note: `with the car in ${names(places)}, waiting for the sailing`,
    });
    push(sim, {
      activity: 'sail',
      places: [leg.from, leg.to],
      from: leg.departureAt,
      to: leg.arrivalAt,
      withCar: true,
      legRef: refOf(f),
      note: `on the ${leg.description}`,
    });
    sim.place = leg.to;
    sim.readyAt = leg.arrivalAt;
    crossed = f;
  }
  if (sim.needsCrossing && !crossed) {
    const promise = promiseDelta({
      ctx,
      eta: { at: null, basis: 'no crossing the driver can make' },
      window: sim.window,
    });
    sim.promise = promise;
    const at = firstMiss?.boardBy ?? sim.readyAt;
    sim.gaps.push({
      kind: 'NO_CROSSING',
      at,
      city: D.city,
      legRef: null,
      message: `No sailing the driver can make is in the plan, so the car cannot reach ${placeName(D)}${promise.local ? ` for the promised window ${promise.local}` : ''}.`,
    });
    sim.place = origin;
    strand(sim, at);
    return;
  }
  let eta: Date | null = null;
  let basis = 'no route distance on record';
  if (crossed) {
    const road = crossed.arrivalRoad ?? {
      hours: params.defaultArrivalRoadHours,
      basis: `${params.defaultArrivalRoadHours} h terminal → delivery assumed`,
    };
    eta = addHours({ at: crossed.leg.arrivalAt, hours: road.hours });
    basis = `sailing arrives ${when(sim, crossed.leg.arrivalAt, crossed.leg.to)} + ${road.basis}`;
  } else if (ctx.routeKm !== null) {
    const hours = driveHours(ctx, ctx.routeKm);
    eta = addHours({ at: leaveAt, hours });
    basis = `${ctx.routeKm} km at ${params.roadSpeedKmh} km/h with rest (${round1(hours)} h)`;
  }
  const promise = promiseDelta({ ctx, eta: { at: eta, basis }, window: sim.window });
  sim.promise = promise;
  sim.etaAt = eta;
  if (eta && promise.verdict === 'breaks') {
    const deadline = promise.hardDeadlineAt;
    sim.gaps.push({
      kind: 'DELIVERY_LATE',
      at: eta,
      city: D.city,
      legRef: null,
      message: `Delivery ETA ${when(sim, eta, D)} is after the promised window ${promise.local ?? 'on record'}${deadline && eta > deadline ? ` and the hard deadline ${when(sim, deadline, D)}` : ''}; ${basis}.`,
    });
  }
  const arriveAt = eta ?? promise.endAt;
  if (!eta)
    sim.warnings.push(
      `Delivery ETA is unknown (${basis}); travel after the delivery is checked from the end of the delivery window.`
    );
  if (!arriveAt) {
    sim.warnings.push('No delivery window either; travel after the delivery is not checked.');
    sim.place = null;
    sim.hasCar = false;
    sim.phase = 'returning';
    return;
  }
  const deliverAt = promise.startAt && arriveAt < promise.startAt ? promise.startAt : arriveAt;
  const holds = deliverAt > arriveAt;
  const waits = holds ? ', waiting for the delivery window' : '';
  if (crossed) {
    const places = uniqPlaces([crossed.leg.to, D]);
    push(sim, {
      activity: holds ? 'hold' : 'drive',
      places,
      from: crossed.leg.arrivalAt,
      to: deliverAt,
      withCar: true,
      legRef: null,
      note: `with the car ${places.length > 1 ? `between ${places.map(placeName).join(' and ')}` : `in ${placeName(places[0])}`}${waits}`,
    });
  } else {
    push(sim, {
      activity: 'drive',
      places: [origin, D],
      from: leaveAt,
      to: arriveAt,
      withCar: true,
      legRef: null,
      note: `driving the car to ${placeName(D)}`,
    });
    push(sim, {
      activity: 'hold',
      places: [D],
      from: arriveAt,
      to: deliverAt,
      withCar: true,
      legRef: null,
      note: `with the car in ${placeName(D)}${waits}`,
    });
  }
  const free = addHours({ at: deliverAt, hours: params.handoverHours });
  push(sim, {
    activity: 'deliver',
    places: [D],
    from: deliverAt,
    to: free,
    withCar: true,
    legRef: null,
    note: `handing over the car in ${placeName(D)}`,
  });
  sim.deliveredAt = deliverAt;
  sim.freeAfterDeliveryAt = free;
  sim.place = D;
  sim.readyAt = free;
  sim.hasCar = false;
  sim.phase = 'returning';
}

function assumeAtPickup(sim: Sim, ferries: SimLeg[]): void {
  const at = sim.slot?.startAt ?? sim.now;
  sim.warnings.push(
    `Where the driver is before the pickup is not on record; assumed in ${placeName(sim.pickupPlace)} ${when(sim, at, sim.pickupPlace)}.`
  );
  sim.place = sim.pickupPlace;
  sim.readyAt = at;
  sim.traceStart ??= at;
  runCustody(sim, ferries);
}

/** Legs that departed before the driver's known position: consistent ones were taken, the rest missed. */
function judgeHistory(sim: Sim, legs: SimLeg[], start: { place: ItineraryPlace; at: Date }): void {
  const past = legs
    .filter((s) => s.mode !== 'HOTEL' && !s.settled && s.leg.departureAt < start.at)
    .sort((a, b) => byDeparture(b, a));
  const position = `the driver is in ${placeName(start.place)} ${when(sim, start.at, start.place)}`;
  let expected = start.place;
  for (const s of past) {
    const ends = s.mode === 'FERRY' ? [s.leg.to, sim.deliveryPlace] : [s.leg.to];
    if (ends.some((p) => samePlace(p, expected)) && s.leg.arrivalAt <= start.at) {
      settle(
        s,
        'ok',
        `departed before the driver's known position; consistent with it (${position})`
      );
      expected = s.mode === 'FERRY' ? sim.pickupPlace : s.leg.from;
      continue;
    }
    settle(
      s,
      samePlace(s.leg.from, expected) ? 'missed' : 'unreachable',
      `it departed ${when(sim, s.leg.departureAt, s.leg.from)}, and ${position}`
    );
  }
}

function forward(sim: Sim, legs: SimLeg[]): void {
  const travel = legs.filter((s) => s.mode === 'TRAVEL' && !s.settled).sort(byDeparture);
  const ferries = legs.filter((s) => s.mode === 'FERRY' && !s.settled).sort(byDeparture);
  const positioning = (s: SimLeg) => !sim.slot || s.leg.departureAt < sim.slot.endAt;
  const atPickup = () =>
    sim.phase === 'positioning' && !sim.hasCar && samePlace(sim.place, sim.pickupPlace);
  if (sim.phase === 'positioning') {
    if (sim.hasCar) runCustody(sim, ferries);
    else if (sim.place === null && !travel.some(positioning)) assumeAtPickup(sim, ferries);
    else if (atPickup()) runCustody(sim, ferries);
  }
  for (const s of travel) {
    if (s.settled) continue;
    if (sim.phase === 'positioning' && sim.place === null && !positioning(s))
      assumeAtPickup(sim, ferries);
    evaluateTravel(sim, s);
    if (atPickup()) runCustody(sim, ferries);
  }
  if (sim.phase === 'positioning' && !sim.hasCar) {
    if (sim.place === null) assumeAtPickup(sim, ferries);
    else {
      const slot = sim.slot;
      sim.gaps.push({
        kind: 'PICKUP_UNREACHABLE',
        at: slot?.startAt ?? null,
        city: sim.pickupPlace.city,
        legRef: null,
        message: `No booked or proposed travel takes the driver from ${placeName(sim.place)} to ${placeName(sim.pickupPlace)}${slot ? ` for the pickup slot ${slotLabel(sim, slot)}` : ''}.`,
      });
      strand(sim, slot?.endAt ?? sim.readyAt);
    }
  }
  for (const f of ferries)
    if (!f.settled) settle(f, 'unreachable', 'the driver does not collect the car before it sails');
  if (sim.place)
    push(sim, {
      activity: 'wait',
      places: [sim.place],
      from: sim.readyAt,
      to: null,
      withCar: sim.hasCar,
      legRef: null,
      note:
        sim.phase === 'stranded'
          ? `stuck${sim.hasCar ? ' with the car' : ''} in ${placeName(sim.place)}`
          : `in ${placeName(sim.place)}`,
    });
}

/** Unused travel legs: redundant when the driver is already at its destination when it arrives, else unreachable. */
function judgeUnused(sim: Sim, legs: SimLeg[]): void {
  for (const s of legs.filter((s) => s.mode === 'TRAVEL' && !s.settled)) {
    const there = segmentAt(sim, s.leg.arrivalAt);
    const at = `at departure the driver is ${s.unusedReason ?? 'elsewhere'}`;
    if (there && isStay(there) && there.places.length === 1 && samePlace(there.places[0], s.leg.to))
      settle(
        s,
        'redundant',
        `the driver is already in ${placeName(s.leg.to)} when it arrives (${at})`
      );
    else settle(s, 'unreachable', at);
  }
  const free = sim.freeAfterDeliveryAt;
  if (!free) return;
  const deadline = addHours({ at: free, hours: sim.params.transferBufferHours });
  for (const s of legs) {
    const late = s.leg.verdict === 'missed' || s.leg.verdict === 'unreachable';
    const returning = !sim.pickupAt || s.leg.departureAt > sim.pickupAt;
    if (s.mode !== 'TRAVEL' || !late || !returning || s.leg.departureAt >= deadline) continue;
    if (!samePlace(s.leg.from, sim.deliveryPlace)) continue;
    sim.gaps.push({
      kind: 'RETURN_BEFORE_DELIVERY',
      at: s.leg.departureAt,
      city: sim.deliveryPlace.city,
      legRef: refOf(s),
      message: `The ${s.leg.description} departs before the driver is free after the delivery in ${placeName(sim.deliveryPlace)} (${when(sim, free, sim.deliveryPlace)}).`,
    });
  }
}

function judgeHotels(sim: Sim, legs: SimLeg[], horizon: Date): void {
  const { params } = sim;
  for (const h of legs.filter((s) => s.mode === 'HOTEL' && !s.settled)) {
    const place = h.leg.from;
    const states = h.leg.nights.map((date) => {
      const window = nightWindow({
        date,
        timeZone: h.tz,
        startHour: params.nightStartHour,
        endHour: params.nightEndHour,
      });
      if (window.to <= horizon) return { date, window, state: 'past' as const };
      const used = sim.trace.some(
        (s) =>
          isStay(s) &&
          s.places.some((p) => samePlace(p, place)) &&
          overlapHours(interval(s), window) >= params.overnightMinHours
      );
      return { date, window, state: used ? ('used' as const) : ('unused' as const) };
    });
    const used = states.filter((s) => s.state === 'used').map((s) => s.date);
    const unused = states.filter((s) => s.state === 'unused');
    if (!unused.length) {
      settle(
        h,
        'ok',
        used.length
          ? `the driver stays in ${placeName(place)} on the ${nightsPhrase(used)}`
          : 'its nights are past'
      );
      continue;
    }
    const first = unused[0];
    const where = describeAt(
      sim,
      new Date((first.window.from.getTime() + first.window.to.getTime()) / 2)
    );
    const phrase = nightsPhrase(unused.map((s) => s.date));
    if (used.length) {
      settle(h, 'ok', `the driver stays in ${placeName(place)} on the ${nightsPhrase(used)}`);
      sim.warnings.push(
        `The ${h.leg.description} is only partly used: on the ${phrase} the driver is ${where}.`
      );
    } else if (sim.strandedAt && first.window.from >= sim.strandedAt)
      settle(
        h,
        'unreachable',
        `the plan breaks before then; on the ${phrase} the driver is ${where}`
      );
    else settle(h, 'redundant', `on the ${phrase} the driver is ${where}`);
  }
}

function nightsAndGaps(args: {
  sim: Sim;
  legs: SimLeg[];
  home: ItineraryPlace | null;
}): ItineraryNight[] {
  const { sim, legs, home } = args;
  const { params, now } = sim;
  const hotels = legs.filter((s) => s.mode === 'HOTEL' && s.leg.verdict === 'ok');
  const seen = new Set<string>();
  const out: ItineraryNight[] = [];
  for (const segment of sim.trace) {
    if (!isStay(segment) || !segment.to) continue;
    const zone = tz(sim, segment.places[0]);
    const from = new Date(Math.max(segment.from.getTime(), now.getTime() - 24 * HOUR_MS));
    if (from >= segment.to) continue;
    const dates = nightsIn({
      interval: { from, to: segment.to },
      timeZone: zone,
      startHour: params.nightStartHour,
      endHour: params.nightEndHour,
      minHours: params.overnightMinHours,
    });
    const held: string[] = [];
    const waiting: string[] = [];
    for (const date of dates) {
      const window = nightWindow({
        date,
        timeZone: zone,
        startHour: params.nightStartHour,
        endHour: params.nightEndHour,
      });
      const key = `${date}|${segment.places.map(placeKey).join('+')}`;
      if (window.to <= now || seen.has(key)) continue;
      seen.add(key);
      const atHome = !!home && segment.places.some((p) => samePlace(p, home));
      const hotel = hotels.find(
        (h) => h.leg.nights.includes(date) && segment.places.some((p) => samePlace(p, h.leg.from))
      );
      out.push({
        date,
        places: segment.places,
        hotel: hotel?.leg.description ?? null,
        home: atHome,
      });
      if (hotel || atHome) continue;
      // A night without a hotel is a cost decision for the card, not a broken booking.
      if (segment.activity === 'hold') held.push(date);
      else waiting.push(date);
    }
    if (waiting.length)
      sim.warnings.push(
        `No hotel is booked for the ${nightsPhrase(waiting)} in ${names(segment.places)}: the driver is ${segment.note}.`
      );
    if (held.length)
      sim.warnings.push(
        `No hotel is booked for the ${nightsPhrase(held)} while the driver holds the car in ${names(segment.places)} for the delivery window.`
      );
  }
  return out;
}

function checkNextDuty(args: {
  sim: Sim;
  duties: DriverDuties[] | undefined;
}): ItineraryResult['nextDuty'] {
  const { sim, duties } = args;
  const { ctx, params } = sim;
  const assignment = ctx.assignment;
  const driverDuties = duties?.find((d) => d.driver?.id === assignment?.driverId);
  if (!assignment || !driverDuties) return null;
  const startMs = (sim.slot?.startAt ?? assignment.startedAt ?? sim.now).getTime();
  const next = driverDuties.duties
    .map(dutyRef)
    .filter((d) => d.assignmentId !== assignment.id)
    .find((d) => (d.startAt?.getTime() ?? -Infinity) > startMs);
  if (!next?.startAt) return null;
  const city = next.startCity
    ? resolvePlace({ label: next.startCity, terminals: ctx.bundle.ferryTerminals })
    : null;
  const base = { orderRef: next.orderRef, city: next.startCity, startAt: next.startAt };
  if (sim.phase !== 'returning' || !sim.place) return { ...base, readyAt: null, ok: false };
  const sameCity = !city || samePlace(sim.place, city);
  const needed = sameCity ? params.transferBufferHours : params.nextDutyMinGapHours;
  const ok = addHours({ at: sim.readyAt, hours: needed }) <= next.startAt;
  const free = `the driver is free in ${placeName(sim.place)} only ${when(sim, sim.readyAt, sim.place)}`;
  const starts = `${city ? ` in ${placeName(city)}` : ''} ${when(sim, next.startAt, city)}`;
  if (!ok)
    sim.gaps.push({
      kind: 'NEXT_DUTY_UNREACHABLE',
      at: next.startAt,
      city: next.startCity,
      legRef: null,
      message: `The driver's next duty starts${starts}, but ${free}${sameCity ? '' : `, with no travel there booked and under ${params.nextDutyMinGapHours} h to get there`}.`,
    });
  else if (!sameCity && city)
    sim.warnings.push(
      `No travel from ${placeName(sim.place)} to the next duty in ${placeName(city)} is booked (${round1((next.startAt.getTime() - sim.readyAt.getTime()) / HOUR_MS)} h between).`
    );
  return { ...base, readyAt: sim.readyAt, ok };
}

function sameRoute(a: SimLeg, b: SimLeg): boolean {
  if (a.mode !== b.mode || !samePlace(a.leg.from, b.leg.from)) return false;
  if (a.mode === 'HOTEL') return a.leg.nights.some((d) => b.leg.nights.includes(d));
  return samePlace(a.leg.to, b.leg.to);
}

const VERDICT_PHRASE: Record<ItineraryVerdict, string> = {
  ok: 'is fine',
  unreachable: 'cannot be used',
  missed: 'is missed',
  redundant: 'is no longer needed',
  cancelled: 'is cancelled',
};

/** Simulates the driver through every remaining leg under the change set; pure, deterministic. */
export function checkItinerary(args: {
  bundle: OrderBundle;
  facts?: FactLike[];
  now: Date;
  duties?: DriverDuties[];
  changeSet?: ItineraryChangeSet;
  start?: ItineraryStart;
  assignmentId?: string;
  parameters?: Partial<ItineraryParameters>;
}): ItineraryResult {
  const { bundle, now, duties, changeSet = {}, start, assignmentId } = args;
  const params = { ...DEFAULT_ITINERARY_PARAMETERS, ...(args.parameters ?? {}) };
  const facts = args.facts ?? projectOrderFacts({ bundle });
  const ctx = buildCtx({ bundle, facts, now, params, assignmentId });
  const scope = { ctx, params };
  const gaps: ItineraryGap[] = [];
  const warnings: string[] = [];
  const cancel = changeSet.cancel ?? [];
  const legs = [
    ...bookedLegs(scope, { cancel, warnings }),
    ...newLegs(scope, { changeSet, gaps, warnings }),
  ];
  for (const id of cancel)
    if (!legs.some((s) => s.aliases.includes(id)))
      warnings.push(`Cancellation ${id} matches no live booking of this driver.`);
  const active = legs.filter((s) => s.leg.status !== 'cancel');
  const terminals = bundle.ferryTerminals;
  const pickupPlace = ctx.pickupCity
    ? resolvePlace({ label: ctx.pickupCity, terminals })
    : { label: 'the pickup address', city: null };
  const deliveryPlace = ctx.deliveryCity
    ? resolvePlace({ label: ctx.deliveryCity, terminals })
    : { label: 'the delivery address', city: null };
  const sim: Sim = {
    ctx,
    params,
    now,
    pickupPlace,
    deliveryPlace,
    slot:
      changeSet.pickupSlot ??
      (ctx.pickupSlot ? { startAt: ctx.pickupSlot.startAt, endAt: ctx.pickupSlot.endAt } : null),
    window: changeSet.deliveryWindow
      ? { ...changeSet.deliveryWindow, timezone: ctx.deliveryTz, source: 'PROPOSED' }
      : null,
    needsCrossing: ctx.ferryRoute || legs.some((s) => s.mode === 'FERRY'),
    trace: [],
    traceStart: null,
    place: null,
    readyAt: now,
    phase: 'positioning',
    hasCar: false,
    strandedAt: null,
    gaps,
    warnings,
    pickupAt: null,
    etaAt: null,
    deliveredAt: null,
    freeAfterDeliveryAt: null,
    promise: null,
  };

  for (const s of active)
    if (s.mode !== 'HOTEL' && s.leg.status === 'new' && s.leg.departureAt <= now)
      settle(s, 'missed', `it departs ${when(sim, s.leg.departureAt, s.leg.from)}, before now`);

  const pickedUpAt = ctx.pickedUpAt && ctx.pickedUpAt <= now ? ctx.pickedUpAt : null;
  const deliveredAt = ctx.deliveredAt && ctx.deliveredAt <= now ? ctx.deliveredAt : null;
  let startInfo: ItineraryResult['start'] = { city: null, at: null, basis: 'not on record' };
  let known: { place: ItineraryPlace; at: Date } | null = null;
  if (start) {
    known = { place: resolvePlace({ label: start.city, terminals }), at: start.at };
    sim.hasCar =
      !!pickedUpAt && pickedUpAt <= start.at && !(deliveredAt && deliveredAt <= start.at);
    if (deliveredAt && deliveredAt <= start.at) sim.phase = 'returning';
    startInfo = { city: start.city, at: start.at, basis: 'given' };
  } else if (deliveredAt) {
    known = { place: deliveryPlace, at: deliveredAt };
    sim.phase = 'returning';
    startInfo = { city: deliveryPlace.city, at: deliveredAt, basis: 'delivery scan' };
  } else if (pickedUpAt) {
    known = { place: pickupPlace, at: pickedUpAt };
    sim.hasCar = true;
    sim.pickupAt = pickedUpAt;
    startInfo = { city: pickupPlace.city, at: pickedUpAt, basis: 'pickup scan' };
  }
  if (known) {
    sim.place = known.place;
    sim.readyAt = known.at;
    sim.traceStart = known.at;
    if (sim.phase === 'returning') sim.deliveredAt = sim.freeAfterDeliveryAt = deliveredAt;
    judgeHistory(sim, active, known);
  }

  forward(sim, active);
  judgeUnused(sim, active);
  const horizon = new Date(Math.max(now.getTime(), sim.traceStart?.getTime() ?? 0));
  judgeHotels(sim, active, horizon);
  const homeCity = ctx.assignment?.driver?.homeCity ?? null;
  const home = homeCity ? resolvePlace({ label: homeCity, terminals }) : null;
  const nights = nightsAndGaps({ sim, legs: active, home });
  const nextDuty = checkNextDuty({ sim, duties });

  const news = legs.filter((s) => s.leg.status === 'new');
  for (const s of legs) {
    if (s.leg.status !== 'keep' || !['missed', 'unreachable'].includes(s.leg.verdict)) continue;
    const by =
      news.find((n) => n.replaces.some((id) => s.aliases.includes(id))) ??
      news.find((n) => sameRoute(n, s));
    if (by) s.leg.replacedBy = refOf(by);
  }
  const broken = (leg: ItineraryLeg) => !['ok', 'cancelled'].includes(leg.verdict);
  const unaddressedLegs = legs.filter(
    (s) => s.leg.status === 'keep' && broken(s.leg) && !s.leg.replacedBy
  );
  const relevant = gaps.filter((g) => {
    const s = g.legRef ? legs.find((l) => l.aliases.includes(g.legRef ?? '')) : undefined;
    return !s || s.leg.status === 'new' || unaddressedLegs.includes(s);
  });
  const gapFor = (s: SimLeg) => relevant.find((g) => g.legRef && s.aliases.includes(g.legRef));
  const violations: string[] = [];
  const used = new Set<ItineraryGap>();
  for (const s of [...unaddressedLegs, ...news.filter((n) => broken(n.leg))].sort(byDeparture)) {
    const gap = gapFor(s);
    if (gap) used.add(gap);
    const prefix = s.leg.status === 'new' ? 'Proposed' : 'Booked';
    const suffix =
      s.leg.status === 'new'
        ? ''
        : s.leg.verdict === 'redundant'
          ? ' The option does not cancel it.'
          : ' The option neither cancels nor replaces it.';
    violations.push(
      `${gap ? gap.message : `${prefix} ${s.leg.description} ${VERDICT_PHRASE[s.leg.verdict]}: ${s.leg.reason}.`}${suffix}`
    );
  }
  for (const gap of relevant) if (!used.has(gap)) violations.push(gap.message);

  const out = [...legs].sort(byDeparture).map((s) => s.leg);
  return {
    feasible: violations.length === 0,
    start: startInfo,
    legs: out,
    unaddressed: unaddressedLegs.sort(byDeparture).map((s) => s.leg),
    gaps: relevant,
    violations,
    warnings,
    pickup: {
      city: ctx.pickupCity,
      slotStartAt: sim.slot?.startAt ?? null,
      slotEndAt: sim.slot?.endAt ?? null,
      at: sim.pickupAt,
    },
    delivery: {
      city: ctx.deliveryCity,
      etaAt: sim.etaAt,
      at: sim.deliveredAt,
      promise: sim.promise,
    },
    nextDuty,
    nights,
    trace: sim.trace,
  };
}
