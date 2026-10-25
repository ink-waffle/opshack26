// Projects every order's Bahn records into control.facts (idempotent): `pnpm facts:sync:local`.

import { syncAllOrderFacts } from '@/lib/facts';
import { prisma } from '@/lib/prismaClient';

async function main() {
  const startedAt = Date.now();
  const result = await syncAllOrderFacts();
  console.log(JSON.stringify({ ...result, ms: Date.now() - startedAt }));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
