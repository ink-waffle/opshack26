import { logger, schedules, task } from '@trigger.dev/sdk';

import { inspect, type InspectArgs } from '@/lib/watchman/inspect';
import { watchmanTick } from '@/lib/watchman/tick';

export type WatchmanInspectPayload = Pick<InspectArgs, 'kind' | 'ref' | 'orderId' | 'force'>;

// Watchman for one new message / record / monitor hit (the Bahn webhook triggers this).
export const watchmanInspect = task({
  id: 'watchman-inspect',
  queue: { concurrencyLimit: 5 },
  maxDuration: 120,
  run: async (payload: WatchmanInspectPayload) => {
    const result = await inspect(payload);
    logger.info('watchman inspect', { payload, result });
    return result;
  },
});

// Clock tick: deterministic monitors over all active orders at sim now; each hit fires once.
export const watchmanTickTask = schedules.task({
  id: 'watchman-tick',
  cron: { pattern: '* * * * *', window: '0m' },
  ttl: '2m',
  queue: { concurrencyLimit: 1 },
  maxDuration: 300,
  run: async () => {
    const result = await watchmanTick();
    logger.info('watchman tick', {
      simNow: result.simNow,
      orders: result.orders,
      hits: result.hits,
      newHits: result.newHits,
    });
    return {
      ...result,
      signals: result.signals.map((s) => ({
        signalId: s.signalId,
        orderId: s.orderId,
        triggerType: s.triggerType,
        action: s.routing?.action,
        dispatches: s.routing?.dispatches,
        skipped: s.skipped,
      })),
    };
  },
});
