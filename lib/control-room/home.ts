// The control room home: decisions by decide-by, triage worth a look, agents at work, watchman pulse.

import { HOUR_MS } from '@/lib/clock/math';
import { clip, splitDecideBy } from '@/lib/control-room/format';
import { parseOptions } from '@/lib/control-room/options';
import {
  CLOSED_ORDER_STATUSES,
  orderSummaries,
  type OrderSummary,
} from '@/lib/control-room/orders';
import {
  describeCurrentStep,
  type PlaybookMeta,
  playbookMeta,
  RUN_STATUS_WORDS,
} from '@/lib/control-room/playbooks';
import { decisionTitle, speakerWord, triageTitle } from '@/lib/control-room/text';
import { asSimTime, loadNow, type Now, simTimeOf } from '@/lib/control-room/time';
import type { Card, Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prismaClient';
import { actorWords, plainText } from '@/lib/text';

export const ACTIVE_RUN_STATUSES = [
  'DETECTED',
  'GATHERING',
  'OPTIONS_READY',
  'AWAITING_DECISION',
  'EXECUTING',
] as const;

type RunWithLatestBlock = Prisma.PlaybookRunGetPayload<{
  include: { blockRuns: true };
}>;

export type DecisionRow = {
  id: string;
  order: OrderSummary | null;
  playbook: PlaybookMeta;
  title: string;
  decideBy: string | null;
  until: string | undefined;
  reason: string | undefined;
  optionCount: number;
  recommended: string | null;
};

export type TriageRow = {
  id: string;
  order: OrderSummary | null;
  // Opened by a playbook run that stopped (failure, reject, expiry, refusal), not by the watchman.
  handover: boolean;
  title: string;
  speaker: string | null;
  quote: string | null;
  decideBy: string | null;
  until: string | undefined;
  reason: string | undefined;
};

export type AgentRow = {
  runId: string;
  order: OrderSummary | null;
  playbook: PlaybookMeta;
  step: string;
  status: string;
  since: string;
};

export type RecentRow = {
  id: string;
  order: OrderSummary | null;
  title: string;
  outcome: string;
  // ok: carried out; danger: rejected, expired or not carried out; neutral: still running.
  tone: 'ok' | 'danger' | 'neutral';
  next: string;
  decidedAt: string | null;
};

export type ControlRoom = Now & {
  decisions: DecisionRow[];
  triage: TriageRow[];
  agents: AgentRow[];
  recent: RecentRow[];
  counts: { decisions: number; agents: number; triage: number; quiet: number; active: number };
  watchman: { lastSignalAt: string | null; signalsLastHour: number; ordersWatched: number };
};

function byDecideBy(
  a: Pick<Card, 'decideBy' | 'createdAt'>,
  b: Pick<Card, 'decideBy' | 'createdAt'>
) {
  const da = a.decideBy?.getTime() ?? Number.POSITIVE_INFINITY;
  const db = b.decideBy?.getTime() ?? Number.POSITIVE_INFINITY;
  return da - db || a.createdAt.getTime() - b.createdAt.getTime();
}

function firstSignalId(agentActions: unknown): string | null {
  if (!Array.isArray(agentActions)) return null;
  for (const action of agentActions) {
    const id = (action as { signalId?: unknown } | null)?.signalId;
    if (typeof id === 'string') return id;
  }
  return null;
}

/** The message (or other source) behind each triage card, keyed by card id. */
export async function triageSources(cards: Card[]) {
  const signalIds = cards
    .map((c) => firstSignalId(c.agentActions))
    .filter((id): id is string => !!id);
  const signals = await prisma.signal.findMany({ where: { id: { in: signalIds } } });
  const signalById = new Map(signals.map((s) => [s.id, s]));
  const messageIds = signals
    .filter((s) => s.source === 'message' && s.sourceRef)
    .map((s) => s.sourceRef!);
  const [messages, inbox] = await Promise.all([
    prisma.bahnMessage.findMany({
      where: { id: { in: messageIds } },
      select: {
        id: true,
        body: true,
        authorType: true,
        authorNameSnapshot: true,
        authorId: true,
        authoredAt: true,
        channel: true,
      },
    }),
    prisma.bahnSupportInboxMessage.findMany({
      where: { id: { in: messageIds } },
      omit: { raw: true },
    }),
  ]);
  const messageById = new Map(messages.map((m) => [m.id, m]));
  const inboxById = new Map(inbox.map((m) => [m.id, m]));
  return new Map(
    cards.map((card) => {
      const signal = signalById.get(firstSignalId(card.agentActions) ?? '');
      const message = signal?.sourceRef ? messageById.get(signal.sourceRef) : undefined;
      const inboxMessage = signal?.sourceRef ? inboxById.get(signal.sourceRef) : undefined;
      return [
        card.id,
        { signal: signal ?? null, message: message ?? null, inbox: inboxMessage ?? null },
      ];
    })
  );
}

function latestBlock(run: RunWithLatestBlock) {
  return (
    [...run.blockRuns].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null
  );
}

export async function getControlRoom(): Promise<ControlRoom> {
  const { clock, now } = await loadNow();
  const [openCards, activeRuns, recentCards, orderStates, lastSignal, signalsLastHour] =
    await Promise.all([
      prisma.card.findMany({ where: { status: 'OPEN' } }),
      prisma.playbookRun.findMany({
        where: { status: { in: [...ACTIVE_RUN_STATUSES] } },
        include: { blockRuns: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.card.findMany({
        where: { kind: 'DECISION', status: { not: 'OPEN' } },
        include: { run: { include: { blockRuns: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 3,
      }),
      prisma.bahnOrder.findMany({ select: { id: true, status: true } }),
      prisma.signal.findFirst({ where: { simAt: { lte: now } }, orderBy: { simAt: 'desc' } }),
      prisma.signal.count({
        where: { simAt: { gt: new Date(now.getTime() - HOUR_MS), lte: now } },
      }),
    ]);

  const decisionCards = openCards.filter((c) => c.kind === 'DECISION').sort(byDecideBy);
  const busyOrders = new Set([
    ...decisionCards.map((c) => c.orderId),
    ...activeRuns.map((r) => r.orderId),
  ]);
  const isHandover = (card: Card) => !!card.runId && card.playbookId !== 'escape-hatch';
  // Hand-overs from a stopped run come first: an agent gave the order back to a person.
  const triageCards = openCards
    .filter((c) => c.kind === 'TRIAGE' && !busyOrders.has(c.orderId))
    .sort((a, b) => Number(isHandover(b)) - Number(isHandover(a)) || byDecideBy(a, b));
  const decisionRunIds = new Set(decisionCards.map((c) => c.runId));
  const agentRuns = activeRuns.filter(
    (run) => run.status !== 'AWAITING_DECISION' && !decisionRunIds.has(run.id)
  );

  const orderIds = [
    ...new Set(
      [...openCards, ...recentCards].map((c) => c.orderId).concat(activeRuns.map((r) => r.orderId))
    ),
  ].filter((id): id is string => !!id);
  const recentRunIds = recentCards.map((c) => c.runId).filter((id): id is string => !!id);
  const [orders, sources, handOvers] = await Promise.all([
    orderSummaries({ ids: orderIds }),
    triageSources(triageCards),
    prisma.card.findMany({
      where: { kind: 'TRIAGE', runId: { in: recentRunIds } },
      select: { runId: true },
    }),
  ]);
  const handedOver = new Set(handOvers.map((c) => c.runId));
  const orderOf = (id: string | null) => (id ? (orders.get(id) ?? null) : null);

  const decisions: DecisionRow[] = decisionCards.map((card) => {
    const options = parseOptions(card.options, { now });
    const recommended =
      options.items.find((o) => o.recommended) ??
      options.items.find((o) => o.id === options.recommendation?.optionId);
    return {
      id: card.id,
      order: orderOf(card.orderId),
      playbook: playbookMeta(card.playbookId),
      title: decisionTitle({ title: card.title, summary: card.summary, now }).title,
      decideBy: card.decideBy?.toISOString() ?? null,
      ...splitDecideBy({ reason: card.decideByReason, decideBy: card.decideBy }),
      optionCount: options.items.length,
      recommended: recommended ? `${recommended.id}. ${recommended.label}` : null,
    };
  });

  const triage: TriageRow[] = triageCards.map((card) => {
    const source = sources.get(card.id);
    const speaker = source?.message
      ? speakerWord(source.message.authorType)
      : source?.inbox
        ? 'Support inbox'
        : null;
    const body = source?.message?.body ?? source?.inbox?.body ?? null;
    const handover = isHandover(card);
    return {
      id: card.id,
      order: orderOf(card.orderId),
      handover,
      title: triageTitle({ card, triggerType: source?.signal?.triggerType ?? null }),
      speaker: handover ? 'Agent' : speaker,
      quote: handover
        ? clip(plainText(card.summary.split(/\n|\\n/)[0] ?? '', now), 160)
        : body
          ? clip(body, 160)
          : null,
      decideBy: card.decideBy?.toISOString() ?? null,
      ...splitDecideBy({ reason: card.decideByReason, decideBy: card.decideBy }),
    };
  });

  const agents: AgentRow[] = agentRuns.map((run) => ({
    runId: run.id,
    order: orderOf(run.orderId),
    playbook: playbookMeta(run.playbookId),
    step: describeCurrentStep({ run, blockRun: latestBlock(run) }),
    status: RUN_STATUS_WORDS[run.status] ?? run.status,
    since: (run.simStartedAt ?? simTimeOf({ real: run.createdAt, clock })).toISOString(),
  }));

  const recent: RecentRow[] = recentCards.map((card) => {
    const title = decisionTitle({ title: card.title, summary: card.summary, now }).title;
    const decision = (card.decision ?? {}) as { action?: string; optionId?: string };
    const verb =
      {
        APPROVED: 'Approved',
        EDITED: 'Approved with changes',
        REJECTED: 'Rejected',
        EXPIRED: 'Expired, nobody decided',
      }[card.status as string] ?? card.status.charAt(0) + card.status.slice(1).toLowerCase();
    const run = card.run;
    const block = run ? latestBlock(run) : null;
    const stopped = run?.status === 'ESCALATED' || run?.status === 'FAILED';
    const next = !run
      ? 'No run attached'
      : stopped
        ? handedOver.has(run.id)
          ? 'Handed to a person'
          : 'Stopped; no hand-over card yet'
        : run.status === 'CLOSED'
          ? (RUN_STATUS_WORDS[run.status] ?? run.status)
          : describeCurrentStep({ run, blockRun: block });
    return {
      id: card.id,
      order: orderOf(card.orderId),
      title,
      outcome: `${verb}${decision.optionId && card.status !== 'REJECTED' && card.status !== 'EXPIRED' ? ` option ${decision.optionId}` : ''}${card.decidedBy ? ` by ${actorWords(card.decidedBy)}` : ''}`,
      tone:
        card.status === 'REJECTED' || card.status === 'EXPIRED' || stopped
          ? 'danger'
          : run?.status === 'CLOSED'
            ? 'ok'
            : 'neutral',
      next,
      decidedAt: card.decidedAt
        ? asSimTime({ at: card.decidedAt, clock, run }).toISOString()
        : null,
    };
  });

  const activeOrders = orderStates.filter((o) => !CLOSED_ORDER_STATUSES.includes(o.status));
  const touched = new Set(
    [...decisionCards, ...triageCards]
      .map((c) => c.orderId)
      .concat(activeRuns.map((r) => r.orderId))
  );
  const quiet = activeOrders.filter((o) => !touched.has(o.id)).length;

  return {
    clock,
    now,
    decisions,
    triage,
    agents,
    recent,
    counts: {
      decisions: decisions.length,
      agents: agents.length,
      triage: triage.length,
      quiet,
      active: activeOrders.length,
    },
    watchman: {
      lastSignalAt: lastSignal?.simAt.toISOString() ?? null,
      signalsLastHour,
      ordersWatched: activeOrders.length,
    },
  };
}
