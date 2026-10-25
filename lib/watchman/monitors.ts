import type {
  BahnFerryTerminalEvent,
  BahnOperationalEvent,
  BahnOrder,
  BahnTimeWindow,
  BahnTrackingObservation,
  BahnTransportPoint,
  BahnTransportSegment,
  BahnTravelOption,
  BahnTravelReservation,
  BahnWorkAssignment,
} from '@/lib/generated/prisma/client';
import { fmtAt, fmtDuration, fmtUtc, hoursBetween, money } from '@/lib/watchman/format';
import type { TriggerType } from '@/lib/watchman/taxonomy';

// Deterministic time monitors (decision_tree.md §4.1): pure functions over (bundle, now).

type Lean<T> = Omit<T, 'raw'>;

// The slice of an OrderBundle the monitors read; a full OrderBundle satisfies it.
export type MonitorBundle = {
  order: Lean<BahnOrder>;
  activePlan: {
    id: string;
    points: Lean<BahnTransportPoint>[];
    segments: Lean<BahnTransportSegment>[];
  } | null;
  timeWindows: Lean<BahnTimeWindow>[];
  assignments: Lean<BahnWorkAssignment>[];
  travelReservations: Lean<BahnTravelReservation>[];
  travelOptions: Lean<BahnTravelOption>[];
  events: Lean<BahnOperationalEvent>[];
  trackingObservations: Lean<BahnTrackingObservation>[];
  ferryTerminalEvents: Lean<BahnFerryTerminalEvent>[];
};

export const MONITOR_IDS = ['M1', 'M2', 'M8', 'M10'] as const;
export type MonitorId = (typeof MONITOR_IDS)[number];

export type MonitorHit = {
  monitor: MonitorId;
  // Dedupe key `${monitor}:${orderId}:${ref}`: one signal per (order, monitor, slot / reservation / …).
  key: string;
  orderId: string;
  orderRef: string;
  triggerType: TriggerType;
  ref: string;
  summary: string;
  detail: Record<string, unknown>;
};

export const MONITOR_PARAMS = {
  M1: { cutoffWithinHours: 6 },
  // 0 = fire once the slot has started; the brief's backtest used 60 (starts within the hour).
  M2: { leadMinutes: 0 },
  M8: { staleHours: 3, skipWhileOnBookedFerry: true },
  M10: { arrivalBufferHours: 3 },
};

export type MonitorParams = typeof MONITOR_PARAMS;

export const MONITOR_LABELS: Record<MonitorId, string> = {
  M1: 'Booked ferry, cutoff within 6 h, no gate check-in',
  M2: 'Pickup slot started or ended, assignment not started, no pickup event',
  M8: 'In progress with no or stale tracking (> 3 h)',
  M10: 'Sold-out crossing, no ferry booked: earliest quote vs promise',
};

const ACTIVE_ORDER_STATUSES = new Set(['NEW', 'WAITING_FOR_PICKUP', 'IN_TRANSIT']);

export function isActiveOrder(order: Lean<BahnOrder>): boolean {
  return ACTIVE_ORDER_STATUSES.has(order.status) && !order.cancelledAt;
}

const HOUR = 3_600_000;
const le = (date: Date | null | undefined, now: Date) => !!date && date.getTime() <= now.getTime();

function hit(args: Omit<MonitorHit, 'key'>): MonitorHit {
  return { ...args, key: `${args.monitor}:${args.orderId}:${args.ref}` };
}

/** M1: booked ferry, check-in cutoff within N h, no gate check-in → CROSSING_AT_RISK (signal only). */
export function monitorM1(args: { bundle: MonitorBundle; now: Date; params?: MonitorParams }) {
  const { bundle, now, params = MONITOR_PARAMS } = args;
  const hits: MonitorHit[] = [];
  for (const res of bundle.travelReservations) {
    if (res.kind !== 'FERRY' || res.status !== 'BOOKED' || res.cancelledAt || !res.checkInCutoffAt)
      continue;
    const untilCutoffH = hoursBetween(now, res.checkInCutoffAt);
    if (untilCutoffH < 0 || untilCutoffH > params.M1.cutoffWithinHours) continue;
    const gateAccepted =
      res.checkInConfirmation === 'CONFIRMED_BY_GATE_SCAN' ||
      bundle.ferryTerminalEvents.some(
        (e) => e.reservationId === res.id && e.kind === 'CHECK_IN_ACCEPTED' && le(e.occurredAt, now)
      );
    if (gateAccepted) continue;
    hits.push(
      hit({
        monitor: 'M1',
        orderId: bundle.order.id,
        orderRef: bundle.order.reference,
        triggerType: 'CROSSING_AT_RISK',
        ref: res.id,
        summary: `Booked ferry ${res.routeLabel} (${res.bookingReference}) has its check-in cutoff ${fmtAt(res.checkInCutoffAt, now)}; no gate check-in recorded.`,
        detail: {
          reservationId: res.id,
          cutoffAt: res.checkInCutoffAt.toISOString(),
          departureAt: res.departureAt.toISOString(),
          minutesToCutoff: Math.round(untilCutoffH * 60),
          checkInConfirmation: res.checkInConfirmation,
        },
      })
    );
  }
  return hits;
}

/** M2: selected pickup slot started (or ended), assignment not started, no pickup event → PICKUP_NOT_CONFIRMED. */
export function monitorM2(args: { bundle: MonitorBundle; now: Date; params?: MonitorParams }) {
  const { bundle, now, params = MONITOR_PARAMS } = args;
  const hits: MonitorHit[] = [];
  const segments = bundle.activePlan?.segments ?? [];
  for (const assignment of bundle.assignments) {
    if (assignment.status !== 'ASSIGNED' || assignment.cancelledAt) continue;
    if (le(assignment.startedAt, now)) continue;
    const segment = segments.find((s) => s.id === assignment.segmentIds[0]);
    if (!segment) continue;
    const slot = bundle.timeWindows.find(
      (w) =>
        w.pointId === segment.fromPointId && w.isSelected && w.purpose === 'SELECTED_PICKUP_SLOT'
    );
    if (!slot || slot.startAt.getTime() - params.M2.leadMinutes * 60_000 > now.getTime()) continue;
    const pickedUp = bundle.events.some(
      (e) =>
        e.command === 'vehicle.picked_up' &&
        le(e.recordedAt, now) &&
        (e.targetId === segment.fromPointId ||
          (e.changes as { segment_id?: string } | null)?.segment_id === segment.id)
    );
    if (pickedUp) continue;
    const phase = slot.endAt.getTime() <= now.getTime() ? 'ended' : 'started';
    hits.push(
      hit({
        monitor: 'M2',
        orderId: bundle.order.id,
        orderRef: bundle.order.reference,
        triggerType: 'PICKUP_NOT_CONFIRMED',
        ref: slot.id,
        summary: `Pickup slot ${fmtUtc(slot.startAt)}–${fmtUtc(slot.endAt)} ${phase === 'ended' ? `ended ${fmtDuration(now.getTime() - slot.endAt.getTime())} ago` : `started ${fmtDuration(now.getTime() - slot.startAt.getTime())} ago`}; assignment ${assignment.id} (${assignment.driverId}) not started, no pickup event.`,
        detail: {
          phase,
          slotId: slot.id,
          slotStartAt: slot.startAt.toISOString(),
          slotEndAt: slot.endAt.toISOString(),
          slotTimezone: slot.timezone,
          assignmentId: assignment.id,
          driverId: assignment.driverId,
        },
      })
    );
  }
  return hits;
}

/** M8: assignment in progress with no tracking or a last observation older than N h → SIGNAL_GAP (signal only). */
export function monitorM8(args: { bundle: MonitorBundle; now: Date; params?: MonitorParams }) {
  const { bundle, now, params = MONITOR_PARAMS } = args;
  const hits: MonitorHit[] = [];
  for (const assignment of bundle.assignments) {
    if (assignment.status !== 'IN_PROGRESS' || le(assignment.completedAt, now)) continue;
    if (params.M8.skipWhileOnBookedFerry) {
      const onFerry = bundle.travelReservations.some(
        (r) =>
          r.kind === 'FERRY' &&
          r.status === 'BOOKED' &&
          r.assignmentId === assignment.id &&
          le(r.departureAt, now) &&
          r.expectedArrivalAt.getTime() > now.getTime()
      );
      if (onFerry) continue;
    }
    const observations = bundle.trackingObservations
      .filter((o) => o.assignmentId === assignment.id && le(o.receivedAt, now))
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
    const last = observations[0];
    const since = last?.observedAt ?? assignment.startedAt;
    const ageH = since ? hoursBetween(since, now) : Infinity;
    if (ageH <= params.M8.staleHours) continue;
    hits.push(
      hit({
        monitor: 'M8',
        orderId: bundle.order.id,
        orderRef: bundle.order.reference,
        triggerType: 'SIGNAL_GAP',
        ref: `${assignment.id}:${last?.id ?? 'none'}`,
        summary: last
          ? `Assignment ${assignment.id} in progress; last tracking observation ${fmtAt(last.observedAt, now)} (${last.locationQuality}).`
          : `Assignment ${assignment.id} in progress since ${assignment.startedAt ? fmtAt(assignment.startedAt, now) : 'unknown'}; no tracking observation at all.`,
        detail: {
          assignmentId: assignment.id,
          lastObservationId: last?.id ?? null,
          lastObservedAt: last?.observedAt.toISOString() ?? null,
          locationQuality: last?.locationQuality ?? null,
          ageHours: Number.isFinite(ageH) ? Math.round(ageH * 10) / 10 : null,
        },
      })
    );
  }
  return hits;
}

/** M10: a sold-out future sailing, no booked ferry; earliest available quote vs promise → CROSSING_CAPACITY. */
export function monitorM10(args: { bundle: MonitorBundle; now: Date; params?: MonitorParams }) {
  const { bundle, now, params = MONITOR_PARAMS } = args;
  const ferries = bundle.travelOptions.filter((o) => o.kind === 'FERRY' && le(o.checkedAt, now));
  const soldOut = ferries
    .filter((o) => o.status === 'SOLD_OUT' && o.departureAt.getTime() > now.getTime())
    .sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());
  if (!soldOut[0]) return [];
  const booked = bundle.travelReservations.some(
    (r) => r.kind === 'FERRY' && r.status === 'BOOKED' && !r.cancelledAt
  );
  if (booked) return [];
  const available = ferries
    .filter((o) => o.status === 'AVAILABLE_QUOTE' && o.departureAt.getTime() > now.getTime())
    .sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());
  const deliveryPointIds = new Set(
    (bundle.activePlan?.points ?? []).filter((p) => p.orderBoundary === 'DELIVERY').map((p) => p.id)
  );
  const promises = bundle.timeWindows.filter(
    (w) => w.isSelected && w.purpose === 'CUSTOMER_DELIVERY_PROMISE'
  );
  const promise = promises.find((w) => deliveryPointIds.has(w.pointId)) ?? promises[0] ?? null;
  const next = available[0] ?? null;
  const slackH =
    next && promise
      ? hoursBetween(
          new Date(next.arrivalAt.getTime() + params.M10.arrivalBufferHours * HOUR),
          promise.endAt
        )
      : null;
  const sold = soldOut[0];
  const quoteAgeH = next ? hoursBetween(next.checkedAt, now) : null;
  return [
    hit({
      monitor: 'M10',
      orderId: bundle.order.id,
      orderRef: bundle.order.reference,
      triggerType: 'CROSSING_CAPACITY',
      ref: sold.id,
      summary: [
        `Sailing ${sold.fromCity}→${sold.toCity} ${fmtUtc(sold.departureAt)} SOLD OUT (checked ${fmtAt(sold.checkedAt, now)}); no ferry booked.`,
        next
          ? `Next available: ${fmtUtc(next.departureAt)}, arrives ${fmtUtc(next.arrivalAt)}, QUOTED ${money(next.quoteCents, next.currency) ?? ''} ${fmtDuration((quoteAgeH ?? 0) * HOUR)} ago, not booked.`
          : 'No available quote recorded.',
        slackH !== null && promise
          ? `Promise ends ${fmtUtc(promise.endAt)}: slack ${slackH.toFixed(0)} h.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      detail: {
        soldOutOptionId: sold.id,
        soldOutDepartureAt: sold.departureAt.toISOString(),
        nextAvailableOptionId: next?.id ?? null,
        nextDepartureAt: next?.departureAt.toISOString() ?? null,
        nextArrivalAt: next?.arrivalAt.toISOString() ?? null,
        quoteAgeHours: quoteAgeH === null ? null : Math.round(quoteAgeH * 10) / 10,
        promiseWindowId: promise?.id ?? null,
        promiseEndAt: promise?.endAt.toISOString() ?? null,
        slackHours: slackH === null ? null : Math.round(slackH * 10) / 10,
      },
    }),
  ];
}

const MONITORS: Record<MonitorId, typeof monitorM1> = {
  M1: monitorM1,
  M2: monitorM2,
  M8: monitorM8,
  M10: monitorM10,
};

/** Every monitor over one order at `now`; inactive (delivered, cancelled) orders yield nothing. */
export function runMonitors(args: {
  bundle: MonitorBundle;
  now: Date;
  params?: MonitorParams;
  only?: MonitorId[];
}): MonitorHit[] {
  const { bundle, now, params, only = MONITOR_IDS } = args;
  if (!isActiveOrder(bundle.order)) return [];
  return only.flatMap((id) => MONITORS[id]({ bundle, now, params }));
}

export type MonitorTables = {
  orders: Lean<BahnOrder>[];
  transportPoints: Lean<BahnTransportPoint>[];
  transportSegments: Lean<BahnTransportSegment>[];
  timeWindows: Lean<BahnTimeWindow>[];
  workAssignments: Lean<BahnWorkAssignment>[];
  travelReservations: Lean<BahnTravelReservation>[];
  travelOptions: Lean<BahnTravelOption>[];
  operationalEvents: Lean<BahnOperationalEvent>[];
  trackingObservations: Lean<BahnTrackingObservation>[];
  ferryTerminalEvents: Lean<BahnFerryTerminalEvent>[];
};

function byKey<T>(rows: T[], key: (row: T) => string | null | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k) groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return groups;
}

/** Assembles per-order monitor bundles from flat rows (bulk DB load or jsonl). */
export function assembleMonitorBundles(tables: MonitorTables): MonitorBundle[] {
  const points = byKey(tables.transportPoints, (p) => p.planId);
  const segments = byKey(tables.transportSegments, (s) => s.planId);
  const windows = byKey(tables.timeWindows, (w) => w.orderId);
  const assignments = byKey(tables.workAssignments, (a) => a.orderId);
  const reservations = byKey(tables.travelReservations, (r) => r.orderId);
  const options = byKey(tables.travelOptions, (o) => o.orderId);
  const events = byKey(tables.operationalEvents, (e) => e.orderId);
  const tracking = byKey(tables.trackingObservations, (t) => t.orderId);
  const terminal = byKey(tables.ferryTerminalEvents, (e) => e.orderId);
  return tables.orders.map((order) => ({
    order,
    activePlan: order.activePlanId
      ? {
          id: order.activePlanId,
          points: points.get(order.activePlanId) ?? [],
          segments: segments.get(order.activePlanId) ?? [],
        }
      : null,
    timeWindows: windows.get(order.id) ?? [],
    assignments: assignments.get(order.id) ?? [],
    travelReservations: reservations.get(order.id) ?? [],
    travelOptions: options.get(order.id) ?? [],
    events: events.get(order.id) ?? [],
    trackingObservations: tracking.get(order.id) ?? [],
    ferryTerminalEvents: terminal.get(order.id) ?? [],
  }));
}

/** Splits a monitor dedupe key back into its parts. */
export function parseMonitorKey(key: string): { monitor: MonitorId; orderId: string; ref: string } {
  const [monitor, orderId, ...rest] = key.split(':');
  if (!(MONITOR_IDS as readonly string[]).includes(monitor) || !orderId || rest.length === 0)
    throw new Error(`Not a monitor key: ${key}`);
  return { monitor: monitor as MonitorId, orderId, ref: rest.join(':') };
}
