import { prisma } from '@/lib/prismaClient';

/** One bahn.messages row with its conversation and order; null if unknown. */
export async function getMessage(args: { id: string }) {
  const { id } = args;
  const message = await prisma.bahnMessage.findUnique({ where: { id } });
  if (!message) return null;
  const [conversation, order] = await Promise.all([
    prisma.bahnConversation.findUnique({ where: { id: message.conversationId } }),
    prisma.bahnOrder.findUnique({ where: { id: message.orderId }, omit: { raw: true } }),
  ]);
  return { message, conversation, order };
}

export type MessageWithContext = NonNullable<Awaited<ReturnType<typeof getMessage>>>;

/** One support-inbox message (not yet linked to an order) with its thread; null if unknown. */
export async function getSupportInboxMessage(args: { id: string }) {
  const { id } = args;
  const message = await prisma.bahnSupportInboxMessage.findUnique({ where: { id } });
  if (!message) return null;
  const thread = await prisma.bahnSupportInboxThread.findUnique({
    where: { id: message.threadId },
  });
  return { message, thread };
}
