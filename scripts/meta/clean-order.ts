// LOCAL only: removes what earlier runs taught an order (tool, operator and agent facts, control messages) but keeps
// runs and cards, so a replay starts from Bahn's records without deleting other agents' history:
// dotenv -e .env.local -- tsx scripts/meta/clean-order.ts <orderRef>

import { findOrder } from '@/lib/bahn';
import { prisma } from '@/lib/prismaClient';

async function main() {
  const [orderRef] = process.argv.slice(2);
  if (!orderRef) throw new Error('usage: tsx scripts/meta/clean-order.ts <orderRef>');
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? ''))
    throw new Error('refusing: DATABASE_URL is not local');
  const order = await findOrder({ ref: orderRef });
  if (!order) throw new Error(`Unknown order ${orderRef}`);
  const messages = await prisma.bahnMessage.findMany({
    where: { orderId: order.id, id: { startsWith: 'msg-ctl-' } },
    select: { id: true },
  });
  const refs = messages.map((message) => `bahn.messages:${message.id}`);
  const [facts, messageFacts, deleted] = await prisma.$transaction([
    prisma.fact.deleteMany({ where: { orderId: order.id, sourceType: { not: 'BAHN_RECORD' } } }),
    prisma.fact.deleteMany({ where: { sourceRef: { in: refs } } }),
    prisma.bahnMessage.deleteMany({ where: { id: { in: messages.map((message) => message.id) } } }),
  ]);
  console.log(
    JSON.stringify({
      order: order.reference,
      facts: facts.count,
      messageFacts: messageFacts.count,
      messages: deleted.count,
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
