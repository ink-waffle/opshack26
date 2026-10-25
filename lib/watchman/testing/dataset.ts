import type { BahnCollection } from '@/lib/bahn/collections';
import { BAHN_SNAPSHOT_AT } from '@/lib/bahn/collections';
import { readBahnCollection } from '@/lib/bahn/dataset';
import {
  assembleMonitorBundles,
  type MonitorBundle,
  type MonitorTables,
} from '@/lib/watchman/monitors';

// Test-only loader: dataset jsonl → Prisma-shaped rows (camelCase keys, ISO strings as Dates). No DB needed.

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const camel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function toRow(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      camel(key),
      typeof value === 'string' && ISO.test(value) ? new Date(value) : value,
    ])
  );
}

async function rows<T>(collection: BahnCollection): Promise<T[]> {
  return (await readBahnCollection({ collection })).map((r) => toRow(r) as T);
}

export async function loadMonitorTables(): Promise<MonitorTables> {
  const [
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
  ] = await Promise.all([
    rows<MonitorTables['orders'][number]>('orders'),
    rows<MonitorTables['transportPoints'][number]>('transport_points'),
    rows<MonitorTables['transportSegments'][number]>('transport_segments'),
    rows<MonitorTables['timeWindows'][number]>('time_windows'),
    rows<MonitorTables['workAssignments'][number]>('work_assignments'),
    rows<MonitorTables['travelReservations'][number]>('travel_reservations'),
    rows<MonitorTables['travelOptions'][number]>('travel_options'),
    rows<MonitorTables['operationalEvents'][number]>('operational_events'),
    rows<MonitorTables['trackingObservations'][number]>('tracking_observations'),
    rows<MonitorTables['ferryTerminalEvents'][number]>('ferry_terminal_events'),
  ]);
  return {
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
  };
}

export async function loadMonitorBundles(): Promise<MonitorBundle[]> {
  return assembleMonitorBundles(await loadMonitorTables());
}

export const SNAPSHOT_AT = BAHN_SNAPSHOT_AT;
