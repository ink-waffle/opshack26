import { prisma } from '@/lib/prismaClient';

// Backfill: the latest inbound message of every order with an open issue, as Bahn would have sent it to the webhook.

const INBOUND = ['driver', 'site_contact', 'customer', 'handoff_contact'];

/** Orders with an open alert, incident, work item or a conversation waiting on someone. */
export async function ordersWithOpenIssues(): Promise<string[]> {
  const [alerts, incidents, workItems, conversations] = await Promise.all([
    prisma.bahnAlert.findMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      select: { orderId: true },
    }),
    prisma.bahnIncident.findMany({ where: { resolvedAt: null }, select: { orderId: true } }),
    prisma.bahnWorkItem.findMany({ where: { status: { not: 'DONE' } }, select: { orderId: true } }),
    prisma.bahnConversation.findMany({
      where: { status: 'OPEN', waitingOn: { not: null } },
      select: { orderId: true },
    }),
  ]);
  const ids = [...alerts, ...incidents, ...workItems, ...conversations]
    .map((row) => row.orderId)
    .filter((id): id is string => !!id);
  return [...new Set(ids)].sort();
}

/** The latest inbound message (at or before `now`) of each order with an open issue. */
export async function backfillMessages(args: { now: Date }) {
  const { now } = args;
  const orderIds = await ordersWithOpenIssues();
  const messages = await Promise.all(
    orderIds.map((orderId) =>
      prisma.bahnMessage.findFirst({
        where: { orderId, authorType: { in: INBOUND }, authoredAt: { lte: now } },
        orderBy: { authoredAt: 'desc' },
      })
    )
  );
  return { orderIds, messages: messages.filter((m): m is NonNullable<typeof m> => !!m) };
}
