// The runtime's door to facts: thin wrappers over lib/facts, so the runtime, tools and execute block share one API.

import type { FactKind } from '@/lib/evidence/ladder';
import {
  bahnDedupeKey,
  factIdFor,
  type FactValue,
  getFacts,
  listOrderFacts,
  syncOrderFacts,
  writeFact,
  type WriteFactArgs,
} from '@/lib/facts';
import type { Fact } from '@/lib/generated/prisma/client';

// A fact a tool or the runtime records; dedupeKey makes it idempotent (the id derives from it).
export type NewFact = Omit<WriteFactArgs, 'kind' | 'value' | 'dedupeKey'> & {
  kind: FactKind;
  value?: unknown;
  dedupeKey: string;
};

/** Project the order's bahn records into facts (idempotent upsert), then list them. */
export async function syncAndListFacts(args: { orderId: string }): Promise<Fact[]> {
  const { orderId } = args;
  await syncOrderFacts({ orderId });
  return listOrderFacts({ orderId });
}

export async function listFacts(args: { orderId: string; kinds?: string[] }): Promise<Fact[]> {
  const { orderId, kinds } = args;
  return listOrderFacts({ orderId, kinds: kinds as FactKind[] | undefined });
}

export async function getFactsByIds(args: { ids: string[] }): Promise<Fact[]> {
  return getFacts(args);
}

export async function recordFact(fact: NewFact): Promise<Fact> {
  const value =
    fact.value === undefined ? undefined : (JSON.parse(JSON.stringify(fact.value)) as FactValue);
  return writeFact({ ...fact, value });
}

export async function recordFacts(facts: NewFact[]): Promise<Fact[]> {
  const written: Fact[] = [];
  for (const fact of facts) written.push(await recordFact(fact));
  return written;
}

/** Id of the projected fact for a bahn.messages row (DRIVER_STATEMENT, SITE_STATEMENT, AGENT_MESSAGE…). */
export function messageFactId(args: { messageId: string; kind: string }): string {
  const { messageId, kind } = args;
  return factIdFor(bahnDedupeKey({ collection: 'messages', recordId: messageId, kind }));
}
