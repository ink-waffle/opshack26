import { tasks } from '@trigger.dev/sdk';
import { createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';

import { isBahnCollection } from '@/lib/bahn/collections';
import type { watchmanInspect, WatchmanInspectPayload } from '@/trigger/watchman';

// Bahn calls this on every new record: { collection, id, orderId? } → watchman-inspect run.

const Body = z.object({
  collection: z.string().min(1),
  id: z.string().min(1),
  orderId: z.string().min(1).optional(),
});

const digest = (value: string) => createHash('sha256').update(value).digest();

function authorized(request: Request, secret: string): boolean {
  const given = request.headers.get('x-bahn-webhook-secret') ?? '';
  return timingSafeEqual(digest(given), digest(secret));
}

export async function POST(request: Request) {
  const secret = process.env.BAHN_WEBHOOK_SECRET;
  if (!secret)
    return Response.json({ error: 'BAHN_WEBHOOK_SECRET is not configured' }, { status: 500 });
  if (!authorized(request, secret))
    return Response.json({ error: 'invalid x-bahn-webhook-secret' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: 'expected { collection, id, orderId? }' }, { status: 400 });
  const { collection, id, orderId } = parsed.data;
  if (!isBahnCollection(collection))
    return Response.json({ error: `unknown collection ${collection}` }, { status: 400 });

  const payload: WatchmanInspectPayload =
    collection === 'messages'
      ? { kind: 'message', ref: id, orderId }
      : { kind: 'record', ref: `${collection}:${id}`, orderId };
  const handle = await tasks.trigger<typeof watchmanInspect>('watchman-inspect', payload, {
    tags: [`bahn:${collection}`],
  });
  return Response.json({ accepted: true, runId: handle.id, payload }, { status: 202 });
}
