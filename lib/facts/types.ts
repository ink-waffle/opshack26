import type { Fact } from '@/lib/generated/prisma/client';

// A fact as produced by the pure projection (no recordedAt yet); DB rows are assignable to it.
export type ProjectedFact = Omit<Fact, 'recordedAt'>;

// The minimum a consumer (gate, chain, cards) needs; both projected facts and DB rows satisfy it.
export type FactLike = Pick<
  Fact,
  | 'id'
  | 'kind'
  | 'subject'
  | 'statement'
  | 'value'
  | 'level'
  | 'sourceType'
  | 'sourceRef'
  | 'observedAt'
> & { orderId?: string | null; dedupeKey?: string | null };

export type FactValue = Record<string, unknown>;

/** Reads a field from a fact's JSON value (null when absent). */
export function factValue<T = unknown>(fact: Pick<Fact, 'value'>, key: string): T | null {
  const value = fact.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return field === undefined ? null : (field as T);
}

/** 'bahn.travel_options:travel-x…' → 'travel-x…' (null for non-bahn sources). */
export function bahnRecordId(fact: Pick<Fact, 'sourceRef'>): string | null {
  const match = /^bahn\.[a-z_]+:(.+)$/.exec(fact.sourceRef);
  return match ? match[1] : null;
}
