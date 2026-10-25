import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prismaClient', () => ({ prisma: {} }));
vi.mock('@/lib/providers/scripts', () => ({ findScriptedReply: async () => null }));

const { mockTravel } = await import('@/lib/providers/adapters/mockTravel');

const booking = (bookingReference: string | null) => ({
  mode: 'HOTEL',
  provider: 'Old Town Hotel',
  bookingReference,
  description: 'hotel in Tallinn from 21 Oct 22:00',
});

describe('simulated cancellation', () => {
  it('cancels a booking by its reference with a deterministic cancellation reference', async () => {
    const args = {
      booking: booking('HTL-OLD'),
      orderId: 'ord-1',
      at: new Date('2026-10-21T09:00:00Z'),
    };
    const result = await mockTravel.cancel(args);
    expect(result.ok).toBe(true);
    expect(result.cancellationReference).toMatch(/^CXL-[0-9A-F]{8}$/);
    expect(result.statement).toContain('ref HTL-OLD');
    expect((await mockTravel.cancel(args)).cancellationReference).toBe(
      result.cancellationReference
    );
  });

  it('refuses a booking without a reference', async () => {
    const result = await mockTravel.cancel({
      booking: booking(null),
      orderId: 'ord-1',
      at: new Date('2026-10-21T09:00:00Z'),
    });
    expect(result).toMatchObject({ ok: false, cancellationReference: null });
    expect(result.statement).toMatch(/no booking reference/);
  });
});
