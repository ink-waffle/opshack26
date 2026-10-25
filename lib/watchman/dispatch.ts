import { idempotencyKeys, runs, tasks } from '@trigger.dev/sdk';
import { existsSync } from 'fs';
import { join } from 'path';

import type { OrderBundle } from '@/lib/bahn';
import type { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prismaClient';
import { fmtAt, fmtUtc, hoursBetween, truncate } from '@/lib/watchman/format';
import type { Classification } from '@/lib/watchman/questions';
import {
  PLAYBOOK_IDS,
  type PlaybookMatch,
  ROUTING_PARAMS,
  type RoutingDecision,
  type RoutingParams,
} from '@/lib/watchman/routing';
import { type TriggerItem, upcomingCommitments } from '@/lib/watchman/state';
import { TRIGGERS } from '@/lib/watchman/taxonomy';

// Side effects of routing: trigger a playbook task (deduped per order+playbook) or open a TRIAGE card.

export type PlaybookPayload = {
  orderId: string;
  orderRef: string;
  signalId: string;
  triggerType: string;
};

export type DispatchOutcome = {
  playbookId: string;
  triggerType: string;
  status: 'triggered' | 'deduped' | 'not_dispatched';
  triggerRunId?: string;
  reason?: string;
};

// A run that ended (closed, handed over or failed) no longer owns the order's new signals.
export const ACTIVE_RUN_EXCLUDED = ['CLOSED', 'FAILED', 'ESCALATED'] as const;
// Trigger.dev statuses of a dispatched run that has not finished yet.
const LIVE_TRIGGER_STATUSES = new Set([
  'PENDING_VERSION',
  'QUEUED',
  'DEQUEUED',
  'EXECUTING',
  'WAITING',
  'DELAYED',
]);
// The next commitment within this horizon becomes a triage card's decide-by (sim hours).
const DECIDE_BY_HORIZON_HOURS = 72;

/** The newest playbook run for this order (optionally one playbook) that has not ended. */
export async function findActiveRun(args: {
  orderId: string;
  orderRef: string;
  playbookId?: string;
}) {
  const { orderId, orderRef, playbookId } = args;
  return prisma.playbookRun.findFirst({
    where: {
      orderId: { in: [orderId, orderRef] },
      ...(playbookId ? { playbookId } : {}),
      status: { notIn: [...ACTIVE_RUN_EXCLUDED] },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function findActiveDispatch(args: {
  orderId: string;
  orderRef: string;
  playbookId: string;
  signalId: string;
  params: RoutingParams;
}): Promise<string | null> {
  const { orderId, orderRef, playbookId, signalId, params } = args;
  const run = await findActiveRun({ orderId, orderRef, playbookId });
  if (run) return `active playbook run ${run.id} (${run.status})`;
  // A dispatch counts only while its Trigger run is still starting (no playbook_runs row yet) or live.
  const since = new Date(Date.now() - params.dispatchDedupeMinutes * 60_000);
  const recent = await prisma.$queryRaw<{ id: string; routing: unknown }[]>`
    SELECT id, routing FROM control.signals
    WHERE order_id = ${orderId} AND id <> ${signalId} AND created_at >= ${since}
      AND routing->'dispatches' @> ${JSON.stringify([{ playbookId, status: 'triggered' }])}::jsonb
    ORDER BY created_at DESC LIMIT 3`;
  for (const signal of recent) {
    const dispatches = (signal.routing as { dispatches?: DispatchOutcome[] } | null)?.dispatches;
    const runId = dispatches?.find(
      (d) => d.playbookId === playbookId && d.status === 'triggered'
    )?.triggerRunId;
    if (!runId) continue;
    if (
      await prisma.playbookRun.findFirst({ where: { triggerRunId: runId }, select: { id: true } })
    )
      continue;
    const live = await runs
      .retrieve(runId)
      .then((found) => LIVE_TRIGGER_STATUSES.has(found.status))
      .catch(() => true);
    if (live) return `dispatched by signal ${signal.id} (run ${runId} is still starting)`;
  }
  return null;
}

/** A playbook task exists once `playbooks/<id>/index.ts` does (Trigger queues runs for unknown task ids forever). */
export function isPlaybookAvailable(playbookId: string): boolean {
  const forced = process.env.WATCHMAN_PLAYBOOKS?.split(',').map((id) => id.trim());
  if (forced?.includes(playbookId)) return true;
  const root = process.env.CONTROL_REPO_ROOT ?? process.cwd();
  return existsSync(join(root, 'playbooks', playbookId, 'index.ts'));
}

/** Triggers the playbook task (task id = playbook id) unless one is active for this order. */
export async function dispatchPlaybook(args: {
  match: PlaybookMatch;
  orderId: string;
  orderRef: string;
  signalId: string;
  params?: RoutingParams;
}): Promise<DispatchOutcome> {
  const { match, orderId, orderRef, signalId, params = ROUTING_PARAMS } = args;
  const base = { playbookId: match.playbookId, triggerType: match.triggerType };
  const active = await findActiveDispatch({
    orderId,
    orderRef,
    playbookId: match.playbookId,
    signalId,
    params,
  });
  if (active) return { ...base, status: 'deduped', reason: active };
  if (!isPlaybookAvailable(match.playbookId)) {
    const reason = `playbook task ${match.playbookId} is not registered yet (no playbooks/${match.playbookId}/index.ts)`;
    console.warn(`[watchman] ${orderRef}: ${reason}; routing decision recorded only`);
    return { ...base, status: 'not_dispatched', reason };
  }
  const payload: PlaybookPayload = { orderId, orderRef, signalId, triggerType: match.triggerType };
  try {
    // Per signal: a retry of this inspection reuses the run; a new signal after a reset starts a new one.
    const idempotencyKey = await idempotencyKeys.create(
      `watchman:${orderId}:${match.playbookId}:${signalId}`,
      { scope: 'global' }
    );
    const handle = await tasks.trigger(match.playbookId, payload, {
      idempotencyKey,
      idempotencyKeyTTL: `${params.dispatchDedupeMinutes}m`,
      tags: [`order:${orderRef}`, `trigger:${match.triggerType}`],
    });
    return { ...base, status: 'triggered', triggerRunId: handle.id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[watchman] ${match.playbookId} not dispatched for ${orderRef}: ${reason}`);
    return { ...base, status: 'not_dispatched', reason: truncate(reason, 300) };
  }
}

function triageTitle(args: {
  orderRef: string;
  trigger: TriggerItem;
  classification: Classification;
}) {
  const { orderRef, trigger, classification } = args;
  const who = trigger.kind === 'message' ? trigger.message.authorType.replace('_', ' ') : 'record';
  const topic = classification.triggers.find((t) => t.type !== 'ROUTINE' && t.p >= 0.5);
  const kind = classification.claimType.toLowerCase();
  return `${orderRef} · ${who} ${kind}: ${topic ? TRIGGERS[topic.type].label.toLowerCase() : 'not covered by a playbook'}`;
}

function triageSummary(args: {
  bundle: OrderBundle;
  trigger: TriggerItem;
  classification: Classification;
  decision: RoutingDecision;
  now: Date;
}) {
  const { bundle, trigger, classification, decision, now } = args;
  const said =
    trigger.kind === 'message'
      ? `"${truncate(trigger.message.body, 240)}" (${trigger.message.authorType}, ${fmtAt(trigger.message.authoredAt, now)}, ${trigger.message.channel})`
      : trigger.kind === 'monitor'
        ? trigger.hit.summary
        : `New ${trigger.collection} record ${trigger.id}.`;
  const labels = classification.triggers
    .filter((t) => t.p >= 0.5 && t.type !== 'ROUTINE')
    .slice(0, 3)
    .map((t) => `${TRIGGERS[t.type].label} (${t.p.toFixed(2)})`);
  const primary = bundle.items.find((item) => item.role === 'PRIMARY')?.vehicle;
  const next = upcomingCommitments({ bundle, now })[0];
  return [
    said,
    `Watchman: ${labels.join('; ') || 'no known trigger'}; needs attention ${(decision.needsAttention ?? 0).toFixed(2)}; no playbook covers it.`,
    `${primary ? `${primary.make} ${primary.model}, ` : ''}order ${bundle.order.status}${next ? `; next commitment ${fmtUtc(next.at)}: ${next.reason}` : ''}.`,
  ].join('\n');
}

/** Escape hatch: one OPEN TRIAGE card per order; a later item is appended to it. */
export async function openTriageCard(args: {
  bundle: OrderBundle;
  trigger: TriggerItem;
  classification: Classification;
  decision: RoutingDecision;
  signalId: string;
  now: Date;
  factIds?: string[];
}): Promise<{ cardId: string; status: 'created' | 'appended' }> {
  const { bundle, trigger, classification, decision, signalId, now, factIds = [] } = args;
  const orderId = bundle.order.id;
  const summary = triageSummary({ bundle, trigger, classification, decision, now });
  const action = {
    at: now.toISOString(),
    actor: 'watchman',
    action: 'classified the item and found no playbook for it',
    signalId,
    detail: decision.reason,
  };
  const existing = await prisma.card.findFirst({
    where: { orderId, kind: 'TRIAGE', status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    const actions = Array.isArray(existing.agentActions) ? existing.agentActions : [];
    await prisma.card.update({
      where: { id: existing.id },
      data: {
        summary: `${existing.summary}\nAlso ${fmtUtc(now)}: ${summary.split('\n')[0]}`,
        agentActions: [...actions, action] as Prisma.InputJsonValue,
        factIds: [...new Set([...existing.factIds, ...factIds])],
      },
    });
    return { cardId: existing.id, status: 'appended' };
  }
  const next = upcomingCommitments({ bundle, now }).find(
    (c) => hoursBetween(now, c.at) <= DECIDE_BY_HORIZON_HOURS
  );
  const card = await prisma.card.create({
    data: {
      orderId,
      playbookId: PLAYBOOK_IDS.escapeHatch,
      kind: 'TRIAGE',
      status: 'OPEN',
      title: triageTitle({ orderRef: bundle.order.reference, trigger, classification }),
      summary,
      agentActions: [action] as Prisma.InputJsonValue,
      factIds,
      decideBy: next?.at ?? null,
      decideByReason: next ? `until ${fmtUtc(next.at)}: ${next.reason}` : null,
    },
  });
  return { cardId: card.id, status: 'created' };
}

/** The decision model could not read an item: a "worth a look" card says so and shows the item. */
export async function openUnreadCard(args: {
  bundle: OrderBundle;
  trigger: TriggerItem;
  error: string;
  signalId: string;
  now: Date;
  factIds?: string[];
}): Promise<{ cardId: string; status: 'created' | 'appended' }> {
  const { bundle, trigger, error, signalId, now, factIds = [] } = args;
  const what =
    trigger.kind === 'message'
      ? `${trigger.message.authorType.replace('_', ' ')} message`
      : trigger.kind === 'record'
        ? `new ${trigger.collection.replace(/_/g, ' ')} record`
        : 'monitor hit';
  const said =
    trigger.kind === 'message'
      ? `"${truncate(trigger.message.body, 240)}" (${trigger.message.authorType}, ${fmtAt(trigger.message.authoredAt, now)}, ${trigger.message.channel})`
      : trigger.kind === 'record'
        ? `New ${trigger.collection} record ${trigger.id}.`
        : trigger.hit.summary;
  const summary = [
    said,
    `The watchman could not classify this ${what}: the decision model failed (${truncate(error, 140)}). No playbook was started; a person should read it.`,
  ].join('\n');
  const action = {
    at: now.toISOString(),
    actor: 'watchman',
    action: 'could not classify the item (decision model failed)',
    signalId,
    detail: truncate(error, 300),
  };
  const existing = await prisma.card.findFirst({
    where: { orderId: bundle.order.id, kind: 'TRIAGE', status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    const actions = Array.isArray(existing.agentActions) ? existing.agentActions : [];
    await prisma.card.update({
      where: { id: existing.id },
      data: {
        summary: `${existing.summary}\nAlso ${fmtUtc(now)}: unread ${what} (decision model failed).`,
        agentActions: [...actions, action] as Prisma.InputJsonValue,
        factIds: [...new Set([...existing.factIds, ...factIds])],
      },
    });
    return { cardId: existing.id, status: 'appended' };
  }
  const next = upcomingCommitments({ bundle, now }).find(
    (c) => hoursBetween(now, c.at) <= DECIDE_BY_HORIZON_HOURS
  );
  const card = await prisma.card.create({
    data: {
      orderId: bundle.order.id,
      playbookId: PLAYBOOK_IDS.escapeHatch,
      kind: 'TRIAGE',
      status: 'OPEN',
      title: `${bundle.order.reference} · watchman: could not read a ${what}`,
      summary,
      agentActions: [action] as Prisma.InputJsonValue,
      factIds,
      decideBy: next?.at ?? null,
      decideByReason: next ? `until ${fmtUtc(next.at)}: ${next.reason}` : null,
    },
  });
  return { cardId: card.id, status: 'created' };
}
