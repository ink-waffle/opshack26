// Runs meta-learn for a decided card and prints the proposals:
// dotenv -e .env.local -- tsx scripts/meta/learn.ts <cardId> [--inline] [--force]
// Default: tasks.trigger('meta-learn') on the dev worker, exactly like the control room does.

import { runs, tasks } from '@trigger.dev/sdk';

import { learnFromCard } from '@/lib/meta/learn';
import type { Backtest } from '@/lib/meta/types';
import { prisma } from '@/lib/prismaClient';

const TERMINAL = new Set([
  'COMPLETED',
  'CANCELED',
  'FAILED',
  'CRASHED',
  'SYSTEM_FAILURE',
  'EXPIRED',
  'TIMED_OUT',
]);

async function printAmendments(cardId: string) {
  const rows = await prisma.amendment.findMany({
    where: { sourceCardId: cardId },
    orderBy: { createdAt: 'asc' },
  });
  for (const row of rows) {
    const backtest = row.backtest as Backtest | null;
    console.log(
      `\n=== amendment ${row.id} (${row.kind}, ${row.status}) on ${row.playbookId}/${row.blockId ?? '*'}`
    );
    console.log(`text: ${row.text}`);
    if (row.parameters) console.log(`parameters: ${JSON.stringify(row.parameters)}`);
    console.log(`rationale: ${row.rationale}`);
    console.log(
      `backtest: ${backtest?.summary ?? '—'} (improved: ${backtest?.improved}, $${backtest?.costUsd?.toFixed(3)})`
    );
    for (const c of backtest?.cases ?? [])
      console.log(`  - [${c.ok ? 'ok' : '!!'}] ${c.label}: ${c.note}`);
    for (const a of backtest?.attempts ?? [])
      console.log(`  tried before: “${a.text}” → ${a.summary}`);
  }
}

async function main() {
  const cardId = process.argv[2];
  if (!cardId) throw new Error('usage: tsx scripts/meta/learn.ts <cardId> [--inline] [--force]');
  const force = process.argv.includes('--force');
  if (process.argv.includes('--inline')) {
    const result = await learnFromCard({
      cardId,
      force,
      log: (message, data) =>
        console.log(`· ${message}`, data === undefined ? '' : JSON.stringify(data)),
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    const handle = await tasks.trigger('meta-learn', { cardId, force });
    console.log(`triggered meta-learn ${handle.id}`);
    for (;;) {
      const run = await runs.retrieve(handle.id);
      if (TERMINAL.has(run.status)) {
        console.log(`run ${run.status}`);
        console.log(JSON.stringify(run.output ?? run.error, null, 2));
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  await printAmendments(cardId);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
