// LOCAL: `pnpm playbook:reset <orderRef>` removes what runs and the simulator added to one order (runs, playbook cards,
// message/record signals, tool facts, msg-ctl/msg-sim messages, sim conversations); amendment source cards stay.

import { runs } from '@trigger.dev/sdk';

import { findOrder } from '@/lib/bahn';
import { simNow } from '@/lib/clock';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prismaClient';
import { keptSources, resetDispatchKeys } from '@/scripts/demo/shared';

async function main() {
  const [orderRef] = process.argv.slice(2);
  if (!orderRef) {
    console.error('usage: pnpm playbook:reset <orderRef>');
    process.exit(1);
  }
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
    console.error('refusing: DATABASE_URL is not local');
    process.exit(1);
  }
  const order = await findOrder({ ref: orderRef });
  if (!order) throw new Error(`Unknown order ${orderRef}`);
  const messages = await prisma.bahnMessage.findMany({
    where: {
      orderId: order.id,
      OR: [{ id: { startsWith: 'msg-ctl-' } }, { id: { startsWith: 'msg-sim-' } }],
    },
    select: { id: true },
  });
  const runsToCancel = await prisma.playbookRun.findMany({
    where: {
      orderId: { in: [order.id, order.reference] },
      status: { notIn: ['CLOSED', 'ESCALATED', 'FAILED'] },
      triggerRunId: { not: null },
    },
    select: { triggerRunId: true, playbookId: true },
  });
  await Promise.all(
    runsToCancel.map((run) => runs.cancel(run.triggerRunId as string).catch(() => undefined))
  );
  const playbookIds = await prisma.playbookRun.findMany({
    where: { orderId: { in: [order.id, order.reference] } },
    select: { playbookId: true },
    distinct: ['playbookId'],
  });
  const messageRefs = messages.map((message) => `bahn.messages:${message.id}`);
  // Cards an amendment learned from stay, with their runs: /meta shows them as "what the operator corrected".
  const amendments = await prisma.amendment.findMany({ where: { sourceCardId: { not: null } } });
  const kept = await keptSources(amendments);
  const playbookCards = await prisma.card.findMany({
    where: {
      orderId: order.id,
      playbookId: { notIn: ['escape-hatch'] },
      id: { notIn: kept.cardIds },
    },
    select: { id: true },
  });
  const cardIds = playbookCards.map((card) => card.id);
  const now = await simNow();
  // Watchman triage cards stay; the ones a decision card folded are reopened.
  const folded = await prisma.card.findMany({
    where: { orderId: order.id, playbookId: 'escape-hatch', status: 'CANCELLED' },
    select: { id: true, decision: true },
  });
  const reopen = folded
    .filter((card) =>
      cardIds.includes(String((card.decision as { foldedInto?: unknown } | null)?.foldedInto))
    )
    .map((card) => card.id);
  const [
    facts,
    projected,
    cards,
    reopened,
    closedRuns,
    deletedRuns,
    deletedMessages,
    signals,
    conversations,
  ] = await prisma.$transaction([
    prisma.fact.deleteMany({ where: { orderId: order.id, sourceType: { not: 'BAHN_RECORD' } } }),
    prisma.fact.deleteMany({ where: { sourceRef: { in: messageRefs } } }),
    prisma.card.deleteMany({ where: { id: { in: cardIds } } }),
    prisma.card.updateMany({
      where: { id: { in: reopen } },
      data: { status: 'OPEN', decision: Prisma.DbNull },
    }),
    prisma.playbookRun.updateMany({
      where: { id: { in: kept.runIds }, status: { notIn: ['CLOSED', 'ESCALATED', 'FAILED'] } },
      data: { status: 'CLOSED', closedAt: new Date() },
    }),
    prisma.playbookRun.deleteMany({
      where: { orderId: { in: [order.id, order.reference] }, id: { notIn: kept.runIds } },
    }),
    prisma.bahnMessage.deleteMany({
      where: { id: { in: messages.map((message) => message.id) } },
    }),
    // Monitor hits up to sim now stay, so the next tick does not start a second run next to playbook:run.
    prisma.signal.deleteMany({
      where: {
        orderId: order.id,
        OR: [{ source: { not: 'monitor' } }, { simAt: { gt: now } }],
      },
    }),
    prisma.bahnConversation.deleteMany({
      where: { orderId: order.id, id: { startsWith: 'conv-sim-' } },
    }),
  ]);
  const keysReset = await resetDispatchKeys(
    playbookIds.map((run) => ({ orderId: order.id, playbookId: run.playbookId }))
  );
  console.log(
    JSON.stringify({
      order: order.reference,
      toolFacts: facts.count,
      messageFacts: projected.count,
      cards: cards.count,
      triageReopened: reopened.count,
      runs: deletedRuns.count,
      keptAmendmentRunsClosed: closedRuns.count,
      cancelledTriggerRuns: runsToCancel.length,
      messages: deletedMessages.count,
      conversations: conversations.count,
      signals: signals.count,
      dispatchKeysReset: keysReset,
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
