import { describe, expect, it } from 'vitest';

import { decisionTitle } from '@/lib/control-room/text';

describe('decisionTitle', () => {
  it('splits the summary at sentence ends only', () => {
    const { title, lines } = decisionTitle({
      title: 'CD-420299: Ferry sold out, booking attempt timed out',
      summary:
        'The 24 Oct 00:00 CEST sailing is sold out. The 14:00 sailing is quoted at EUR 387.00 (not booked) but lands early. Decision: approve a plan.',
    });
    expect(title).toBe('Ferry sold out, booking attempt timed out');
    expect(lines).toEqual([
      'The 24 Oct 00:00 CEST sailing is sold out.',
      'The 14:00 sailing is quoted at EUR 387.00 (not booked) but lands early.',
      'Decision: approve a plan.',
    ]);
  });
});
