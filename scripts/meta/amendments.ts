// Lists amendments or decides one as the chief dispatcher (same function as the /meta buttons):
// dotenv -e .env.local -- tsx scripts/meta/amendments.ts [list | approve <id> | reject <id>]

import { decideAmendment } from '@/lib/meta/store';
import type { Backtest } from '@/lib/meta/types';
import { prisma } from '@/lib/prismaClient';

async function main() {
  const [command = 'list', id] = process.argv.slice(2);
  if (command === 'approve' || command === 'reject') {
    if (!id) throw new Error(`usage: ${command} <amendmentId>`);
    const row = await decideAmendment({
      id,
      status: command === 'approve' ? 'APPROVED' : 'REJECTED',
    });
    console.log(`${row.id} → ${row.status} by ${row.decidedBy} at ${row.decidedAt?.toISOString()}`);
    return;
  }
  const rows = await prisma.amendment.findMany({ orderBy: { createdAt: 'desc' } });
  for (const row of rows)
    console.log(
      `${row.id} ${row.status.padEnd(8)} ${row.kind.padEnd(11)} ${row.playbookId}/${row.blockId ?? '*'} card ${row.sourceCardId ?? '—'}\n  ${row.text}\n  backtest: ${(row.backtest as Backtest | null)?.summary ?? '—'}`
    );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
