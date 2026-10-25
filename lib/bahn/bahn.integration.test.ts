import { afterAll, describe, expect, it } from 'vitest';

import { BAHN_COLLECTIONS } from '@/lib/bahn/collections';
import { readBahnManifest } from '@/lib/bahn/dataset';

// Runs only with a database: `pnpm test:local` (or dotenv -e .env.production -- vitest run).
describe.skipIf(!process.env.DATABASE_URL)('bahn schema (integration)', () => {
  afterAll(async () => {
    const { prisma } = await import('@/lib/prismaClient');
    await prisma.$disconnect();
  });

  it('holds exactly the manifest row count in every bahn table (simulated rows aside)', async () => {
    const { countBahnTables } = await import('@/lib/bahn/insert');
    const { prisma } = await import('@/lib/prismaClient');
    const manifest = await readBahnManifest();
    const counts = await countBahnTables();
    // Agents (msg-ctl-*) and the Bahn simulator (msg-sim-*, conv-sim-*) add rows as Bahn's API would.
    const [messages, conversations] = await Promise.all([
      prisma.bahnMessage.count({
        where: { OR: [{ id: { startsWith: 'msg-ctl-' } }, { id: { startsWith: 'msg-sim-' } }] },
      }),
      prisma.bahnConversation.count({ where: { id: { startsWith: 'conv-sim-' } } }),
    ]);
    const simulated: Partial<Record<string, number>> = { messages, conversations };
    for (const collection of BAHN_COLLECTIONS) {
      expect({ collection, count: counts[collection] - (simulated[collection] ?? 0) }).toEqual({
        collection,
        count: manifest.tables[collection],
      });
    }
  });

  it('has a sim clock row', async () => {
    const { getSimClock } = await import('@/lib/clock');
    const clock = await getSimClock();
    expect(clock.speed).toBeGreaterThanOrEqual(0);
  });

  it('builds the CD-420299 order bundle with an active plan', async () => {
    const { getOrderBundle } = await import('@/lib/bahn/orders');
    const bundle = await getOrderBundle({ ref: 'CD-420299' });
    expect(bundle?.order.id).toBe('ord-00299');
    expect(bundle?.activePlan?.id).toBe(bundle?.order.activePlanId);
    expect(bundle?.activePlan?.points.length).toBeGreaterThan(0);
    expect(bundle?.events.length).toBeGreaterThan(0);
    expect(bundle?.travelOptions.length).toBeGreaterThan(0);
  });

  it('lists a driver duty chain ordered by start', async () => {
    const { getDriverDuties } = await import('@/lib/bahn/drivers');
    const { duties } = await getDriverDuties({ driverId: 'drv-055' });
    expect(duties.length).toBeGreaterThan(1);
    const starts = duties.map((duty) => duty.startAt?.getTime() ?? Infinity);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});
