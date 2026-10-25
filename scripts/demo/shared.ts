// Helpers shared by `pnpm demo:reset` and `pnpm demo:prime`.

import { idempotencyKeys, runs } from '@trigger.dev/sdk';

import type { Amendment } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prismaClient';

// The three orders the demo story opens with, and how the real pipeline reaches each of them.
export const DEMO_TARGETS = [
  {
    ref: 'CD-420299',
    playbookId: 'missed-connection',
    via: 'monitor M10 (sold-out sailing, no ferry booked) on the watchman tick',
    item: { kind: 'record' as const, ref: 'travel_options:travel-xc1d8163d5443a606' },
  },
  {
    ref: 'CD-420322',
    playbookId: 'vehicle-warning',
    via: 'the driver’s warning-light message, read by the watchman',
    item: { kind: 'message' as const, ref: 'msg-xbd0256027a9d35dd' },
  },
  {
    ref: 'CD-420449',
    playbookId: 'driver-unavailable',
    via: 'the driver’s “still unsure I can drive” message (backfill)',
    item: { kind: 'message' as const, ref: 'msg-x20e5c01f9996654c' },
  },
];

const ACTIVE_TRIGGER_STATUSES = [
  'PENDING_VERSION',
  'QUEUED',
  'DEQUEUED',
  'EXECUTING',
  'WAITING',
  'DELAYED',
] as const;

export function isLocalDatabase(): boolean {
  return /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '');
}

export function guardDatabase(args: { allowProd: boolean }) {
  const { allowProd } = args;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set; run through pnpm.');
  if (!isLocalDatabase() && !allowProd)
    throw new Error('Refusing: DATABASE_URL is not local (pass --yes-prod to run against prod).');
}

/** Cancels every live Trigger run of our tasks except the scheduled watchman tick. */
export async function cancelLiveTriggerRuns(): Promise<string[]> {
  const cancelled: string[] = [];
  for await (const run of runs.list({ status: [...ACTIVE_TRIGGER_STATUSES], limit: 100 })) {
    if (run.taskIdentifier === 'watchman-tick') continue;
    await runs.cancel(run.id).catch(() => undefined);
    cancelled.push(`${run.taskIdentifier}:${run.id}`);
  }
  return cancelled;
}

/** Clears the watchman's global dispatch keys, so a re-run within 30 min starts a new run instead of returning the old one. */
export async function resetDispatchKeys(
  pairs: { orderId: string; playbookId: string }[]
): Promise<number> {
  const unique = [
    ...new Map(pairs.map((pair) => [`${pair.orderId}:${pair.playbookId}`, pair])).values(),
  ];
  const results = await Promise.all(
    unique.map(async ({ orderId, playbookId }) => {
      const key = await idempotencyKeys.create(`watchman:${orderId}:${playbookId}`, {
        scope: 'global',
      });
      return idempotencyKeys
        .reset(playbookId, key)
        .then(() => true)
        .catch(() => false);
    })
  );
  return results.filter(Boolean).length;
}

export async function finishScript(promise: Promise<unknown>) {
  try {
    await promise;
    await prisma.$disconnect();
  } catch (error) {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

export const flag = (name: string) => process.argv.includes(`--${name}`);

/** Amendments whose source card still exists (only those can show "what the operator corrected" on /meta). */
export async function amendmentsWithSource(amendments: Amendment[]): Promise<Amendment[]> {
  const ids = amendments
    .map((amendment) => amendment.sourceCardId)
    .filter((id): id is string => !!id);
  const cards = await prisma.card.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const existing = new Set(cards.map((card) => card.id));
  return amendments.filter(
    (amendment) => amendment.sourceCardId && existing.has(amendment.sourceCardId)
  );
}

/** The source cards of these amendments and the runs they belong to (a card page renders its run's steps). */
export async function keptSources(
  amendments: Amendment[]
): Promise<{ cardIds: string[]; runIds: string[] }> {
  const cardIds = amendments
    .map((amendment) => amendment.sourceCardId)
    .filter((id): id is string => !!id);
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true, runId: true },
  });
  return {
    cardIds: cards.map((card) => card.id),
    runIds: cards.map((card) => card.runId).filter((id): id is string => !!id),
  };
}
