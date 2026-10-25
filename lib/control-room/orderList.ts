// Every order with what is going on: needs a decision, agent working, worth a look, or quiet.

import { formatWindow, splitDecideBy } from '@/lib/control-room/format';
import { ACTIVE_RUN_STATUSES } from '@/lib/control-room/home';
import { orderSummaries, type OrderSummary } from '@/lib/control-room/orders';
import { playbookMeta } from '@/lib/control-room/playbooks';
import { loadNow, type Now } from '@/lib/control-room/time';
import { prisma } from '@/lib/prismaClient';

export const ORDER_FILTERS = ['all', 'decision', 'agent', 'look', 'quiet'] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export type OrderState = 'decision' | 'agent' | 'look' | 'quiet';

export type OrderRow = OrderSummary & {
  state: OrderState;
  stateNote: string | null;
  cardId: string | null;
  decideBy: string | null;
  until: string | undefined;
  reason: string | undefined;
  promise: string | null;
};

export type OrderList = Now & {
  rows: OrderRow[];
  counts: Record<OrderFilter, number>;
  total: number;
};

const STATE_RANK: Record<OrderState, number> = { decision: 0, agent: 1, look: 2, quiet: 3 };

export async function getOrderList(args: { q?: string; filter?: OrderFilter }): Promise<OrderList> {
  const { q, filter = 'all' } = args;
  const { clock, now } = await loadNow();
  const [summaries, cards, runs, promises] = await Promise.all([
    orderSummaries({}),
    prisma.card.findMany({ where: { status: 'OPEN' } }),
    prisma.playbookRun.findMany({ where: { status: { in: [...ACTIVE_RUN_STATUSES] } } }),
    prisma.bahnTimeWindow.findMany({
      where: { purpose: 'CUSTOMER_DELIVERY_PROMISE' },
      select: { orderId: true, startAt: true, endAt: true, timezone: true, isSelected: true },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  const promiseByOrder = new Map<string, (typeof promises)[number]>();
  for (const window of promises) {
    const current = promiseByOrder.get(window.orderId);
    if (!current || window.isSelected || !current.isSelected)
      promiseByOrder.set(window.orderId, window);
  }

  const all: OrderRow[] = [...summaries.values()].map((order) => {
    const decision = cards
      .filter((c) => c.orderId === order.id && c.kind === 'DECISION')
      .sort((a, b) => (a.decideBy?.getTime() ?? Infinity) - (b.decideBy?.getTime() ?? Infinity))[0];
    const run = runs.find((r) => r.orderId === order.id && r.status !== 'AWAITING_DECISION');
    const triage = cards.find((c) => c.orderId === order.id && c.kind === 'TRIAGE');
    const card = decision ?? (run ? undefined : triage);
    const state: OrderState = decision ? 'decision' : run ? 'agent' : triage ? 'look' : 'quiet';
    const promise = promiseByOrder.get(order.id);
    return {
      ...order,
      state,
      stateNote: decision
        ? 'Needs a decision'
        : run
          ? `Agent: ${playbookMeta(run.playbookId).title.toLowerCase()}`
          : triage
            ? 'Worth a look'
            : null,
      cardId: card?.id ?? null,
      decideBy: card?.decideBy?.toISOString() ?? null,
      ...(card
        ? splitDecideBy({ reason: card.decideByReason, decideBy: card.decideBy })
        : { until: undefined, reason: undefined }),
      promise: promise
        ? formatWindow({
            startAt: promise.startAt,
            endAt: promise.endAt,
            timeZone: promise.timezone,
          })
        : null,
    };
  });

  const needle = q?.trim().toLowerCase();
  const matches = needle
    ? all.filter((row) =>
        [row.ref, row.car, row.plate, row.customer, row.from, row.to, row.id]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle))
      )
    : all;
  const counts = {
    all: matches.length,
    decision: matches.filter((r) => r.state === 'decision').length,
    agent: matches.filter((r) => r.state === 'agent').length,
    look: matches.filter((r) => r.state === 'look').length,
    quiet: matches.filter((r) => r.state === 'quiet').length,
  };
  const rows = (filter === 'all' ? matches : matches.filter((r) => r.state === filter)).sort(
    (a, b) =>
      STATE_RANK[a.state] - STATE_RANK[b.state] ||
      (a.decideBy ?? '9999').localeCompare(b.decideBy ?? '9999') ||
      a.ref.localeCompare(b.ref)
  );
  return { clock, now, rows, counts, total: all.length };
}
