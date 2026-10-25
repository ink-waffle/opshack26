import { logger, queue, task } from '@trigger.dev/sdk';

import { learnFromCard } from '@/lib/meta/learn';

// One learning run at a time: each one spawns several agent replays.
export const metaQueue = queue({ name: 'meta', concurrencyLimit: 1 });

export type MetaLearnPayload = { cardId: string; force?: boolean };

// An EDITED or REJECTED decision card → backtested amendment proposals for the chief dispatcher.
export const metaLearnTask = task({
  id: 'meta-learn',
  queue: metaQueue,
  maxDuration: 1800,
  retry: { maxAttempts: 1 },
  run: async (payload: MetaLearnPayload) => {
    const result = await learnFromCard({
      cardId: payload.cardId,
      force: payload.force,
      log: (message, data) => logger.info(message, data === undefined ? undefined : { data }),
    });
    logger.info('meta-learn done', result);
    return result;
  },
});
