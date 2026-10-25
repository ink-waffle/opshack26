// Act as Bahn: insert an inbound message and notify our webhook.
// pnpm sim:inject --order CD-420299 --from driver --text '…' [--lang de] [--direct] [--no-wait]

import type { InspectResult } from '@/lib/watchman/inspect';
import {
  arg,
  describeInspect,
  finish,
  flag,
  followRun,
  injectMessage,
  notifyWatchman,
  type Speaker,
} from '@/scripts/simulate/shared';

async function main() {
  const orderRef = arg('order');
  const from = arg('from') as Speaker | undefined;
  const text = arg('text');
  if (!orderRef || !from || !text || !['driver', 'site', 'customer'].includes(from))
    throw new Error("usage: --order CD-… --from driver|site|customer --text '…' [--direct]");
  const injected = await injectMessage({ orderRef, from, text, language: arg('lang') });
  console.log(
    `inserted bahn.messages ${injected.messageId} (${injected.createdConversation ? 'new' : 'existing'} conversation ${injected.conversationId}) at sim ${injected.authoredAt.toISOString()}`
  );
  const { runId, via } = await notifyWatchman({
    collection: 'messages',
    id: injected.messageId,
    orderId: injected.orderId,
    direct: flag('direct'),
  });
  console.log(`watchman-inspect ${runId} (via ${via})`);
  if (flag('no-wait')) return;
  const run = await followRun({ runId });
  console.log(describeInspect(run.output as InspectResult));
  if (run.error) console.log(run.error);
}

finish(main());
