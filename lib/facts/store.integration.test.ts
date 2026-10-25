import { afterAll, describe, expect, it } from 'vitest';

// Runs only with a database: `pnpm test:local`.
describe.skipIf(!process.env.DATABASE_URL)('facts store (integration)', () => {
  const dedupeKey = 'test:c1:store-integration';

  afterAll(async () => {
    const { prisma } = await import('@/lib/prismaClient');
    await prisma.fact.deleteMany({ where: { dedupeKey } });
    await prisma.$disconnect();
  });

  it('syncs CD-420299 idempotently with deterministic ids', async () => {
    const { syncOrderFacts, listOrderFacts } = await import('@/lib/facts/store');
    await syncOrderFacts({ orderId: 'CD-420299' });
    const again = await syncOrderFacts({ orderId: 'CD-420299' });
    expect(again.created + again.updated + again.pruned).toBe(0);
    const quotes = (await listOrderFacts({ orderId: 'CD-420299', kinds: ['FERRY_QUOTE'] })).filter(
      (f) => f.sourceType === 'BAHN_RECORD'
    );
    expect(quotes.map((f) => f.level)).toEqual(['QUOTED']);
  });

  it('writeFact caps agent interpretations at STATED and getFacts keeps order', async () => {
    const { writeFact, getFacts } = await import('@/lib/facts/store');
    const fact = await writeFact({
      orderId: 'CD-420299',
      kind: 'DRIVER_STATED_LIMIT',
      subject: 'driver:drv-140',
      statement: 'Test: the driver said they can start after 10:00.',
      value: { at: '2026-10-23T08:00:00Z' },
      level: 'VERIFIED',
      sourceType: 'AGENT_INTERPRETATION',
      sourceRef: 'test:c1',
      observedAt: new Date('2026-10-21T09:00:00Z'),
      dedupeKey,
    });
    expect(fact.level).toBe('STATED');
    expect(fact.orderId).toBe('ord-00299');
    const [first] = await getFacts({ ids: [fact.id, 'f_missing'] });
    expect(first.id).toBe(fact.id);
  });
});
