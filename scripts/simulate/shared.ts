// Simulator helpers: act as Bahn's API (insert bahn.* records, call our webhook) and follow the watchman run.

import { runs, tasks } from '@trigger.dev/sdk';
import { randomBytes } from 'crypto';

import {
  type BahnCollection,
  getOrderBundle,
  insertBahnRecords,
  type OrderBundle,
} from '@/lib/bahn';
import { simNow } from '@/lib/clock';
import { prisma } from '@/lib/prismaClient';
import type { InspectResult } from '@/lib/watchman/inspect';
import type { watchmanInspect, WatchmanInspectPayload } from '@/trigger/watchman';

export type Speaker = 'driver' | 'site' | 'customer';

const AUTHOR_TYPE: Record<Speaker, string> = {
  driver: 'driver',
  site: 'site_contact',
  customer: 'customer',
};

const DEFAULTS: Record<Speaker, { channel: string; category: string }> = {
  driver: { channel: 'driver_chat', category: 'driver_travel' },
  site: { channel: 'site_call', category: 'pickup_and_release' },
  customer: { channel: 'support_chat', category: 'order_information' },
};

const TERMINAL = new Set([
  'COMPLETED',
  'CANCELED',
  'FAILED',
  'CRASHED',
  'SYSTEM_FAILURE',
  'EXPIRED',
  'TIMED_OUT',
]);

export const simId = (prefix: string) => `${prefix}-sim-${randomBytes(6).toString('hex')}`;

export function activeAssignment(bundle: OrderBundle) {
  const live = bundle.assignments.filter((a) => !a.cancelledAt && a.status !== 'CANCELLED');
  return (
    live.find((a) => a.status === 'IN_PROGRESS') ??
    live.find((a) => a.status === 'ASSIGNED') ??
    live[0]
  );
}

function authorFor(args: { bundle: OrderBundle; from: Speaker }) {
  const { bundle, from } = args;
  if (from === 'driver') {
    const assignment = activeAssignment(bundle);
    if (!assignment) throw new Error(`${bundle.order.reference} has no assignment, so no driver`);
    return { authorId: assignment.driverId, assignmentId: assignment.id };
  }
  if (from === 'site') {
    const siteId =
      bundle.order.pickupSiteId ??
      bundle.endpointDetails.find((d) => d.boundary === 'PICKUP')?.siteId ??
      null;
    if (!siteId) throw new Error(`${bundle.order.reference} has no pickup site`);
    return { authorId: siteId, assignmentId: null };
  }
  return { authorId: bundle.order.customerId, assignmentId: null };
}

/** Inserts an inbound message (and a conversation if none fits) as Bahn would, authored at sim now. */
export async function injectMessage(args: {
  orderRef: string;
  from: Speaker;
  text: string;
  language?: string;
}) {
  const { orderRef, from, text, language = 'en' } = args;
  const bundle = await getOrderBundle({ ref: orderRef });
  if (!bundle) throw new Error(`order ${orderRef} not found`);
  const now = await simNow();
  const authorType = AUTHOR_TYPE[from];
  const { authorId, assignmentId } = authorFor({ bundle, from });
  const existing = bundle.conversations.find(
    (c) =>
      c.orderId === bundle.order.id &&
      c.status === 'OPEN' &&
      (c.counterpartyType === authorType || (from === 'site' && c.counterpartyType === null)) &&
      (c.counterpartyId === authorId || c.counterpartyId === null)
  );
  let conversationId = existing?.id;
  let channel = existing?.channel ?? DEFAULTS[from].channel;
  if (!conversationId) {
    conversationId = simId('conv');
    channel = DEFAULTS[from].channel;
    await insertBahnRecords({
      collection: 'conversations',
      records: [
        {
          id: conversationId,
          status: 'OPEN',
          channel,
          category: DEFAULTS[from].category,
          order_id: bundle.order.id,
          started_at: now.toISOString(),
          updated_at: now.toISOString(),
          counterparty_id: authorId,
          counterparty_type: authorType,
          ...(assignmentId ? { assignment_id: assignmentId } : {}),
        },
      ],
    });
  }
  const messageId = simId('msg');
  await insertBahnRecords({
    collection: 'messages',
    records: [
      {
        id: messageId,
        body: text,
        channel,
        language,
        order_id: bundle.order.id,
        author_id: authorId,
        visibility: 'PUBLIC',
        author_type: authorType,
        authored_at: now.toISOString(),
        recipient_id: 'ops-support',
        recipient_type: 'operator',
        conversation_id: conversationId,
      },
    ],
  });
  await prisma.bahnConversation.update({ where: { id: conversationId }, data: { updatedAt: now } });
  return {
    messageId,
    conversationId,
    createdConversation: !existing,
    orderId: bundle.order.id,
    orderRef: bundle.order.reference,
    authoredAt: now,
  };
}

export const WEBHOOK_URL =
  process.env.BAHN_WEBHOOK_URL ?? 'http://localhost:3001/api/webhooks/bahn';

/** Tells our service about a new Bahn record: POST the webhook, or (`direct`) trigger the task. */
export async function notifyWatchman(args: {
  collection: BahnCollection;
  id: string;
  orderId?: string;
  direct?: boolean;
}): Promise<{ runId: string; via: 'webhook' | 'direct' }> {
  const { collection, id, orderId, direct } = args;
  if (direct) {
    const payload: WatchmanInspectPayload =
      collection === 'messages'
        ? { kind: 'message', ref: id, orderId }
        : { kind: 'record', ref: `${collection}:${id}`, orderId };
    const handle = await tasks.trigger<typeof watchmanInspect>('watchman-inspect', payload);
    return { runId: handle.id, via: 'direct' };
  }
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bahn-webhook-secret': process.env.BAHN_WEBHOOK_SECRET ?? '',
    },
    body: JSON.stringify({ collection, id, orderId }),
  });
  const body = (await response.json().catch(() => ({}))) as { runId?: string; error?: string };
  if (!response.ok || !body.runId)
    throw new Error(`webhook ${WEBHOOK_URL} → ${response.status}: ${JSON.stringify(body)}`);
  return { runId: body.runId, via: 'webhook' };
}

/** Polls a Trigger run until it finishes; returns its status and output. */
export async function followRun(args: { runId: string; timeoutMs?: number }) {
  const { runId, timeoutMs = 3 * 60_000 } = args;
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const run = await runs.retrieve(runId);
    if (run.status !== last) {
      console.log(`  run ${runId}: ${run.status}`);
      last = run.status;
    }
    if (TERMINAL.has(run.status))
      return { status: run.status, output: run.output as unknown, error: run.error };
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return { status: 'TIMEOUT', output: null, error: null };
}

/** One-screen summary of what the watchman did. */
export function describeInspect(result: InspectResult | null | undefined): string {
  if (!result) return '  (no result)';
  if (result.skipped) return `  skipped: ${result.skipped}`;
  const routing = result.routing;
  const lines = [
    `  signal ${result.signalId} (order ${result.orderId})`,
    `  trigger ${result.triggerType} → ${routing?.action}: ${routing?.reason}`,
    `  labels: ${routing?.labels.map((l) => `${l.type}=${l.p.toFixed(2)}`).join(', ') || '-'}; needs_attention=${routing?.needsAttention?.toFixed(2) ?? '-'}`,
    ...(routing?.dispatches ?? []).map(
      (d) =>
        `  dispatch ${d.playbookId}: ${d.status}${d.triggerRunId ? ` (${d.triggerRunId})` : ''}${d.reason ? ` — ${d.reason}` : ''}`
    ),
    ...(routing?.card ? [`  card ${routing.card.cardId} (${routing.card.status})`] : []),
  ];
  return lines.join('\n');
}

export function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export async function finish(promise: Promise<unknown>) {
  try {
    await promise;
    await prisma.$disconnect();
  } catch (error) {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
}
