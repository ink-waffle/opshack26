// Test-only: builds OrderBundle / DriverDuties from data/bahn/dataset in memory (no DB), mirroring orders.ts and drivers.ts.

import { readFileSync } from 'fs';
import { join } from 'path';

import { BAHN_COLLECTIONS, type BahnCollection, type BahnRecord } from '@/lib/bahn/collections';
import { BAHN_DATASET_DIR } from '@/lib/bahn/dataset';
import type { DriverDuties } from '@/lib/bahn/drivers';
import type { OrderBundle } from '@/lib/bahn/orders';

type Field = { name: string; dbName: string; type: string; isList: boolean };
type Row = Record<string, any>;

export type BahnMemoryDataset = Record<BahnCollection, Row[]>;

/** Parses prisma/schema.prisma into column lists per bahn table so rows match Prisma's camelCase payloads. */
function bahnTableFields(): Map<string, Field[]> {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const tables = new Map<string, Field[]>();
  for (const block of schema.matchAll(/model\s+\w+\s*\{([\s\S]*?)\n\}/g)) {
    const body = block[1];
    if (!body.includes('@@schema("bahn")')) continue;
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1];
    if (!table) continue;
    const fields: Field[] = [];
    for (const line of body.split('\n')) {
      const match = /^\s+(\w+)\s+(\w+)(\[\])?\??\s*(.*)$/.exec(line);
      if (!match || line.trim().startsWith('@@')) continue;
      const [, name, type, list, rest] = match;
      fields.push({
        name,
        type,
        isList: !!list,
        dbName: /@map\("([^"]+)"\)/.exec(rest)?.[1] ?? name,
      });
    }
    tables.set(table, fields);
  }
  return tables;
}

function toRow(args: { record: BahnRecord; fields: Field[] }): Row {
  const { record, fields } = args;
  const row: Row = {};
  for (const field of fields) {
    if (field.name === 'raw') {
      row.raw = record;
      continue;
    }
    const value = record[field.dbName];
    if (value === undefined || value === null) row[field.name] = field.isList ? [] : null;
    else if (field.type === 'DateTime' && typeof value === 'string')
      row[field.name] = new Date(value);
    else row[field.name] = value;
  }
  return row;
}

let cached: BahnMemoryDataset | null = null;

/** Every bahn collection as Prisma-shaped rows (cached per process). */
export function loadBahnDataset(args: { dir?: string } = {}): BahnMemoryDataset {
  const { dir = BAHN_DATASET_DIR } = args;
  if (cached && dir === BAHN_DATASET_DIR) return cached;
  const tables = bahnTableFields();
  const dataset = {} as BahnMemoryDataset;
  for (const collection of BAHN_COLLECTIONS) {
    const fields = tables.get(collection);
    if (!fields) throw new Error(`schema.prisma has no bahn model for ${collection}`);
    const text = readFileSync(join(dir, `${collection}.jsonl`), 'utf8');
    dataset[collection] = text
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => toRow({ record: JSON.parse(line) as BahnRecord, fields }));
  }
  if (dir === BAHN_DATASET_DIR) cached = dataset;
  return dataset;
}

function uniq(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
}

function sortKey(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  return value as number | string;
}

/** Stable ascending sort by several keys with Postgres semantics (nulls last). */
function sortBy<T extends Row>(rows: T[], ...keys: string[]): T[] {
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const left = sortKey(a[key]);
      const right = sortKey(b[key]);
      if (left === right) continue;
      if (left === null) return 1;
      if (right === null) return -1;
      return left < right ? -1 : 1;
    }
    return 0;
  });
}

/** In-memory twin of getOrderBundle; null if the order is unknown. */
export function buildOrderBundle(args: {
  ref: string;
  dataset?: BahnMemoryDataset;
}): OrderBundle | null {
  const { ref, dataset = loadBahnDataset() } = args;
  const order = dataset.orders.find((o) => o.id === ref || o.reference === ref);
  if (!order) return null;
  const id = order.id as string;
  const byOrder = (rows: Row[]) => rows.filter((row) => row.orderId === id);

  const items = byOrder(dataset.order_items);
  const plans = sortBy(byOrder(dataset.transport_plans), 'version');
  const assignments = sortBy(byOrder(dataset.work_assignments), 'acceptedAt');
  const conversations = sortBy(
    dataset.conversations.filter((c) => c.orderId === id || c.relatedOrderIds.includes(id)),
    'startedAt'
  );
  const supportThreads = sortBy(
    dataset.support_inbox_threads.filter(
      (t) => t.candidateOrderIds.includes(id) || t.linkedOrderIds.includes(id)
    ),
    'openedAt'
  );
  const travelReservations = sortBy(byOrder(dataset.travel_reservations), 'departureAt');
  const ferryTerminalEvents = sortBy(byOrder(dataset.ferry_terminal_events), 'occurredAt');
  const endpointDetails = byOrder(dataset.order_endpoint_details);
  const endpointClaims = sortBy(byOrder(dataset.endpoint_claims), 'recordedAt');
  const custodyAssets = dataset.custody_assets.filter(
    (a) => a.orderId === id || a.relatedOrderId === id
  );

  const planIds = new Set(plans.map((plan) => plan.id));
  const terminalIds = uniq([
    ...travelReservations.flatMap((r) => [r.originTerminalId, r.destinationTerminalId]),
    ...ferryTerminalEvents.map((event) => event.terminalId),
  ]);
  const vehicleIds = new Set(items.map((item) => item.vehicleId));
  const vehicles = dataset.vehicles.filter((v) => vehicleIds.has(v.id));
  const points = sortBy(
    dataset.transport_points.filter((p) => planIds.has(p.planId)),
    'sequence'
  );
  const segments = sortBy(
    dataset.transport_segments.filter((s) => planIds.has(s.planId)),
    'sequence'
  );
  const driverIds = new Set(assignments.map((a) => a.driverId));
  const drivers = dataset.drivers.filter((d) => driverIds.has(d.id));
  const conversationIds = new Set(conversations.map((c) => c.id));
  const messages = sortBy(
    dataset.messages.filter((m) => conversationIds.has(m.conversationId)),
    'authoredAt',
    'id'
  );
  const threadIds = new Set(supportThreads.map((t) => t.id));
  const supportMessages = sortBy(
    dataset.support_inbox_messages.filter((m) => threadIds.has(m.threadId)),
    'authoredAt'
  );
  const assetIds = new Set(custodyAssets.map((a) => a.id));
  const custodyEvents = sortBy(
    dataset.custody_asset_events.filter((e) => assetIds.has(e.assetId)),
    'occurredAt'
  );
  const ferryTerminals = dataset.ferry_terminals.filter((t) => terminalIds.includes(t.id));
  const estimateIds = new Set(uniq(travelReservations.map((r) => r.terminalRoadEstimateId)));
  const roadEstimates = dataset.terminal_road_estimates.filter(
    (e) => estimateIds.has(e.id) || terminalIds.includes(e.toTerminalId)
  );
  const addressIds = new Set(
    uniq([
      order.pickupAddressId,
      order.deliveryAddressId,
      ...points.map((p) => p.addressId),
      ...endpointDetails.map((d) => d.addressId),
    ])
  );
  const siteIds = new Set(
    uniq([
      order.pickupSiteId,
      order.deliverySiteId,
      ...points.map((p) => p.siteId),
      ...endpointDetails.map((d) => d.siteId),
    ])
  );

  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const pointsByPlan = groupBy(points, (p) => p.planId);
  const segmentsByPlan = groupBy(segments, (s) => s.planId);
  const stepsByAssignment = groupBy(
    sortBy(byOrder(dataset.assignment_steps), 'assignmentId', 'sequence'),
    (s) => s.assignmentId
  );
  const messagesByConversation = groupBy(messages, (m) => m.conversationId);
  const supportByThread = groupBy(supportMessages, (m) => m.threadId);
  const claimsByDetail = groupBy(endpointClaims, (c) => c.endpointDetailId ?? '');
  const custodyEventsByAsset = groupBy(custodyEvents, (e) => e.assetId ?? '');

  const plansWithRoute = plans.map((plan) => ({
    ...plan,
    isActive: plan.id === order.activePlanId,
    points: pointsByPlan.get(plan.id) ?? [],
    segments: segmentsByPlan.get(plan.id) ?? [],
  }));

  const bundle = {
    order,
    customer: dataset.customers.find((c) => c.id === order.customerId) ?? null,
    items: items.map((item) => ({ ...item, vehicle: vehicleById.get(item.vehicleId) ?? null })),
    addresses: dataset.addresses.filter((a) => addressIds.has(a.id)),
    sites: dataset.sites.filter((s) => siteIds.has(s.id)),
    plans: plansWithRoute,
    activePlan: plansWithRoute.find((plan) => plan.isActive) ?? null,
    timeWindows: sortBy(byOrder(dataset.time_windows), 'startAt'),
    offers: sortBy(
      dataset.market_offers.filter((o) => o.orderId === id || o.orderIds.includes(id)),
      'publishedAt'
    ),
    offerExposures: sortBy(byOrder(dataset.market_offer_exposures), 'shownAt'),
    reachChecks: sortBy(byOrder(dataset.market_offer_reach_checks), 'checkedAt'),
    assignments: assignments.map((assignment) => ({
      ...assignment,
      driver: driverById.get(assignment.driverId) ?? null,
      steps: stepsByAssignment.get(assignment.id) ?? [],
    })),
    travelOptions: sortBy(byOrder(dataset.travel_options), 'checkedAt'),
    travelReservations,
    travelConfirmations: sortBy(byOrder(dataset.travel_confirmations), 'reportedAt'),
    ferryTerminals,
    ferryTerminalEvents,
    terminalRoadEstimates: roadEstimates,
    conversations: conversations.map((c) => ({
      ...c,
      messages: messagesByConversation.get(c.id) ?? [],
    })),
    supportThreads: supportThreads.map((t) => ({
      ...t,
      messages: supportByThread.get(t.id) ?? [],
    })),
    alerts: sortBy(byOrder(dataset.alerts), 'triggeredAt'),
    incidents: sortBy(byOrder(dataset.incidents), 'openedAt'),
    workItems: sortBy(
      dataset.work_items.filter((w) => w.orderId === id || w.relatedOrderIds.includes(id)),
      'openedAt'
    ),
    agentProposals: sortBy(byOrder(dataset.agent_proposals), 'createdAt'),
    internalNotifications: sortBy(byOrder(dataset.internal_notifications), 'occurredAt'),
    events: sortBy(byOrder(dataset.operational_events), 'recordedAt', 'id'),
    endpointDetails: endpointDetails.map((d) => ({ ...d, claims: claimsByDetail.get(d.id) ?? [] })),
    trackingObservations: sortBy(byOrder(dataset.tracking_observations), 'observedAt'),
    proofs: byOrder(dataset.proofs),
    documents: sortBy(byOrder(dataset.documents), 'updatedAt'),
    expenses: sortBy(byOrder(dataset.expenses), 'submittedAt'),
    custodyAssets: custodyAssets.map((a) => ({
      ...a,
      events: custodyEventsByAsset.get(a.id) ?? [],
    })),
    custodyReports: sortBy(byOrder(dataset.custody_reports), 'reportedAt'),
    notes: sortBy(byOrder(dataset.order_notes), 'authoredAt'),
    siteVisits: sortBy(byOrder(dataset.site_visits), 'arrivedAt'),
  };
  return bundle as unknown as OrderBundle;
}

function minDate(dates: (Date | null | undefined)[]): Date | null {
  const times = dates.filter((date): date is Date => !!date).map((date) => date.getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}

function maxDate(dates: (Date | null | undefined)[]): Date | null {
  const times = dates.filter((date): date is Date => !!date).map((date) => date.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

/** In-memory twin of getDriverDuties. */
export function buildDriverDuties(args: {
  driverId: string;
  includeCompleted?: boolean;
  dataset?: BahnMemoryDataset;
}): DriverDuties {
  const { driverId, includeCompleted = true, dataset = loadBahnDataset() } = args;
  const excluded = includeCompleted ? ['CANCELLED'] : ['CANCELLED', 'COMPLETED'];
  const driver = dataset.drivers.find((d) => d.id === driverId) ?? null;
  const assignments = sortBy(
    dataset.work_assignments.filter(
      (a) => a.driverId === driverId && !a.cancelledAt && !excluded.includes(a.status)
    ),
    'acceptedAt'
  );
  const assignmentIds = new Set(assignments.map((a) => a.id));
  const segmentIds = new Set(assignments.flatMap((a) => a.segmentIds as string[]));
  const orderIds = new Set(assignments.map((a) => a.orderId));
  const orders = dataset.orders
    .filter((o) => orderIds.has(o.id))
    .map(({ raw: _raw, ...order }) => order);
  const steps = sortBy(
    dataset.assignment_steps.filter((s) => assignmentIds.has(s.assignmentId)),
    'assignmentId',
    'sequence'
  );
  const segments = sortBy(
    dataset.transport_segments.filter((s) => segmentIds.has(s.id)),
    'sequence'
  );
  const reservations = sortBy(
    dataset.travel_reservations.filter((r) => assignmentIds.has(r.assignmentId)),
    'departureAt'
  );
  const pointIds = new Set(segments.flatMap((s) => [s.fromPointId, s.toPointId]));
  const points = dataset.transport_points.filter((p) => pointIds.has(p.id));
  const windows = dataset.time_windows.filter((w) => pointIds.has(w.pointId) && w.isSelected);
  const addressById = new Map(dataset.addresses.map((a) => [a.id, a]));
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const pointById = new Map(
    points.map((p) => [p.id, { ...p, address: addressById.get(p.addressId) ?? null }])
  );

  const duties = assignments.map((assignment) => {
    const dutySteps = steps.filter((s) => s.assignmentId === assignment.id);
    const dutySegments = segments
      .filter((s) => assignment.segmentIds.includes(s.id))
      .map((s): Row => ({
        ...s,
        from: pointById.get(s.fromPointId) ?? null,
        to: pointById.get(s.toPointId) ?? null,
      }));
    const dutyPointIds = new Set(dutySegments.flatMap((s) => [s.fromPointId, s.toPointId]));
    const dutyWindows = windows.filter((w) => w.pointId && dutyPointIds.has(w.pointId));
    const startAt =
      minDate(dutySteps.map((s) => s.scheduledStartAt ?? s.scheduledEndAt ?? s.completedAt)) ??
      minDate(dutyWindows.map((w) => w.startAt)) ??
      assignment.startedAt;
    const endAt =
      maxDate(dutySteps.map((s) => s.scheduledEndAt ?? s.scheduledStartAt ?? s.completedAt)) ??
      maxDate(dutyWindows.map((w) => w.endAt)) ??
      assignment.completedAt;
    return {
      assignment,
      order: orderById.get(assignment.orderId) ?? null,
      steps: dutySteps,
      segments: dutySegments,
      selectedWindows: dutyWindows,
      reservations: reservations.filter((r) => r.assignmentId === assignment.id),
      startAt,
      endAt,
    };
  });
  duties.sort(
    (a, b) =>
      (a.startAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.startAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
  );
  return { driver, duties } as unknown as DriverDuties;
}

/** Duties of every driver assigned on the order (what computeChain takes as `duties`). */
export function buildOrderDriverDuties(args: {
  bundle: OrderBundle;
  dataset?: BahnMemoryDataset;
}): DriverDuties[] {
  const { bundle, dataset = loadBahnDataset() } = args;
  return uniq(bundle.assignments.map((a) => a.driverId)).map((driverId) =>
    buildDriverDuties({ driverId, dataset })
  );
}
