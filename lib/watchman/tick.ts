import { simNow } from '@/lib/clock';
import { prisma } from '@/lib/prismaClient';
import { type InspectResult, processMonitorHit } from '@/lib/watchman/inspect';
import {
  assembleMonitorBundles,
  type MonitorBundle,
  type MonitorHit,
  runMonitors,
} from '@/lib/watchman/monitors';
import type { RoutingParams } from '@/lib/watchman/routing';

// One clock tick: run the monitors over every active order at sim now and signal the new hits once.

const ACTIVE_STATUSES = ['NEW', 'WAITING_FOR_PICKUP', 'IN_TRANSIT'];

/** Monitor bundles for all active orders in ten bulk queries (no `raw`). */
export async function loadActiveMonitorBundles(): Promise<MonitorBundle[]> {
  const orders = await prisma.bahnOrder.findMany({
    where: { status: { in: ACTIVE_STATUSES }, cancelledAt: null },
    omit: { raw: true },
    orderBy: { reference: 'asc' },
  });
  const orderIds = orders.map((o) => o.id);
  const planIds = orders.map((o) => o.activePlanId).filter((id): id is string => !!id);
  const byOrder = { where: { orderId: { in: orderIds } }, omit: { raw: true } } as const;
  const [
    transportPoints,
    transportSegments,
    timeWindows,
    workAssignments,
    travelReservations,
    travelOptions,
    operationalEvents,
    trackingObservations,
    ferryTerminalEvents,
  ] = await Promise.all([
    prisma.bahnTransportPoint.findMany({ where: { planId: { in: planIds } }, omit: { raw: true } }),
    prisma.bahnTransportSegment.findMany({
      where: { planId: { in: planIds } },
      omit: { raw: true },
      orderBy: { sequence: 'asc' },
    }),
    prisma.bahnTimeWindow.findMany(byOrder),
    prisma.bahnWorkAssignment.findMany(byOrder),
    prisma.bahnTravelReservation.findMany(byOrder),
    prisma.bahnTravelOption.findMany(byOrder),
    prisma.bahnOperationalEvent.findMany({
      where: { orderId: { in: orderIds }, command: { in: ['vehicle.picked_up'] } },
      omit: { raw: true },
    }),
    prisma.bahnTrackingObservation.findMany(byOrder),
    prisma.bahnFerryTerminalEvent.findMany(byOrder),
  ]);
  return assembleMonitorBundles({
    orders,
    transportPoints,
    transportSegments,
    timeWindows,
    workAssignments,
    travelReservations,
    travelOptions,
    operationalEvents,
    trackingObservations,
    ferryTerminalEvents,
  });
}

export type TickResult = {
  simNow: string;
  orders: number;
  hits: number;
  newHits: string[];
  signals: InspectResult[];
};

/** Runs every monitor at sim now; only hits without a signal yet are recorded and routed. */
export async function watchmanTick(args: { params?: RoutingParams; now?: Date } = {}) {
  const { params } = args;
  const now = args.now ?? (await simNow());
  const bundles = await loadActiveMonitorBundles();
  const hits: MonitorHit[] = bundles.flatMap((bundle) => runMonitors({ bundle, now }));
  const seen = await prisma.signal.findMany({
    where: { source: 'monitor', sourceRef: { in: hits.map((h) => h.key) }, simAt: { lte: now } },
    select: { sourceRef: true },
  });
  const seenKeys = new Set(seen.map((s) => s.sourceRef));
  const fresh = hits.filter((h) => !seenKeys.has(h.key));
  const signals: InspectResult[] = [];
  for (const hit of fresh) signals.push(await processMonitorHit({ hit, now, params }));
  return {
    simNow: now.toISOString(),
    orders: bundles.length,
    hits: hits.length,
    newHits: fresh.map((h) => h.key),
    signals,
  } satisfies TickResult;
}
