// Real rows the trailer shows: the S1 driver message, the watchman's reading of it and the card latency.

import { prisma } from '@/lib/prismaClient';
import { TRIGGERS } from '@/lib/watchman/taxonomy';

export type TrailerData = {
  orderRef: string;
  driver: string;
  message: string;
  labels: { label: string; p: number }[];
  playbook: string;
  cardAfterSec: number;
  cardIds: Record<string, string>;
};

// Values from the S1 run recorded on 25 Oct, used when the database has no S1 signal.
const FALLBACK: Omit<TrailerData, 'cardIds'> = {
  orderRef: 'CD-420075',
  driver: 'Nadia Fervalen',
  message:
    "I'm at West Baltic Vehicle Terminal with the Volkswagen ID.4 for CD-420075. Staff say the 14:00Z sailing is full for vehicles and our booking is not on their list, so I can't board. I'm going to miss this ferry. What should I do?",
  labels: [
    { label: TRIGGERS.CROSSING_CAPACITY.label, p: 0.98 },
    { label: TRIGGERS.PROMISE_AT_RISK.label, p: 0.8 },
    { label: TRIGGERS.DATA_CONFLICT.label, p: 0.72 },
  ],
  playbook: 'Missed connection',
  cardAfterSec: 37,
};

type Routing = { labels?: { p: number; type: string }[] };

async function cardIdsByOrder() {
  const cards = await prisma.card.findMany({
    where: { kind: 'DECISION' },
    select: { id: true, orderId: true, status: true },
    orderBy: { createdAt: 'desc' },
  });
  const orders = await prisma.bahnOrder.findMany({
    where: { id: { in: cards.map((c) => c.orderId ?? '') } },
    select: { id: true, reference: true },
  });
  const refOf = new Map(orders.map((o) => [o.id, o.reference]));
  const ids: Record<string, string> = {};
  // Newest open card per order first, else the newest card of any status.
  for (const open of [true, false]) {
    for (const card of cards) {
      const ref = refOf.get(card.orderId ?? '');
      if (ref && !ids[ref] && (card.status === 'OPEN') === open) ids[ref] = card.id;
    }
  }
  return ids;
}

export async function loadTrailerData(): Promise<TrailerData> {
  const cardIds = await cardIdsByOrder();
  const order = await prisma.bahnOrder.findFirst({
    where: { reference: FALLBACK.orderRef },
    select: { id: true },
  });
  const signal = order
    ? await prisma.signal.findFirst({
        where: { orderId: order.id, source: 'message', triggerType: 'CROSSING_CAPACITY' },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  if (!signal?.sourceRef) return { ...FALLBACK, cardIds };
  const message = await prisma.bahnMessage.findUnique({ where: { id: signal.sourceRef } });
  const run = await prisma.playbookRun.findFirst({
    where: { signalId: signal.id },
    select: { id: true },
  });
  const card = run
    ? await prisma.card.findFirst({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } })
    : null;
  const labels = ((signal.routing as Routing | null)?.labels ?? []).slice(0, 3).map((l) => ({
    label: TRIGGERS[l.type as keyof typeof TRIGGERS]?.label ?? l.type,
    p: l.p,
  }));
  return {
    ...FALLBACK,
    driver: message?.authorNameSnapshot ?? FALLBACK.driver,
    message: message?.body ?? FALLBACK.message,
    labels: labels.length ? labels : FALLBACK.labels,
    cardAfterSec: card
      ? Math.round((card.createdAt.getTime() - signal.createdAt.getTime()) / 1000)
      : FALLBACK.cardAfterSec,
    cardIds,
  };
}
