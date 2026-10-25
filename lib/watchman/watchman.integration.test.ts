import { afterAll, describe, expect, it } from 'vitest';

import { BAHN_SNAPSHOT_AT } from '@/lib/bahn/collections';

// Needs the local database (`pnpm test:local`); the Jev case also needs OPENROUTER_API_KEY.
describe.skipIf(!process.env.DATABASE_URL)('watchman state (integration)', () => {
  afterAll(async () => {
    const { prisma } = await import('@/lib/prismaClient');
    await prisma.$disconnect();
  });

  async function stateFor(args: { ref: string; messageAt: string }) {
    const { getOrderBundle } = await import('@/lib/bahn/orders');
    const { buildOrderState, stateSize } = await import('@/lib/watchman/state');
    const bundle = (await getOrderBundle({ ref: args.ref }))!;
    const message = bundle.conversations
      .flatMap((c) => c.messages)
      .find((m) => m.authoredAt.toISOString().startsWith(args.messageAt))!;
    const conversation = bundle.conversations.find((c) => c.id === message.conversationId)!;
    const state = buildOrderState({
      bundle,
      now: message.authoredAt,
      asOf: message.authoredAt,
      trigger: { kind: 'message', message, conversation },
    });
    return { state, size: stateSize(state), message };
  }

  it('words CD-420299 travel by evidence level and stays compact', async () => {
    const { state, size } = await stateFor({ ref: 'CD-420299', messageAt: '2026-10-21T07:20' });
    expect(size).toBeLessThan(8_000);
    expect(state.travel.join('\n')).toMatch(/SOLD OUT .*NOT booked/);
    expect(state.travel.join('\n')).toMatch(/QUOTED EUR 387 .*NOT booked/);
    expect(state.pickup).toMatch(/No pickup event recorded/);
    expect(state.promise).toMatch(/agreed with the customer/);
    expect(state.messages.at(-1)).toMatch(/TRIGGERING ITEM/);
  });

  it('hides records after the message time (no leakage)', async () => {
    const { state } = await stateFor({ ref: 'CD-420299', messageAt: '2026-10-21T07:20' });
    expect(state.messages).toHaveLength(1);
    expect(state.messages.join('\n')).not.toMatch(/later sailing can work/);
  });

  it('lists upcoming commitments for decide-by', async () => {
    const { getOrderBundle } = await import('@/lib/bahn/orders');
    const { upcomingCommitments } = await import('@/lib/watchman/state');
    const bundle = (await getOrderBundle({ ref: 'CD-420449' }))!;
    const next = upcomingCommitments({ bundle, now: BAHN_SNAPSHOT_AT })[0];
    expect(next?.reason).toMatch(/paid train/);
    expect(next?.at.toISOString()).toBe('2026-10-21T10:25:00.000Z');
  });

  it.skipIf(!process.env.OPENROUTER_API_KEY)(
    'Jev flags the CD-420322 red warning as VEHICLE_WARNING (live)',
    async () => {
      const { classify } = await import('@/lib/watchman/questions');
      const { state } = await stateFor({ ref: 'CD-420322', messageAt: '2026-10-21T08:04' });
      const result = await classify({ state });
      expect(result.triggers[0]?.type).toBe('VEHICLE_WARNING');
      expect(result.triggers[0]?.p).toBeGreaterThan(0.7);
      expect(result.needsAttention).toBeGreaterThan(0.7);
    },
    30_000
  );
});
