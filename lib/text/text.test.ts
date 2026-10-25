import { describe, expect, it } from 'vitest';

import { actorWords, deskTimes, plainText } from '@/lib/text';

const now = new Date('2026-10-21T09:00:00Z');

describe('plainText', () => {
  it('drops action-class asides and fact ids', () => {
    expect(
      plainText(
        'The agent told the driver to keep the car stopped (INSTRUCT_HOLD: allowed without approval, safety-preserving).'
      )
    ).toBe('The agent told the driver to keep the car stopped.');
    expect(
      plainText(
        'The owner has already said they are asking them (f_0261230e5e6ace). Stays ASSIGNED (f_1e51d8e97cfa4c, f_17402c22082db6).'
      )
    ).toBe('The owner has already said they are asking them. Stays assigned.');
  });

  it('names roles instead of actor ids', () => {
    expect(
      plainText(
        'Agent control-agent wrote to the driver (driver chat, Wed 21 Oct 11:00 CEST): “Hi”'
      )
    ).toBe('The agent wrote to the driver (driver chat, Wed 21 Oct 11:00 CEST): “Hi”');
    expect(
      plainText(
        'Driver drv-319 (Kasper Kovelund, home Munich) accepted assignment asg-x0fdee1ca8311136b Sat 17 Oct 02:41 CEST; now IN_PROGRESS.'
      )
    ).toBe(
      'Driver Kasper Kovelund (home Munich) accepted assignment Sat 17 Oct 02:41 CEST; now in progress.'
    );
    expect(plainText('Customer cus-024 said (customer email): “Ok.”')).toBe(
      'The customer said (customer email): “Ok.”'
    );
    expect(plainText('ops-support wrote to the customer')).toBe(
      'Ops support wrote to the customer'
    );
    expect(plainText('Alert SAFETY_STOP (critical) raised.')).toBe(
      'Alert safety stop (critical) raised.'
    );
    expect(plainText('Lock released (guardrail G9).')).toBe('Lock released.');
    expect(
      plainText(
        'Payout decision on the cancelled assignment asg-xefb2b3b713e8e64a: PAYOUT_DUE. PAYOUT_DUE is not paid.'
      )
    ).toBe('Payout decision on the cancelled assignment: payout due. Payout due is not paid.');
    expect(plainText('Liam Norvalen (drv-356, based in Hamburg) has no open duty.')).toBe(
      'Liam Norvalen (based in Hamburg) has no open duty.'
    );
    expect(plainText('pickup slot starts (22 Oct 11:00 Europe/Helsinki)')).toBe(
      'pickup slot starts (22 Oct 11:00 Helsinki time)'
    );
  });

  it('rewrites ISO and UTC times as desk time with the zone', () => {
    expect(plainText('Searched ferries from 2026-10-23T18:00:00.000Z: 4 sailings.', now)).toBe(
      'Searched ferries from Fri 23 Oct 21:00 EEST: 4 sailings.'
    );
    expect(
      deskTimes('Departs 31 Oct 08:00 UTC (check-in 06:00 UTC), arrives 1 Nov 13:00 UTC', now)
    ).toBe('Departs Sat 31 Oct 10:00 EET (check-in 08:00 EET), arrives Sun 1 Nov 15:00 EET');
    expect(deskTimes('The timed-out 07:10 UTC attempt', now)).toBe(
      'The timed-out 10:10 EEST attempt'
    );
    expect(deskTimes('asked 2026-10-21T09:00Z', now)).toBe('asked 12:00 EEST');
    expect(deskTimes('Hotels for 1 night(s) from 2026-10-23', now)).toBe(
      'Hotels for 1 night(s) from Fri 23 Oct'
    );
  });

  it('leaves plain prose alone', () => {
    const text = 'The 14:00 sailing is quoted at EUR 387.00 (not booked) but lands early.';
    expect(plainText(text)).toBe(text);
  });
});

describe('actorWords', () => {
  it('says who decided in words', () => {
    expect(actorWords('operator')).toBe('the dispatcher');
    expect(actorWords('damir')).toBe('Damir');
    expect(actorWords(null)).toBeNull();
  });
});
