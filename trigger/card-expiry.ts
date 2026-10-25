import { logger, schedules } from '@trigger.dev/sdk';

import { expireOverdueCards } from '@/lib/playbooks/expiry';

// Every minute: decision cards past their decide-by (plus margin) on the sim clock expire, and their runs resume.
export const cardExpiryTask = schedules.task({
  id: 'card-expiry',
  cron: { pattern: '* * * * *', window: '0m' },
  ttl: '2m',
  queue: { concurrencyLimit: 1 },
  maxDuration: 120,
  run: async () => {
    const result = await expireOverdueCards();
    if (result.expired.length) logger.info('cards expired', result);
    return result;
  },
});
