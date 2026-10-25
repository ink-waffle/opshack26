import { describe, expect, it } from 'vitest';

import { cardExpiresAt, isExpiryPayload } from '@/lib/playbooks/cardExpiry';

describe('card expiry on sim time', () => {
  it('expires at decide-by plus the margin', () => {
    const decideBy = new Date('2026-10-21T10:00:00Z');
    expect(cardExpiresAt({ decideBy, marginMinutes: 30 })?.toISOString()).toBe(
      '2026-10-21T10:30:00.000Z'
    );
  });

  it('never expires without a deadline', () => {
    expect(cardExpiresAt({ decideBy: null, marginMinutes: 30 })).toBeNull();
  });

  it('tells an expiry from a decision', () => {
    expect(isExpiryPayload({ expired: true, reason: 'late', simAt: '' })).toBe(true);
    expect(isExpiryPayload({ action: 'approve', decidedBy: 'damir' })).toBe(false);
    expect(isExpiryPayload(null)).toBe(false);
  });
});
