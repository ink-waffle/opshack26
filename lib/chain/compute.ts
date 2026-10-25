// Pure chain calculator (decision_tree §6): promise slack, decide-by, driver duty chain, bookings, cost, approvals.

import type { DriverDuties } from '@/lib/bahn/drivers';
import type { OrderBundle } from '@/lib/bahn/orders';
import {
  type ChainOption,
  type ChainParameters,
  type ChainResult,
  type CostDelta,
  type CostLine,
  type DecideBy,
  type DecideByKind,
  DEFAULT_CHAIN_PARAMETERS,
  type DriverChainDelta,
  type DutyRef,
  type NotifyItem,
  type PromiseDelta,
  type QuoteInput,
  type TravelMode,
} from '@/lib/chain/types';
import {
  addHours,
  cityTimezone,
  formatLocal,
  formatMoney,
  formatWindow,
  hoursBetween,
  minutesBetween,
  round1,
} from '@/lib/evidence/time';
import { bahnDedupeKey, factIdFor } from '@/lib/facts/ids';
import { projectOrderFacts } from '@/lib/facts/projection';
import { type FactLike, factValue } from '@/lib/facts/types';
import type { ActionClass } from '@/lib/gate/actions';

type Assignment = OrderBundle['assignments'][number];
type Reservation = OrderBundle['travelReservations'][number];
type TimeWindow = OrderBundle['timeWindows'][number];
type Duty = DriverDuties['duties'][number];

export type Ctx = {
  bundle: OrderBundle;
  now: Date;
  params: ChainParameters;
  facts: FactLike[];
  assignment: Assignment | null;
  pickupSlot: TimeWindow | null;
  promise: TimeWindow | null;
  hardDeadline: TimeWindow | null;
  pickupCity: string | null;
  deliveryCity: string | null;
  pickupTz: string;
  deliveryTz: string;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  reservations: Reservation[];
  bookedFerry: Reservation | null;
  routeKm: number | null;
  ferryRoute: boolean;
  unknownAttempts: FactLike[];
};

type Eta = { at: Date | null; basis: string };

export function bahnFactId(
  collection: string,
  recordId: string,
  kind: string,
  suffix?: string
): string {
  return factIdFor(bahnDedupeKey({ collection, recordId, kind, suffix }));
}

export function reservationKind(mode: string): string {
  return mode === 'FERRY' ? 'FERRY_BOOKING' : mode === 'HOTEL' ? 'HOTEL_BOOKING' : 'TRAVEL_BOOKING';
}

function pickAssignment(bundle: OrderBundle, assignmentId?: string): Assignment | null {
  if (assignmentId) return bundle.assignments.find((a) => a.id === assignmentId) ?? null;
  const live = bundle.assignments.filter((a) => !a.cancelledAt && a.status !== 'CANCELLED');
  return (
    live.find((a) => a.status === 'IN_PROGRESS') ??
    live.find((a) => a.status === 'ASSIGNED') ??
    live.at(-1) ??
    null
  );
}

function selectedWindow(bundle: OrderBundle, purposes: string[]): TimeWindow | null {
  for (const purpose of purposes) {
    const windows = bundle.timeWindows.filter((w) => w.purpose === purpose);
    const window = windows.find((w) => w.isSelected) ?? windows.at(-1);
    if (window) return window;
  }
  return null;
}

function eventTime(bundle: OrderBundle, command: string): Date | null {
  const events = bundle.events.filter((e) => e.command === command);
  const last = events.at(-1);
  if (!last) return null;
  const occurred = (last.changes as Record<string, unknown> | null)?.occurred_at;
  return typeof occurred === 'string' ? new Date(occurred) : last.recordedAt;
}

export function buildCtx(args: {
  bundle: OrderBundle;
  facts: FactLike[];
  now: Date;
  params: ChainParameters;
  assignmentId?: string;
}): Ctx {
  const { bundle, facts, now, params, assignmentId } = args;
  const assignment = pickAssignment(bundle, assignmentId);
  const address = (id: string | null | undefined) =>
    bundle.addresses.find((a) => a.id === id) ?? null;
  const pickupAddress = address(bundle.order.pickupAddressId);
  const deliveryAddress = address(bundle.order.deliveryAddressId);
  const pickupSlot = selectedWindow(bundle, ['SELECTED_PICKUP_SLOT']);
  const promise = selectedWindow(bundle, ['CUSTOMER_DELIVERY_PROMISE', 'SELECTED_DELIVERY_SLOT']);
  const visible = facts.filter((f) => f.observedAt <= now);
  // A provider-confirmed cancellation through our tools (TRAVEL_CANCELLED) counts like Bahn's cancelledAt.
  const cancelledIds = new Set(
    visible
      .filter((f) => f.kind === 'TRAVEL_CANCELLED')
      .map((f) => factValue<string>(f, 'reservationId'))
  );
  const reservations = bundle.travelReservations.filter(
    (r) =>
      (!assignment || r.assignmentId === assignment.id) && !r.cancelledAt && !cancelledIds.has(r.id)
  );
  const segments = bundle.activePlan?.segments ?? [];
  const reconciled = visible.filter((f) => f.kind === 'BOOKING_RECONCILED');
  const unknownAttempts = visible.filter(
    (attempt) =>
      attempt.kind === 'BOOKING_OUTCOME_UNKNOWN' &&
      !reconciled.some(
        (r) =>
          r.observedAt >= attempt.observedAt &&
          (factValue(r, 'proposalId') === factValue(attempt, 'proposalId') ||
            factValue(r, 'attemptFactId') === attempt.id)
      )
  );
  return {
    bundle,
    now,
    params,
    facts,
    assignment,
    pickupSlot,
    promise,
    hardDeadline: bundle.timeWindows.find((w) => w.commitmentDeadlineAt) ?? null,
    pickupCity: pickupAddress?.city ?? null,
    deliveryCity: deliveryAddress?.city ?? null,
    pickupTz: pickupSlot?.timezone ?? pickupAddress?.timezone ?? 'UTC',
    deliveryTz: promise?.timezone ?? deliveryAddress?.timezone ?? 'UTC',
    pickedUpAt: eventTime(bundle, 'vehicle.picked_up'),
    deliveredAt: eventTime(bundle, 'vehicle.delivered'),
    reservations,
    bookedFerry: reservations.find((r) => r.kind === 'FERRY' && r.status === 'BOOKED') ?? null,
    routeKm: segments.length ? segments.reduce((sum, s) => sum + s.distanceKm, 0) : null,
    ferryRoute:
      segments.some((s) => s.transportMode === 'DRIVE_WITH_FERRY') ||
      bundle.travelOptions.some((o) => o.kind === 'FERRY'),
    unknownAttempts,
  };
}

function local(at: Date | null | undefined, timeZone: string | null | undefined): string {
  return at ? formatLocal({ at, timeZone }) : 'unknown';
}

const ARRIVAL_ROAD = /about (\d+(?:\.\d+)?) hours? from (?:the )?arrival terminal/i;

export function arrivalRoadHours(args: {
  ctx: Ctx;
  capacityNote?: string | null;
  explicit?: number | null;
}): {
  hours: number;
  basis: string;
} {
  const { ctx, capacityNote, explicit } = args;
  if (explicit !== null && explicit !== undefined)
    return { hours: explicit, basis: `${explicit} h terminal → delivery` };
  const parsed = capacityNote ? ARRIVAL_ROAD.exec(capacityNote) : null;
  if (parsed)
    return { hours: Number(parsed[1]), basis: `${parsed[1]} h terminal → delivery (quote note)` };
  const hours = ctx.params.defaultArrivalRoadHours;
  return { hours, basis: `${hours} h terminal → delivery assumed (no road time on record)` };
}

export function driveHours(ctx: Ctx, km: number): number {
  const driving = km / ctx.params.roadSpeedKmh;
  const rests = Math.floor(driving / ctx.params.dailyDrivingHours) * ctx.params.dailyRestHours;
  return driving + rests;
}

function bookedFerryEta(ctx: Ctx, ferry: Reservation): Eta {
  const option = ctx.bundle.travelOptions.find((o) => o.id === ferry.sourceOptionId);
  const road = arrivalRoadHours({ ctx, capacityNote: option?.capacityNote });
  return {
    at: addHours({ at: ferry.expectedArrivalAt, hours: road.hours }),
    basis: `booked sailing ref ${ferry.bookingReference} arrives ${local(ferry.expectedArrivalAt, ctx.deliveryTz)} + ${road.basis}`,
  };
}

function roadOnlyEta(ctx: Ctx, from: Date, label: string): Eta {
  if (ctx.routeKm === null) return { at: null, basis: 'no route distance on record' };
  const hours = driveHours(ctx, ctx.routeKm);
  const at = addHours({ at: from, hours });
  at.setUTCSeconds(0, 0);
  return {
    at,
    basis: `planning estimate: ${label} + ${ctx.routeKm} km at ${ctx.params.roadSpeedKmh} km/h with rest (${round1(hours)} h)`,
  };
}

function currentEta(ctx: Ctx): Eta {
  if (ctx.deliveredAt) return { at: ctx.deliveredAt, basis: 'delivery scan' };
  if (ctx.bookedFerry) return bookedFerryEta(ctx, ctx.bookedFerry);
  if (ctx.ferryRoute) return { at: null, basis: 'no crossing booked (quotes only); no ETA basis' };
  const tracking = [...ctx.bundle.trackingObservations]
    .filter((o) => o.observedAt <= ctx.now)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())
    .at(-1);
  if (tracking) {
    return {
      at: tracking.estimatedDeliveryAt,
      basis: `app estimate (${tracking.locationQuality.toLowerCase()}) from ${local(tracking.observedAt, ctx.pickupTz)}`,
    };
  }
  if (ctx.pickedUpAt) return roadOnlyEta(ctx, ctx.pickedUpAt, 'pickup scan');
  if (ctx.pickupSlot) return roadOnlyEta(ctx, ctx.pickupSlot.endAt, 'pickup slot end');
  return { at: null, basis: 'no pickup slot or ETA on record' };
}

export function promiseDelta(args: {
  ctx: Ctx;
  eta: Eta;
  window?: { startAt: Date; endAt: Date; timezone: string; source: string } | null;
}): PromiseDelta {
  const { ctx, eta } = args;
  const record = ctx.promise;
  const window =
    args.window ??
    (record
      ? {
          startAt: record.startAt,
          endAt: record.endAt,
          timezone: record.timezone,
          source: record.source,
        }
      : null);
  const kind = record?.purpose === 'CUSTOMER_DELIVERY_PROMISE' ? 'PROMISE_WINDOW' : 'SLOT_WINDOW';
  const deadline = ctx.hardDeadline?.commitmentDeadlineAt ?? null;
  const base = {
    windowId: args.window ? null : (record?.id ?? null),
    factId: !args.window && record ? bahnFactId('time_windows', record.id, kind) : null,
    purpose: args.window ? 'PROPOSED_WINDOW' : (record?.purpose ?? null),
    startAt: window?.startAt ?? null,
    endAt: window?.endAt ?? null,
    timezone: window?.timezone ?? null,
    local: window
      ? formatWindow({ startAt: window.startAt, endAt: window.endAt, timeZone: window.timezone })
      : null,
    source: window?.source ?? null,
    customerAgreed: !args.window && ['CUSTOMER', 'SITE'].includes(record?.source ?? ''),
    hardDeadlineAt: deadline,
    etaAt: eta.at,
    etaLocal: eta.at ? formatLocal({ at: eta.at, timeZone: ctx.deliveryTz }) : null,
    etaBasis: eta.basis,
  };
  if (!window || !eta.at) {
    return {
      ...base,
      slackHours: null,
      earlyHours: null,
      verdict: 'unknown',
      keepsPromise: null,
      custodyNights: 0,
    };
  }
  const slack = hoursBetween({ from: eta.at, to: window.endAt });
  const early = hoursBetween({ from: eta.at, to: window.startAt });
  const breaks = slack < 0 || (deadline !== null && eta.at > deadline);
  const verdict = breaks ? 'breaks' : early > ctx.params.earlyCustodyHours ? 'early' : 'holds';
  return {
    ...base,
    slackHours: round1(slack),
    earlyHours: round1(early),
    verdict,
    keepsPromise: !breaks,
    custodyNights: verdict === 'early' ? Math.ceil(early / 24) : 0,
  };
}

function makeDecideBy(args: {
  at: Date;
  kind: DecideByKind;
  reason: string;
  factId: string | null;
  timeZone: string | null;
}): DecideBy {
  const { at, kind, reason, factId, timeZone } = args;
  const localAt = formatLocal({ at, timeZone });
  return { at, local: localAt, kind, reason, label: `until ${localAt} — ${reason}`, factId };
}

function isStarted(ctx: Ctx): boolean {
  return !!ctx.assignment?.startedAt || !!ctx.pickedUpAt;
}

function decideByCandidates(ctx: Ctx): DecideBy[] {
  const { now } = ctx;
  const out: DecideBy[] = [];
  const paid = ctx.reservations
    .filter((r) => r.status === 'BOOKED' && r.kind !== 'HOTEL' && r.departureAt > now)
    .sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());
  const firstPaid = paid[0];
  if (firstPaid) {
    out.push(
      makeDecideBy({
        at: firstPaid.departureAt,
        kind: 'FIRST_PAID_DEPARTURE',
        reason: `departure of the paid ${firstPaid.kind.toLowerCase()} ${firstPaid.fromCity ?? firstPaid.originTerminal ?? '?'} → ${firstPaid.toCity ?? firstPaid.destinationTerminal ?? '?'} (${formatMoney({ cents: firstPaid.fareCents, currency: firstPaid.currency })}, ref ${firstPaid.bookingReference})`,
        factId: bahnFactId('travel_reservations', firstPaid.id, reservationKind(firstPaid.kind)),
        timeZone: cityTimezone(firstPaid.fromCity) ?? ctx.pickupTz,
      })
    );
  }
  const ferry = ctx.bookedFerry;
  const checkedIn = ctx.bundle.ferryTerminalEvents.some(
    (e) =>
      e.reservationId === ferry?.id &&
      e.kind === 'CHECK_IN_ACCEPTED' &&
      (e.occurredAt ?? now) <= now
  );
  if (ferry?.checkInCutoffAt && ferry.checkInCutoffAt > now && !checkedIn) {
    out.push(
      makeDecideBy({
        at: ferry.checkInCutoffAt,
        kind: 'FERRY_CUTOFF',
        reason: `check-in cutoff for the booked ferry ref ${ferry.bookingReference}; no gate check-in on record`,
        factId: bahnFactId('travel_reservations', ferry.id, 'FERRY_BOOKING'),
        timeZone: cityTimezone(ferry.fromCity) ?? ctx.pickupTz,
      })
    );
  }
  const assignment = ctx.assignment;
  if (assignment && !isStarted(ctx)) {
    const positioningBooked = ctx.reservations.some(
      (r) => r.status === 'BOOKED' && !['FERRY', 'HOTEL'].includes(r.kind)
    );
    const slotStart = ctx.pickupSlot?.startAt ?? null;
    if (!positioningBooked) {
      const feasible = ctx.bundle.travelOptions
        .filter(
          (o) =>
            o.assignmentId === assignment.id &&
            o.kind !== 'FERRY' &&
            o.status === 'AVAILABLE_QUOTE' &&
            o.departureAt > now &&
            (!slotStart ||
              addHours({ at: o.arrivalAt, hours: o.localTransferHours ?? 0 }) <= slotStart)
        )
        .sort((a, b) => (a.quoteCents ?? Infinity) - (b.quoteCents ?? Infinity));
      const cheapest = feasible[0];
      if (cheapest) {
        out.push(
          makeDecideBy({
            at: cheapest.departureAt,
            kind: 'POSITIONING_PURCHASE',
            reason: `last chance to buy the cheapest positioning ${cheapest.kind.toLowerCase()} ${cheapest.fromCity} → ${cheapest.toCity} (${formatMoney({ cents: cheapest.quoteCents, currency: cheapest.currency })}, quote only); no positioning is booked`,
            factId: bahnFactId('travel_options', cheapest.id, 'TRAVEL_QUOTE'),
            timeZone: cityTimezone(cheapest.fromCity) ?? ctx.pickupTz,
          })
        );
      }
    }
    if (slotStart && slotStart > now) {
      out.push(
        makeDecideBy({
          at: slotStart,
          kind: 'SLOT_START',
          reason: `pickup slot starts in ${ctx.pickupCity ?? 'the pickup city'} (assignment not started)`,
          factId: ctx.pickupSlot
            ? bahnFactId('time_windows', ctx.pickupSlot.id, 'SLOT_WINDOW')
            : null,
          timeZone: ctx.pickupTz,
        })
      );
    }
  }
  const limits = ctx.facts
    .filter((f) => f.kind === 'DRIVER_STATED_LIMIT' && f.observedAt <= now)
    .map((f) => ({ fact: f, at: factValue<string>(f, 'at') }))
    .filter((l): l is { fact: FactLike; at: string } => !!l.at && new Date(l.at) > now);
  for (const limit of limits) {
    out.push(
      makeDecideBy({
        at: new Date(limit.at),
        kind: 'DRIVER_STATED_LIMIT',
        reason: `the driver's own limit (${factValue<string>(limit.fact, 'quote') ?? 'stated in chat'})`,
        factId: limit.fact.id,
        timeZone: ctx.pickupTz,
      })
    );
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function dutyRef(duty: Duty): DutyRef {
  const first = duty.segments[0];
  const last = duty.segments.at(-1);
  return {
    assignmentId: duty.assignment.id,
    orderId: duty.assignment.orderId,
    orderRef: duty.order?.reference ?? null,
    status: duty.assignment.status,
    startAt: duty.startAt,
    endAt: duty.endAt,
    startCity: first?.from?.address?.city ?? null,
    endCity: last?.to?.address?.city ?? null,
  };
}

function gap(from: Date | null | undefined, to: Date | null | undefined): number | null {
  return from && to ? round1(hoursBetween({ from, to })) : null;
}

function driverChain(args: {
  ctx: Ctx;
  duties: DriverDuties | undefined;
  driverId: string;
  current: DutyRef;
  usePositioningRecord: boolean;
}): DriverChainDelta {
  const { ctx, duties, driverId, current, usePositioningRecord } = args;
  const others = (duties?.duties ?? [])
    .map(dutyRef)
    .filter((d) => d.assignmentId !== current.assignmentId);
  const startMs = current.startAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const previous =
    others.filter((d) => (d.startAt?.getTime() ?? Infinity) < startMs).at(-1) ?? null;
  const next = others.find((d) => (d.startAt?.getTime() ?? -Infinity) > startMs) ?? null;
  const gapBefore = gap(previous?.endAt, current.startAt);
  const gapAfter = gap(current.endAt, next?.startAt);
  const notes: string[] = [];
  const positioning = usePositioningRecord
    ? (ctx.assignment?.positioning as Record<string, any> | null)
    : null;
  let mismatch = false;
  let positioningRecord: DriverChainDelta['positioningRecord'] = null;
  if (positioning && typeof positioning === 'object' && ctx.assignment) {
    positioningRecord = {
      factId: bahnFactId('work_assignments', ctx.assignment.id, 'POSITIONING_PLAN'),
      previousAssignmentId: positioning.previous_assignment_id ?? null,
      previousOrderId: positioning.previous_order_id ?? null,
      plannedReleaseCity: positioning.planned_release_city ?? null,
    };
    const wrongDuty =
      !!previous &&
      !!positioningRecord.previousAssignmentId &&
      positioningRecord.previousAssignmentId !== previous.assignmentId;
    const wrongCity =
      !!previous?.endCity &&
      !!positioningRecord.plannedReleaseCity &&
      positioningRecord.plannedReleaseCity !== previous.endCity;
    mismatch = wrongDuty || wrongCity;
    if (mismatch && previous) {
      const recorded = others.find(
        (d) => d.assignmentId === positioningRecord?.previousAssignmentId
      );
      notes.push(
        `Positioning record assumes the driver starts from ${recorded?.orderRef ?? positioningRecord.previousOrderId ?? 'another duty'} in ${positioningRecord.plannedReleaseCity ?? '?'}, but the duty before this one is ${previous.orderRef ?? previous.assignmentId}, ending in ${previous.endCity ?? '?'} ${local(previous.endAt, cityTimezone(previous.endCity) ?? ctx.pickupTz)}.`
      );
    }
  }
  const atRisk = gapAfter !== null && gapAfter < ctx.params.nextDutyMinGapHours;
  if (atRisk && next) {
    notes.push(
      `Next duty ${next.orderRef ?? next.assignmentId} starts ${local(next.startAt, cityTimezone(next.startCity) ?? ctx.pickupTz)} in ${next.startCity ?? '?'}, only ${gapAfter} h after this one ends.`
    );
  }
  if (!duties) notes.push('Driver duties were not loaded; previous and next duty unknown.');
  return {
    driverId,
    previous,
    current,
    next,
    gapBeforeHours: gapBefore,
    gapAfterHours: gapAfter,
    positioningRecord,
    flags: { positioning_record_mismatch: mismatch, next_duty_at_risk: atRisk },
    notes,
  };
}

function currentDutyRef(ctx: Ctx, endAt: Date | null): DutyRef | null {
  const assignment = ctx.assignment;
  if (!assignment) return null;
  return {
    assignmentId: assignment.id,
    orderId: assignment.orderId,
    orderRef: ctx.bundle.order.reference,
    status: assignment.status,
    startAt: ctx.pickupSlot?.startAt ?? assignment.startedAt,
    endAt: endAt ?? ctx.promise?.endAt ?? null,
    startCity: ctx.pickupCity,
    endCity: ctx.deliveryCity,
  };
}

export function resolveQuote(args: {
  ctx: Ctx;
  travelOptionId?: string;
  factId?: string;
  quote?: QuoteInput;
}): QuoteInput | null {
  const { ctx, travelOptionId, factId, quote } = args;
  if (quote) return quote;
  const fromFact = factId ? ctx.facts.find((f) => f.id === factId) : undefined;
  // A projected fact stands for its record; a tool fact keeps its own (fresher) times and price.
  const optionId =
    travelOptionId ??
    (fromFact?.sourceType === 'BAHN_RECORD' ? factValue<string>(fromFact, 'travelOptionId') : null);
  const option = optionId ? ctx.bundle.travelOptions.find((o) => o.id === optionId) : undefined;
  if (option) {
    return {
      mode: option.kind as TravelMode,
      provider: option.provider,
      fromCity: option.fromCity,
      toCity: option.toCity,
      departureAt: option.departureAt,
      arrivalAt: option.arrivalAt,
      checkInCutoffAt: option.checkInCutoffAt,
      checkedAt: option.checkedAt,
      priceCents: option.quoteCents,
      currency: option.currency,
      roadTimeToTerminalHours: option.roadTimeToTerminalHours,
      localTransferHours: option.localTransferHours,
      capacityNote: option.capacityNote,
      ref: option.id,
      factId: bahnFactId(
        'travel_options',
        option.id,
        option.kind === 'FERRY'
          ? option.status === 'SOLD_OUT'
            ? 'FERRY_SOLD_OUT'
            : 'FERRY_QUOTE'
          : 'TRAVEL_QUOTE'
      ),
    };
  }
  if (fromFact) {
    const date = (key: string) => {
      const value = factValue<string>(fromFact, key);
      return value ? new Date(value) : null;
    };
    const departureAt = date('departureAt');
    const arrivalAt = date('arrivalAt');
    if (!departureAt || !arrivalAt) return null;
    const linkedId =
      factValue<string>(fromFact, 'travelOptionId') ??
      factValue<string>(fromFact, 'datasetOptionId');
    const linked = linkedId ? ctx.bundle.travelOptions.find((o) => o.id === linkedId) : undefined;
    return {
      mode: (factValue<string>(fromFact, 'mode') ?? 'FERRY') as TravelMode,
      provider: factValue<string>(fromFact, 'provider'),
      fromCity: factValue<string>(fromFact, 'fromCity') ?? '?',
      toCity: factValue<string>(fromFact, 'toCity') ?? '?',
      departureAt,
      arrivalAt,
      checkInCutoffAt: date('checkInCutoffAt'),
      checkedAt: date('checkedAt') ?? fromFact.observedAt,
      priceCents:
        factValue<number>(fromFact, 'quoteCents') ?? factValue<number>(fromFact, 'priceCents'),
      currency: factValue<string>(fromFact, 'currency'),
      roadTimeToTerminalHours:
        factValue<number>(fromFact, 'roadTimeToTerminalHours') ??
        linked?.roadTimeToTerminalHours ??
        null,
      arrivalRoadHours: factValue<number>(fromFact, 'arrivalRoadHours'),
      localTransferHours:
        factValue<number>(fromFact, 'localTransferHours') ?? linked?.localTransferHours ?? null,
      capacityNote: factValue<string>(fromFact, 'capacityNote') ?? linked?.capacityNote ?? null,
      ref: fromFact.sourceRef,
      factId: fromFact.id,
    };
  }
  return null;
}

function quoteFreshness(
  ctx: Ctx,
  quote: QuoteInput
): { age: number; freshness: 'fresh' | 'warn' | 'stale' } {
  const age = Math.round(minutesBetween({ from: quote.checkedAt, to: ctx.now }));
  const freshness =
    age > ctx.params.quoteBlockMinutes
      ? 'stale'
      : age > ctx.params.quoteWarnMinutes
        ? 'warn'
        : 'fresh';
  return { age, freshness };
}

export function roadToTerminalHours(ctx: Ctx, quote: QuoteInput): number | null {
  if (quote.roadTimeToTerminalHours !== null && quote.roadTimeToTerminalHours !== undefined) {
    return quote.roadTimeToTerminalHours;
  }
  const estimate = ctx.bundle.terminalRoadEstimates.find((e) => e.fromCity === ctx.pickupCity);
  return estimate ? estimate.driveMinutesHigh / 60 : null;
}

function costOf(lines: CostLine[], unknown: string[]): CostDelta {
  return {
    eurCents: lines
      .filter((l) => l.known && l.currency === 'EUR')
      .reduce((sum, l) => sum + (l.cents ?? 0), 0),
    lines,
    unknown,
    nonEur: lines
      .filter((l) => l.known && l.currency !== 'EUR')
      .map((l) => `${l.label}: ${formatMoney({ cents: l.cents, currency: l.currency })}`),
  };
}

function bookingFromReservation(ctx: Ctx, r: Reservation): ChainResult['bookings']['keep'][number] {
  return {
    mode: r.kind,
    ref: r.id,
    factId: bahnFactId('travel_reservations', r.id, reservationKind(r.kind)),
    description: `${r.kind.toLowerCase()} ${r.fromCity ?? r.city ?? r.originTerminal ?? '?'}${r.toCity ? ` → ${r.toCity}` : ''} ${local(r.departureAt, cityTimezone(r.fromCity ?? r.city) ?? ctx.pickupTz)}, ref ${r.bookingReference}`,
    departureAt: r.departureAt,
    costCents: r.fareCents,
    currency: r.currency ?? 'EUR',
  };
}

function uniqClasses(classes: ActionClass[]): ActionClass[] {
  return [...new Set(classes)];
}

function lockNotes(ctx: Ctx): string[] {
  return ctx.unknownAttempts.map(
    (attempt) =>
      `G9: purchases locked until the earlier attempt ${factValue<string>(attempt, 'proposalId') ?? attempt.id} (${formatLocal({ at: attempt.observedAt, timeZone: ctx.pickupTz })}) is reconciled with the provider.`
  );
}

function customerNotify(verdict: PromiseDelta['verdict']): NotifyItem {
  if (verdict === 'breaks') {
    return {
      party: 'customer',
      mode: 'draft',
      reason: 'Approval request for a new delivery time (G6); nothing changes until approved.',
    };
  }
  if (verdict === 'early') {
    return {
      party: 'customer',
      mode: 'draft',
      reason:
        'Informational: promise holds; early arrival means custody until the window or an early delivery the customer must agree.',
    };
  }
  return {
    party: 'customer',
    mode: 'draft',
    reason: 'Informational only: the promise is unchanged.',
  };
}

/** Deterministic deltas of one option for one order (decision_tree §6). */
export function computeChain(args: {
  bundle: OrderBundle;
  facts?: FactLike[];
  option: ChainOption;
  now: Date;
  duties?: DriverDuties[];
  parameters?: Partial<ChainParameters>;
}): ChainResult {
  const { bundle, option, now, duties } = args;
  const params = { ...DEFAULT_CHAIN_PARAMETERS, ...(args.parameters ?? {}) };
  const facts = args.facts ?? projectOrderFacts({ bundle });
  const ctx = buildCtx({ bundle, facts, now, params, assignmentId: option.assignmentId });
  const assignment = ctx.assignment;
  const driverDuties = duties?.find((d) => d.driver?.id === assignment?.driverId);
  const warnings: string[] = [];
  const create: ChainResult['bookings']['create'] = [];
  const cancel: ChainResult['bookings']['cancel'] = [];
  const costLines: CostLine[] = [];
  const unknownCosts: string[] = [];
  const approvals: ActionClass[] = [];
  const notify: NotifyItem[] = [];
  const extraDecideBy: DecideBy[] = [];
  let feasible = true;
  let eta = currentEta(ctx);
  let window: { startAt: Date; endAt: Date; timezone: string; source: string } | null = null;
  let label = 'Keep the current plan';
  let chainDriverId = assignment?.driverId ?? null;
  let chainDuties = driverDuties;
  let usePositioningRecord = true;
  const locks = lockNotes(ctx);

  if (option.type === 'NEW_SAILING' || option.type === 'NEW_TRAIN') {
    const quote = resolveQuote({
      ctx,
      travelOptionId: option.travelOptionId,
      factId: option.factId,
      quote: option.quote,
    });
    if (!quote) {
      warnings.push('The quote could not be resolved from records or facts.');
      feasible = false;
    } else {
      const fromTz = cityTimezone(quote.fromCity) ?? ctx.pickupTz;
      const { age, freshness } = quoteFreshness(ctx, quote);
      const price = formatMoney({ cents: quote.priceCents, currency: quote.currency });
      label = `${option.type === 'NEW_SAILING' ? 'Sailing' : quote.mode.toLowerCase()} ${quote.fromCity} → ${quote.toCity} ${local(quote.departureAt, fromTz)} (${price})`;
      if (freshness === 'stale')
        warnings.push(
          `Quote is ${age} min old (over ${params.quoteBlockMinutes}); refresh capacity before booking (G5).`
        );
      if (freshness === 'warn')
        warnings.push(
          `Quote is ${age} min old (over ${params.quoteWarnMinutes}); refresh soon (G5).`
        );
      if (quote.departureAt <= now) {
        feasible = false;
        warnings.push('This departure is already in the past.');
      }
      create.push({
        mode: quote.mode,
        ref: quote.ref ?? null,
        factId: quote.factId ?? null,
        description: `${quote.mode.toLowerCase()} ${quote.fromCity} → ${quote.toCity} ${local(quote.departureAt, fromTz)}`,
        departureAt: quote.departureAt,
        costCents: quote.priceCents ?? null,
        currency: quote.currency ?? 'EUR',
        quoteAgeMinutes: age,
        quoteFreshness: freshness,
      });
      costLines.push({
        label: `${quote.mode.toLowerCase()} quote`,
        cents: quote.priceCents ?? null,
        currency: quote.currency ?? 'EUR',
        known: quote.priceCents !== null && quote.priceCents !== undefined,
      });
      approvals.push('BOOK_TRAVEL');
      if (option.type === 'NEW_SAILING') {
        extraDecideBy.push(
          ...(quote.checkInCutoffAt && quote.checkInCutoffAt > now
            ? [
                makeDecideBy({
                  at: quote.checkInCutoffAt,
                  kind: 'OPTION_CUTOFF',
                  reason: `check-in cutoff of the ${local(quote.departureAt, fromTz)} sailing`,
                  factId: quote.factId ?? null,
                  timeZone: fromTz,
                }),
              ]
            : [])
        );
        const leaveAt = ctx.pickedUpAt ? now : (ctx.pickupSlot?.endAt ?? now);
        const road = roadToTerminalHours(ctx, quote);
        if (road === null) {
          warnings.push('Road time from pickup to the terminal is unknown.');
        } else if (quote.checkInCutoffAt) {
          const atTerminal = addHours({ at: leaveAt, hours: road });
          const waitHours = hoursBetween({ from: atTerminal, to: quote.checkInCutoffAt });
          if (waitHours < 0) {
            feasible = false;
            warnings.push(
              `The driver cannot reach the terminal before the cutoff (earliest ${local(atTerminal, fromTz)} after ${road} h road).`
            );
          } else if (waitHours > params.overnightWaitHours) {
            const nights = Math.ceil(waitHours / 24);
            create.push({
              mode: 'HOTEL',
              ref: null,
              factId: null,
              description: `hotel near the ${quote.fromCity}, ${nights} night(s) before the cutoff`,
              departureAt: null,
              costCents: null,
              currency: 'EUR',
              nights,
            });
            unknownCosts.push(`hotel near the terminal × ${nights} night(s) (price X)`);
          }
          if (road > params.dailyDrivingHours)
            warnings.push(
              `Road leg to the terminal is ${road} h; driver rest stops are not modelled.`
            );
        }
        const arrival = arrivalRoadHours({
          ctx,
          capacityNote: quote.capacityNote,
          explicit: quote.arrivalRoadHours,
        });
        eta = {
          at: addHours({ at: quote.arrivalAt, hours: arrival.hours }),
          basis: `sailing arrives ${local(quote.arrivalAt, ctx.deliveryTz)} + ${arrival.basis}`,
        };
        const existing = ctx.reservations.filter(
          (r) => r.kind === 'FERRY' && r.status === 'BOOKED'
        );
        for (const r of existing) {
          cancel.push({ ...bookingFromReservation(ctx, r), refundability: 'unknown' });
          approvals.push('CANCEL_TRAVEL');
        }
        unknownCosts.push('driver return travel after delivery (X)');
        notify.push({
          party: 'driver',
          mode: 'auto',
          reason: 'New sailing, terminal cutoff and overnight plan.',
        });
      } else {
        const transfer = quote.localTransferHours ?? 0;
        const atPickup = addHours({ at: quote.arrivalAt, hours: transfer });
        const slotStart = ctx.pickupSlot?.startAt;
        const slotEnd = ctx.pickupSlot?.endAt;
        if (slotEnd && atPickup > slotEnd) {
          feasible = false;
          warnings.push(
            `Arrives ${local(atPickup, ctx.pickupTz)} incl. ${transfer} h transfer, after the pickup slot ends.`
          );
        } else if (slotStart && atPickup > slotStart) {
          warnings.push(
            `Arrives ${local(atPickup, ctx.pickupTz)} incl. ${transfer} h transfer, after the slot starts.`
          );
        }
        extraDecideBy.push(
          makeDecideBy({
            at: quote.departureAt,
            kind: 'OPTION_DEPARTURE',
            reason: `the ${quote.mode.toLowerCase()} ${quote.fromCity} → ${quote.toCity} departs (${price})`,
            factId: quote.factId ?? null,
            timeZone: fromTz,
          })
        );
        notify.push({
          party: 'driver',
          mode: 'auto',
          reason: 'Positioning ticket and arrival time.',
        });
      }
    }
  } else if (option.type === 'HOTEL_NIGHTS') {
    label = `Hotel ${option.nights} night(s)${option.city ? ` in ${option.city}` : ''}`;
    create.push({
      mode: 'HOTEL',
      ref: null,
      factId: null,
      description: label,
      departureAt: null,
      costCents: option.costCents ?? null,
      currency: option.currency ?? 'EUR',
      nights: option.nights,
    });
    if (option.costCents !== null && option.costCents !== undefined) {
      costLines.push({
        label: 'hotel',
        cents: option.costCents,
        currency: option.currency ?? 'EUR',
        known: true,
      });
    } else {
      unknownCosts.push(`hotel × ${option.nights} night(s) (price X)`);
    }
    approvals.push('BOOK_TRAVEL');
    notify.push({ party: 'driver', mode: 'auto', reason: 'Hotel details.' });
  } else if (option.type === 'MOVE_PICKUP_SLOT') {
    label = `Move the pickup slot to ${formatWindow({ startAt: option.startAt, endAt: option.endAt, timeZone: ctx.pickupTz })}`;
    if (ctx.pickedUpAt) {
      feasible = false;
      warnings.push('The car is already collected; a pickup slot move does not apply.');
    }
    if (ctx.bookedFerry) {
      const cutoff = ctx.bookedFerry.checkInCutoffAt;
      const option0 = ctx.bundle.travelOptions.find(
        (o) => o.id === ctx.bookedFerry?.sourceOptionId
      );
      const road = option0?.roadTimeToTerminalHours ?? null;
      if (cutoff && road !== null && addHours({ at: option.endAt, hours: road }) > cutoff) {
        warnings.push('The new slot no longer reaches the booked ferry cutoff.');
        eta = { at: null, basis: 'booked sailing missed with the new slot; next sailing unknown' };
      }
    } else if (!ctx.ferryRoute) {
      eta = roadOnlyEta(ctx, option.endAt, 'new pickup slot end');
    } else {
      eta = { at: null, basis: 'no crossing booked (quotes only); no ETA basis' };
    }
    approvals.push('CHANGE_WINDOW');
    notify.push(
      {
        party: 'site',
        mode: 'auto',
        reason: 'Ask the site first whether it can release the car in the new slot (ASK_SITE).',
      },
      { party: 'driver', mode: 'auto', reason: 'New pickup time once agreed.' }
    );
    warnings.push("Check the site's opening hours and release rules for the new slot.");
  } else if (option.type === 'REPLACE_DRIVER') {
    label = `Replace the driver with ${option.driverId}`;
    chainDriverId = option.driverId;
    chainDuties = duties?.find((d) => d.driver?.id === option.driverId);
    usePositioningRecord = false;
    for (const r of ctx.reservations.filter(
      (r) => r.status === 'BOOKED' && (r.checkOutAt ?? r.departureAt) > now
    )) {
      cancel.push({ ...bookingFromReservation(ctx, r), refundability: 'unknown' });
    }
    const atStake = cancel.reduce(
      (sum, b) => sum + (b.currency === 'EUR' ? (b.costCents ?? 0) : 0),
      0
    );
    if (atStake)
      warnings.push(
        `${formatMoney({ cents: atStake, currency: 'EUR' })} of the current driver's paid travel is at stake (refundability unknown).`
      );
    approvals.push('MARKET', 'CHANGE_ASSIGNMENT');
    if (cancel.length) approvals.push('CANCEL_TRAVEL');
    unknownCosts.push('new driver positioning (X)', 'payout decision for the current driver (X)');
    warnings.push('Keep the current assignment until the backup accepts (G7); never double-book.');
    notify.push(
      {
        party: 'driver',
        mode: 'auto',
        reason: 'Current driver: stand down only after the backup accepts.',
      },
      {
        party: 'other_driver',
        mode: 'auto',
        reason: `Directed offer to ${option.driverId} (MARKET needs a yes).`,
      },
      { party: 'site', mode: 'auto', reason: 'Driver name change for release.' }
    );
  } else if (option.type === 'EARLY_DELIVERY') {
    label = `Deliver early: ${formatWindow({ startAt: option.startAt, endAt: option.endAt, timeZone: ctx.deliveryTz })}`;
    window = {
      startAt: option.startAt,
      endAt: option.endAt,
      timezone: ctx.deliveryTz,
      source: 'PROPOSED',
    };
    approvals.push('CHANGE_WINDOW', 'CUSTOMER_MESSAGE');
    notify.push(
      {
        party: 'customer',
        mode: 'draft',
        reason:
          'Ask the customer to accept the earlier delivery (G6: nothing changes until approved).',
      },
      { party: 'driver', mode: 'auto', reason: 'Delivery time once the customer agrees.' }
    );
  }

  const promise = promiseDelta({ ctx, eta, window });
  if (promise.verdict === 'breaks' && option.type !== 'EARLY_DELIVERY') {
    approvals.push('CHANGE_WINDOW', 'CUSTOMER_MESSAGE');
    warnings.push(
      'This option breaks the promise: needs a customer-approved new window (P11, G6).'
    );
  }
  if (promise.custodyNights > 0) {
    unknownCosts.push(
      `custody until the window: driver keeps car and keys, ${promise.custodyNights} night(s) (X), or early delivery if the customer agrees`
    );
  }
  if (option.type === 'MOVE_PICKUP_SLOT') {
    notify.push({
      party: 'customer',
      mode: 'draft',
      reason: 'Approval request for the new pickup slot; the site must agree first.',
    });
    if (!approvals.includes('CUSTOMER_MESSAGE')) approvals.push('CUSTOMER_MESSAGE');
  } else if (
    option.type !== 'EARLY_DELIVERY' &&
    option.type !== 'NO_CHANGE' &&
    option.type !== 'HOTEL_NIGHTS'
  ) {
    notify.push(customerNotify(promise.verdict));
    if (!approvals.includes('CUSTOMER_MESSAGE')) approvals.push('CUSTOMER_MESSAGE');
  }
  if (approvals.includes('BOOK_TRAVEL') && locks.length) warnings.push(...locks);

  let chain: DriverChainDelta | null = null;
  if (chainDriverId) {
    const current = currentDutyRef(ctx, promise.etaAt);
    if (current && option.type === 'MOVE_PICKUP_SLOT') {
      current.startAt = option.startAt;
    }
    if (current) {
      chain = driverChain({
        ctx,
        duties: chainDuties,
        driverId: chainDriverId,
        current,
        usePositioningRecord,
      });
      if (chain.flags.next_duty_at_risk && chain.next) {
        notify.push({
          party: 'other_driver',
          mode: 'auto',
          reason: `Next duty ${chain.next.orderRef ?? chain.next.assignmentId} may be affected.`,
        });
      }
    }
  }

  // Only future deadlines; a new driver makes the current driver's positioning purchase moot.
  const candidates = [...decideByCandidates(ctx), ...extraDecideBy]
    .filter((c) => c.at > ctx.now)
    .filter((c) => option.type !== 'REPLACE_DRIVER' || c.kind !== 'POSITIONING_PURCHASE')
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const keep = ctx.reservations
    .filter((r) => r.status === 'BOOKED' && !cancel.some((c) => c.ref === r.id))
    .map((r) => bookingFromReservation(ctx, r));

  return {
    option,
    label,
    feasible,
    promise,
    decideBy: candidates[0] ?? null,
    decideByCandidates: candidates,
    driverChain: chain,
    bookings: { create, cancel, keep },
    cost: costOf(costLines, unknownCosts),
    approvals: uniqClasses(approvals),
    notify,
    locks,
    warnings,
  };
}

/** The order's own decide-by right now (earliest of paid departure, cutoff, positioning purchase, driver limit, slot start). */
export function deriveDecideBy(args: { bundle: OrderBundle; facts?: FactLike[]; now: Date }): {
  decideBy: DecideBy | null;
  candidates: DecideBy[];
} {
  const { bundle, now } = args;
  const facts = args.facts ?? projectOrderFacts({ bundle });
  const ctx = buildCtx({ bundle, facts, now, params: DEFAULT_CHAIN_PARAMETERS });
  const candidates = decideByCandidates(ctx);
  return { decideBy: candidates[0] ?? null, candidates };
}
