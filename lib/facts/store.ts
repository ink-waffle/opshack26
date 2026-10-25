// DB side of facts: projection sync, writeFact (the only other way to create facts) and reads.

import { findOrder, getOrderBundle, listOrders } from '@/lib/bahn';
import {
  atLeast,
  type EvidenceLevel,
  type FactKind,
  isFactKind,
  levelRank,
} from '@/lib/evidence/ladder';
import { factIdFor } from '@/lib/facts/ids';
import { projectOrderFacts } from '@/lib/facts/projection';
import type { FactValue, ProjectedFact } from '@/lib/facts/types';
import { type Fact, Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prismaClient';

const orderIdCache = new Map<string, string>();

/** 'CD-420299' or 'ord-00299' → the bahn order id ('ord-00299'); null if unknown. */
export async function resolveOrderId(args: { ref: string }): Promise<string | null> {
  const { ref } = args;
  const cached = orderIdCache.get(ref);
  if (cached) return cached;
  const order = await findOrder({ ref });
  if (!order) return null;
  orderIdCache.set(ref, order.id);
  orderIdCache.set(order.reference, order.id);
  return order.id;
}

function jsonInput(value: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

// jsonb reorders object keys, so compare JSON with sorted keys.
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : 1
    );
    return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function sameContent(row: Fact, fact: ProjectedFact): boolean {
  return (
    row.orderId === fact.orderId &&
    row.kind === fact.kind &&
    row.subject === fact.subject &&
    row.statement === fact.statement &&
    row.level === fact.level &&
    row.sourceRef === fact.sourceRef &&
    row.observedAt.getTime() === fact.observedAt.getTime() &&
    stableJson(row.value) === stableJson(fact.value)
  );
}

export type SyncResult = {
  orderId: string;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  pruned: number;
};

/** Upserts the order's projected facts by dedupeKey (ids are deterministic) and prunes stale projected rows; idempotent. */
export async function syncOrderFacts(args: { orderId: string }): Promise<SyncResult> {
  const bundle = await getOrderBundle({ ref: args.orderId });
  if (!bundle) throw new Error(`Unknown order ${args.orderId}`);
  const facts = projectOrderFacts({ bundle });
  const keys = facts.map((fact) => fact.dedupeKey as string);
  const existing = await prisma.fact.findMany({ where: { dedupeKey: { in: keys } } });
  const byKey = new Map(existing.map((row) => [row.dedupeKey, row]));
  const toCreate = facts.filter((fact) => !byKey.has(fact.dedupeKey));
  const toUpdate = facts.filter((fact) => {
    const row = byKey.get(fact.dedupeKey);
    return row && !sameContent(row, fact);
  });
  if (toCreate.length) {
    await prisma.fact.createMany({
      data: toCreate.map((fact) => ({ ...fact, value: jsonInput(fact.value) })),
      skipDuplicates: true,
    });
  }
  for (const fact of toUpdate) {
    await prisma.fact.update({
      where: { dedupeKey: fact.dedupeKey as string },
      data: {
        orderId: fact.orderId,
        kind: fact.kind,
        subject: fact.subject,
        statement: fact.statement,
        value: jsonInput(fact.value),
        level: fact.level,
        sourceRef: fact.sourceRef,
        observedAt: fact.observedAt,
      },
    });
  }
  // Projected rows of this order whose record no longer projects under that key (e.g. older key formats).
  const pruned = await prisma.fact.deleteMany({
    where: {
      orderId: bundle.order.id,
      sourceType: 'BAHN_RECORD',
      dedupeKey: { startsWith: 'bahn:', notIn: keys },
    },
  });
  return {
    orderId: bundle.order.id,
    total: facts.length,
    created: toCreate.length,
    updated: toUpdate.length,
    unchanged: facts.length - toCreate.length - toUpdate.length,
    pruned: pruned.count,
  };
}

/** syncOrderFacts for many orders (all orders when none are given), sequentially. */
export async function syncAllOrderFacts(args: { orderIds?: string[] } = {}): Promise<{
  orders: number;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  pruned: number;
}> {
  const orderIds = args.orderIds ?? (await listOrders()).map((order) => order.id);
  const sum = { orders: 0, total: 0, created: 0, updated: 0, unchanged: 0, pruned: 0 };
  for (const orderId of orderIds) {
    const result = await syncOrderFacts({ orderId });
    sum.orders += 1;
    sum.total += result.total;
    sum.created += result.created;
    sum.updated += result.updated;
    sum.unchanged += result.unchanged;
    sum.pruned += result.pruned;
  }
  return sum;
}

export type WriteFactArgs = {
  orderId?: string | null;
  runId?: string | null;
  kind: FactKind;
  subject: string;
  statement: string;
  value?: FactValue | null;
  level: EvidenceLevel;
  sourceType: 'TOOL' | 'OPERATOR' | 'AGENT_INTERPRETATION';
  sourceRef: string;
  observedAt: Date;
  dedupeKey?: string;
};

// An agent's reading of text can never rise above what was said.
const AGENT_MAX_LEVEL: EvidenceLevel = 'STATED';

/** The only non-projection way to create a fact (tools, operator decisions, agent interpretations). */
export async function writeFact(args: WriteFactArgs): Promise<Fact> {
  const { kind, subject, statement, sourceType, sourceRef, observedAt, dedupeKey, runId } = args;
  if (!isFactKind(kind))
    throw new Error(`Unknown fact kind ${kind}; add it to lib/evidence/ladder.ts`);
  if (!statement.trim()) throw new Error('A fact needs a one-sentence statement');
  const level =
    sourceType === 'AGENT_INTERPRETATION' && !atLeast({ level: AGENT_MAX_LEVEL, min: args.level })
      ? AGENT_MAX_LEVEL
      : args.level;
  const orderId = args.orderId
    ? ((await resolveOrderId({ ref: args.orderId })) ?? args.orderId)
    : null;
  const data = {
    orderId,
    runId: runId ?? null,
    kind,
    subject,
    statement,
    value:
      args.value === undefined || args.value === null
        ? Prisma.JsonNull
        : (args.value as Prisma.InputJsonValue),
    level,
    sourceType,
    sourceRef,
    observedAt,
  };
  if (!dedupeKey) return prisma.fact.create({ data });
  return prisma.fact.upsert({
    where: { dedupeKey },
    create: { ...data, id: factIdFor(dedupeKey), dedupeKey },
    update: data,
  });
}

/** Facts of one order (by id or reference), oldest first; optional kind, level and time filters. */
export async function listOrderFacts(args: {
  orderId: string;
  kinds?: FactKind[];
  minLevel?: EvidenceLevel;
  observedBefore?: Date;
  runId?: string;
}): Promise<Fact[]> {
  const { kinds, minLevel, observedBefore, runId } = args;
  const orderId = (await resolveOrderId({ ref: args.orderId })) ?? args.orderId;
  const rows = await prisma.fact.findMany({
    where: {
      orderId,
      ...(kinds?.length ? { kind: { in: kinds } } : {}),
      ...(observedBefore ? { observedAt: { lte: observedBefore } } : {}),
      ...(runId ? { OR: [{ runId }, { runId: null }] } : {}),
    },
    orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
  });
  return minLevel ? rows.filter((row) => levelRank(row.level) >= levelRank(minLevel)) : rows;
}

/** Facts by id, in the order asked (unknown ids are skipped). */
export async function getFacts(args: { ids: string[] }): Promise<Fact[]> {
  const { ids } = args;
  if (!ids.length) return [];
  const rows = await prisma.fact.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is Fact => !!row);
}
