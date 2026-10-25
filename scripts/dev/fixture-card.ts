// LOCAL ONLY. Clones a real decision card into an OPEN fixture (fake waitpoint) for UI screenshots:
// pnpm exec dotenv -e .env.local -- tsx scripts/dev/fixture-card.ts [--from <cardId>] | --delete
// Approving the fixture fails on the fake token and the card returns to OPEN; delete it afterwards.

import type { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prismaClient';

const RUN_ID = 'fixture-u1-run';
const CARD_ID = 'fixture-u1-card';

const json = (value: unknown) => (value ?? undefined) as Prisma.InputJsonValue | undefined;

async function remove() {
  const cards = await prisma.card.deleteMany({ where: { id: CARD_ID } });
  const runs = await prisma.playbookRun.deleteMany({ where: { id: RUN_ID } });
  console.log(`deleted ${cards.count} card(s), ${runs.count} run(s)`);
}

async function create(fromId: string | undefined) {
  if (process.env.DATABASE_URL?.includes('supabase.com'))
    throw new Error('Refusing to write a fixture to a remote database.');
  await remove();
  const source = await prisma.card.findFirst({
    where: { kind: 'DECISION', ...(fromId ? { id: fromId } : {}) },
    include: { run: { include: { blockRuns: { orderBy: { startedAt: 'asc' } } } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!source?.run) throw new Error('No decision card with a run to clone.');
  const { run } = source;
  const human = run.blockRuns.findIndex((block) => block.kind === 'human');
  const blocks = human >= 0 ? run.blockRuns.slice(0, human + 1) : run.blockRuns;
  await prisma.playbookRun.create({
    data: {
      id: RUN_ID,
      playbookId: run.playbookId,
      orderId: run.orderId,
      triggerType: run.triggerType,
      status: 'AWAITING_DECISION',
      currentBlockId: blocks.at(-1)?.blockId ?? null,
      context: { fixture: 'u1', clonedFrom: run.id },
      simStartedAt: run.simStartedAt,
      createdAt: run.createdAt,
      blockRuns: {
        create: blocks.map((block, i) => ({
          blockId: block.blockId,
          kind: block.kind,
          status: i === blocks.length - 1 && block.kind === 'human' ? 'WAITING' : block.status,
          input: json(block.input),
          output:
            i === blocks.length - 1 && block.kind === 'human' ? undefined : json(block.output),
          model: block.model,
          costUsd: block.costUsd,
          durationMs: block.durationMs,
          startedAt: block.startedAt,
          finishedAt: i === blocks.length - 1 && block.kind === 'human' ? null : block.finishedAt,
        })),
      },
    },
  });
  await prisma.card.create({
    data: {
      id: CARD_ID,
      runId: RUN_ID,
      orderId: source.orderId,
      playbookId: source.playbookId,
      blockId: source.blockId,
      kind: 'DECISION',
      status: 'OPEN',
      title: source.title,
      summary: source.summary,
      agentActions: json(source.agentActions),
      factIds: source.factIds,
      options: json(source.options),
      decideBy: source.decideBy,
      decideByReason: source.decideByReason,
      waitpointTokenId: 'waitpoint_fixture_u1',
      createdAt: source.createdAt,
    },
  });
  console.log(
    `fixture card ${CARD_ID} cloned from ${source.id} → http://localhost:3001/cards/${CARD_ID}`
  );
}

async function main() {
  const index = process.argv.indexOf('--from');
  if (process.argv.includes('--delete')) await remove();
  else await create(index >= 0 ? process.argv[index + 1] : undefined);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
