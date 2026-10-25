// Populate the control room at demo start: inspect the latest inbound message of every order with an open issue.
// pnpm sim:backfill [--force] [--tick] [--dry]

import { simNow } from '@/lib/clock';
import { backfillMessages } from '@/lib/watchman/backfill';
import { inspect } from '@/lib/watchman/inspect';
import { watchmanTick } from '@/lib/watchman/tick';
import { describeInspect, finish, flag } from '@/scripts/simulate/shared';

async function main() {
  const now = await simNow();
  const { orderIds, messages: targets } = await backfillMessages({ now });
  console.log(
    `sim now ${now.toISOString()}: ${orderIds.length} orders with an open issue, ${targets.length} with an inbound message`
  );
  for (const message of targets) {
    console.log(
      `${message.orderId} ${message.id} (${message.authorType}): ${message.body.slice(0, 90)}`
    );
    if (flag('dry')) continue;
    try {
      const result = await inspect({ kind: 'message', ref: message.id, force: flag('force') });
      console.log(describeInspect(result));
    } catch (error) {
      console.log(`  failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (flag('tick') && !flag('dry')) {
    const tick = await watchmanTick();
    console.log(
      `tick at sim ${tick.simNow}: ${tick.hits} monitor hits, ${tick.newHits.length} new`
    );
    for (const signal of tick.signals) console.log(describeInspect(signal));
  }
}

finish(main());
