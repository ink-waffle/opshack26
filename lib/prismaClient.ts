import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/lib/generated/prisma/client';

// `pg` uses unnamed prepared statements, so a plain URL is safe behind Supavisor's transaction pooler.
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter, log: ['error'] });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { prisma };
