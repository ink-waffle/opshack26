// Demo prime (LOCAL): `pnpm demo:prime [--no-wait]`. Drives the real pipeline (watchman tick → backfill → router →
// playbook tasks on `trigger dev`) until CD-420299, CD-420322 and CD-420449 have OPEN decision cards with live tokens.

import { wait } from '@trigger.dev/sdk';

import { findOrder } from '@/lib/bahn';
import { simNow } from '@/lib/clock';
import { prisma } from '@/lib/prismaClient';
import { backfillMessages } from '@/lib/watchman/backfill';
import { dispatchPlaybook, findActiveRun } from '@/lib/watchman/dispatch';
import { inspect } from '@/lib/watchman/inspect';
import type { TriggerType } from '@/lib/watchman/taxonomy';
import { watchmanTick } from '@/lib/watchman/tick';
import {
  DEMO_TARGETS,
  finishScript,
  flag,
  guardDatabase,
  resetDispatchKeys,
} from '@/scripts/demo/shared';

const SETTLE_TIMEOUT_MS = 15 * 60_000;
const TERMINAL = ['CLOSED', 'ESCALATED', 'FAILED'] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function dispatchLine(result: Awaited<ReturnType<typeof inspect>>): string {
  const dispatches = result.routing?.dispatches ?? [];
  const card = result.routing?.card;
  return [
    result.triggerType ?? result.skipped ?? '-',
    ...dispatches.map((d) => `→ ${d.playbookId} ${d.status}`),
    ...(card ? [`→ triage card ${card.status}`] : []),
    ...(result.routing?.attachedRunId ? ['→ attached to the active run'] : []),
  ].join(' ');
}

/** Each target order gets its playbook through the watchman; a direct dispatch is the fallback if Jev declines. */
async function primeTargets() {
  for (const target of DEMO_TARGETS) {
    const order = await findOrder({ ref: target.ref });
    if (!order) throw new Error(`Unknown order ${target.ref}`);
    // Started already: an active run, an open card, or a signal that dispatched it (the run row may not exist yet).
    const [active, open, signals] = await Promise.all([
      findActiveRun({
        orderId: order.id,
        orderRef: order.reference,
        playbookId: target.playbookId,
      }),
      prisma.card.findFirst({
        where: {
          orderId: order.id,
          playbookId: target.playbookId,
          kind: 'DECISION',
          status: 'OPEN',
        },
      }),
      prisma.signal.findMany({ where: { orderId: order.id }, select: { routing: true } }),
    ]);
    const dispatched = signals.some((signal) =>
      (
        (signal.routing as { dispatches?: { playbookId: string; status: string }[] } | null)
          ?.dispatches ?? []
      ).some((d) => d.playbookId === target.playbookId && d.status === 'triggered')
    );
    if (active || open || dispatched) {
      console.log(
        `  ${target.ref}: ${target.playbookId} already started (${active?.status ?? (open ? 'card open' : 'dispatched')})`
      );
      continue;
    }
    const result = await inspect({ ...target.item, orderId: order.id, force: true });
    const triggered = result.routing?.dispatches.some(
      (d) => d.playbookId === target.playbookId && d.status !== 'not_dispatched'
    );
    console.log(`  ${target.ref} via ${target.via}: ${dispatchLine(result)}`);
    if (triggered || !result.signalId) continue;
    await resetDispatchKeys([{ orderId: order.id, playbookId: target.playbookId }]);
    const fallback = await dispatchPlaybook({
      match: {
        playbookId: target.playbookId,
        triggerType: result.triggerType as TriggerType,
        p: 1,
      },
      orderId: order.id,
      orderRef: order.reference,
      signalId: result.signalId,
    });
    console.log(
      `  ${target.ref}: watchman did not route it; dispatched directly → ${fallback.status}`
    );
  }
}

type Progress = { ref: string; playbookId: string; state: string; settled: boolean };

async function progress(): Promise<Progress[]> {
  const runs = await prisma.playbookRun.findMany({
    where: { status: { notIn: [...TERMINAL] } },
    include: { blockRuns: { orderBy: { startedAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'asc' },
  });
  const orders = await prisma.bahnOrder.findMany({
    where: { id: { in: runs.map((run) => run.orderId).filter((id): id is string => !!id) } },
    select: { id: true, reference: true },
  });
  const refs = new Map(orders.map((order) => [order.id, order.reference]));
  const cards = await prisma.card.findMany({
    where: { runId: { in: runs.map((run) => run.id) }, status: 'OPEN', kind: 'DECISION' },
  });
  return runs.map((run) => {
    const latest = run.blockRuns[0];
    const card = cards.find((c) => c.runId === run.id && c.waitpointTokenId);
    const waiting = latest?.kind === 'wait' && latest.status === 'WAITING';
    return {
      ref: refs.get(run.orderId ?? '') ?? run.orderId ?? '?',
      playbookId: run.playbookId,
      state: card
        ? 'card open'
        : waiting
          ? 'waiting (deadline-aware wait)'
          : `${run.status} · ${run.currentBlockId ?? '-'}`,
      settled: Boolean(card) || waiting,
    };
  });
}

async function waitUntilSettled() {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let last = '';
  for (;;) {
    const rows = await progress();
    const text = rows.map((row) => `${row.ref} ${row.playbookId}: ${row.state}`).join('\n  ');
    if (text !== last) {
      console.log(`  [${new Date().toLocaleTimeString('en-GB')}]\n  ${text}`);
      last = text;
    }
    if (rows.every((row) => row.settled)) return;
    if (Date.now() > deadline) {
      console.warn('  still not settled after 15 min; check the Trigger.dev dashboard');
      return;
    }
    await sleep(4000);
  }
}

async function summary(args: { startedAt: Date }) {
  const cards = await prisma.card.findMany({
    where: { status: 'OPEN' },
    orderBy: { decideBy: 'asc' },
  });
  const orders = await prisma.bahnOrder.findMany({
    where: { id: { in: cards.map((card) => card.orderId).filter((id): id is string => !!id) } },
    select: { id: true, reference: true },
  });
  const refs = new Map(orders.map((order) => [order.id, order.reference]));
  const decisions = cards.filter((card) => card.kind === 'DECISION');
  const tokens = await Promise.all(
    decisions.map((card) =>
      card.waitpointTokenId
        ? wait.retrieveToken(card.waitpointTokenId).catch(() => null)
        : Promise.resolve(null)
    )
  );
  console.log(`\nOPEN decision cards (${decisions.length}), by decide-by:`);
  decisions.forEach((card, index) => {
    const token = tokens[index];
    console.log(
      `  ${card.decideBy?.toISOString() ?? 'no deadline'}  ${refs.get(card.orderId ?? '')}  ${card.title.replace(/^CD-\d+:\s*/, '')}\n    /cards/${card.id}  token ${token?.status ?? 'missing'}${token?.timeoutAt ? ` until ${token.timeoutAt.toISOString()}` : ''}`
    );
  });
  const triage = cards.filter((card) => card.kind === 'TRIAGE');
  console.log(`OPEN triage cards: ${triage.length}`);
  const cost = await prisma.blockRun.aggregate({
    where: { startedAt: { gte: args.startedAt } },
    _sum: { costUsd: true },
  });
  console.log(`Agent cost of this prime: $${(cost._sum.costUsd ?? 0).toFixed(2)}`);
  const missing = [];
  for (const target of DEMO_TARGETS) {
    const card = decisions.find(
      (c) => refs.get(c.orderId ?? '') === target.ref && c.playbookId === target.playbookId
    );
    if (!card) missing.push(target.ref);
  }
  if (missing.length) console.warn(`Missing demo cards: ${missing.join(', ')}`);
  else console.log('All three demo cards are open.');
}

async function main() {
  guardDatabase({ allowProd: false });
  const startedAt = Date.now();
  const now = await simNow();
  console.log(`sim now ${now.toISOString()}`);

  console.log('1. Watchman tick (monitors at sim now)');
  const tick = await watchmanTick();
  console.log(`  ${tick.hits} monitor hits, ${tick.newHits.length} new`);
  for (const signal of tick.signals) console.log(`  ${signal.orderId}: ${dispatchLine(signal)}`);

  console.log('2. Demo orders');
  await primeTargets();

  console.log('3. Backfill: the latest inbound message of every order with an open issue');
  const { messages } = await backfillMessages({ now });
  for (const message of messages) {
    const result = await inspect({ kind: 'message', ref: message.id });
    if (!result.skipped) console.log(`  ${message.orderId}: ${dispatchLine(result)}`);
  }

  if (!flag('no-wait')) {
    console.log('4. Waiting for every playbook to reach a card (agent blocks run two at a time)');
    await waitUntilSettled();
  }
  await summary({ startedAt: new Date(startedAt) });
  console.log(`Done in ${Math.round((Date.now() - startedAt) / 1000)} s.`);
}

finishScript(main());
