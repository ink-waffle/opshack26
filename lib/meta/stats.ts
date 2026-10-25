// Run counts for the catalog: per playbook (runs, amendments) and per block (runs, average cost and time).

import { prisma } from '@/lib/prismaClient';

export type PlaybookStats = {
  runs: number;
  lastRunAt: Date | null;
  approvedAmendments: number;
  proposedAmendments: number;
};

export type BlockStats = {
  runs: number;
  failed: number;
  avgCostUsd: number | null;
  avgDurationMs: number | null;
};

export async function playbookStats(): Promise<Record<string, PlaybookStats>> {
  const [runs, amendments] = await Promise.all([
    prisma.playbookRun.groupBy({
      by: ['playbookId'],
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.amendment.groupBy({ by: ['playbookId', 'status'], _count: { _all: true } }),
  ]);
  const stats: Record<string, PlaybookStats> = {};
  const entry = (id: string) =>
    (stats[id] ??= { runs: 0, lastRunAt: null, approvedAmendments: 0, proposedAmendments: 0 });
  for (const row of runs) {
    entry(row.playbookId).runs = row._count._all;
    entry(row.playbookId).lastRunAt = row._max.createdAt;
  }
  for (const row of amendments) {
    if (row.status === 'APPROVED') entry(row.playbookId).approvedAmendments += row._count._all;
    if (row.status === 'PROPOSED') entry(row.playbookId).proposedAmendments += row._count._all;
  }
  return stats;
}

export async function blockStats(args: {
  playbookId: string;
}): Promise<Record<string, BlockStats>> {
  const { playbookId } = args;
  const rows = await prisma.blockRun.findMany({
    where: { run: { playbookId } },
    select: { blockId: true, status: true, costUsd: true, durationMs: true },
  });
  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) (grouped[row.blockId] ??= []).push(row);
  return Object.fromEntries(
    Object.entries(grouped).map(([blockId, list]) => {
      const costs = list.map((row) => row.costUsd).filter((v): v is number => v !== null);
      const done = list.filter((row) => row.status === 'COMPLETED' && row.durationMs !== null);
      return [
        blockId,
        {
          runs: list.length,
          failed: list.filter((row) => row.status === 'FAILED').length,
          avgCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
          avgDurationMs: done.length
            ? done.reduce((a, row) => a + (row.durationMs ?? 0), 0) / done.length
            : null,
        },
      ];
    })
  );
}
