// One order: route with windows, open card, a merged timeline with sources, facts by level, run traces.

import type { IconName } from '@/components/ui/Icon';
import type { TimelineKind } from '@/components/ui/Timeline';
import { getOrderBundle } from '@/lib/bahn';
import { blockSummary, type StepView } from '@/lib/control-room/card';
import { describeEvent } from '@/lib/control-room/events';
import { toFactView, toolWords } from '@/lib/control-room/facts';
import {
  formatDay,
  formatWindow,
  humanize,
  sentenceCase,
  splitDecideBy,
  stripOrderRef,
} from '@/lib/control-room/format';
import { orderStatusLabel } from '@/lib/control-room/orders';
import {
  blockMeta,
  type PlaybookMeta,
  playbookMeta,
  RUN_STATUS_WORDS,
} from '@/lib/control-room/playbooks';
import { decisionTitle, speakerWord } from '@/lib/control-room/text';
import { asSimTime, loadNow, type Now, simTimeOf } from '@/lib/control-room/time';
import type { FactView } from '@/lib/control-room/types';
import { listOrderFacts } from '@/lib/facts';
import type { EvidenceLevel, Fact } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prismaClient';
import { actorWords, plainText } from '@/lib/text';
import { TRIGGERS } from '@/lib/watchman/taxonomy';

export type RouteStop = {
  role: 'Pickup' | 'Transfer' | 'Delivery';
  city: string | null;
  place: string | null;
  window: string | null;
  windowSource: string | null;
  factId: string | null;
};

export type RouteLeg = {
  mode: string;
  distance: string | null;
  crossings: { text: string; factId: string | null }[];
};

export type TimelineEntry = {
  id: string;
  at: string;
  day: string;
  kind: TimelineKind;
  icon?: IconName;
  speaker: string;
  role: string | null;
  text: string;
  quote: boolean;
  factIds: string[];
  chip: string | null;
  href: string | null;
};

export type RunTraceView = {
  id: string;
  playbook: PlaybookMeta;
  status: string;
  statusWords: string;
  startedAt: string;
  cardId: string | null;
  steps: StepView[];
};

export type OpenCardLink = {
  id: string;
  kind: 'DECISION' | 'TRIAGE';
  title: string;
  decideBy: string | null;
  until: string | undefined;
  reason: string | undefined;
};

export type OrderPage = Now & {
  order: {
    id: string;
    ref: string;
    status: string;
    statusLabel: string;
    car: string | null;
    plate: string | null;
    customer: string | null;
    customerTier: string | null;
    route: string | null;
  };
  openCards: OpenCardLink[];
  stops: RouteStop[];
  legs: RouteLeg[];
  timeline: TimelineEntry[];
  factsByLevel: { level: EvidenceLevel; facts: FactView[] }[];
  facts: Record<string, FactView>;
  runs: RunTraceView[];
};

const LEVEL_ORDER: EvidenceLevel[] = [
  'VERIFIED',
  'OBSERVED',
  'BOOKED',
  'PLANNED',
  'QUOTED',
  'STATED',
  'REQUESTED',
];

const WINDOW_SOURCE: Record<string, string> = {
  CUSTOMER: 'agreed with the customer',
  OPS: 'set by Bahn ops',
  SYSTEM: 'set by the system',
  SITE: 'given by the site',
};

const AUTHOR_KIND: Record<string, TimelineKind> = {
  driver: 'driver',
  customer: 'customer',
  site_contact: 'site',
  handoff_contact: 'customer',
  operator: 'operator',
  agent: 'agent',
};

const MODE_WORDS: Record<string, string> = {
  DRIVE: 'Drive',
  DRIVE_WITH_FERRY: 'Drive with a ferry crossing',
};

export async function getOrderPage(args: { ref: string }): Promise<OrderPage | null> {
  const { clock, now } = await loadNow();
  const bundle = await getOrderBundle({ ref: args.ref });
  if (!bundle) return null;
  const orderId = bundle.order.id;
  const [factRows, cards, runs, signals] = await Promise.all([
    listOrderFacts({ orderId }),
    prisma.card.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    prisma.playbookRun.findMany({
      where: { orderId },
      include: { blockRuns: { orderBy: { startedAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.signal.findMany({ where: { orderId, simAt: { lte: now } }, orderBy: { simAt: 'asc' } }),
  ]);
  const visibleFacts = factRows.filter((fact) => fact.observedAt <= now);
  const factBySource = new Map<string, Fact>();
  for (const fact of visibleFacts)
    if (!factBySource.has(fact.sourceRef)) factBySource.set(fact.sourceRef, fact);
  const facts = Object.fromEntries(
    visibleFacts.map((fact) => [fact.id, toFactView({ fact, now })])
  );

  // Route strip
  const addressById = new Map(bundle.addresses.map((a) => [a.id, a]));
  const siteById = new Map(bundle.sites.map((s) => [s.id, s]));
  const plan = bundle.activePlan ?? bundle.plans.at(-1) ?? null;
  const pickWindow = (purposes: string[]) => {
    const rows = bundle.timeWindows.filter((w) => purposes.includes(w.purpose));
    return rows.find((w) => w.isSelected) ?? rows.at(-1) ?? null;
  };
  const windowFor = (role: string) =>
    role === 'PICKUP'
      ? pickWindow(['SELECTED_PICKUP_SLOT'])
      : role === 'DELIVERY'
        ? (pickWindow(['SELECTED_DELIVERY_SLOT']) ?? pickWindow(['CUSTOMER_DELIVERY_PROMISE']))
        : null;
  const pointRows = plan?.points.length
    ? plan.points
    : [
        {
          role: 'PICKUP',
          addressId: bundle.order.pickupAddressId,
          siteId: bundle.order.pickupSiteId,
          id: 'pickup',
        },
        {
          role: 'DELIVERY',
          addressId: bundle.order.deliveryAddressId,
          siteId: bundle.order.deliverySiteId,
          id: 'delivery',
        },
      ];
  const stops: RouteStop[] = pointRows.map((point) => {
    const address = addressById.get(point.addressId);
    const site = point.siteId ? siteById.get(point.siteId) : undefined;
    const window = windowFor(point.role);
    const fact = window ? factBySource.get(`bahn.time_windows:${window.id}`) : undefined;
    return {
      role:
        point.role === 'PICKUP' ? 'Pickup' : point.role === 'DELIVERY' ? 'Delivery' : 'Transfer',
      city: address?.city ?? site?.city ?? null,
      place: site?.name ?? address?.name ?? null,
      window: window
        ? formatWindow({ startAt: window.startAt, endAt: window.endAt, timeZone: window.timezone })
        : null,
      windowSource: window
        ? `${humanize(window.purpose).replace(/^Customer delivery promise$/, 'Promise')}, ${WINDOW_SOURCE[window.source] ?? humanize(window.source).toLowerCase()}`
        : null,
      factId: fact?.id ?? null,
    };
  });
  const ferryFacts = visibleFacts.filter((f) => f.kind === 'FERRY_BOOKING');
  const legs: RouteLeg[] = (plan?.segments ?? []).map((segment) => ({
    mode: MODE_WORDS[segment.transportMode] ?? humanize(segment.transportMode),
    distance: segment.distanceKm ? `${segment.distanceKm.toLocaleString('en-GB')} km` : null,
    crossings:
      segment.transportMode === 'DRIVE_WITH_FERRY'
        ? ferryFacts.map((fact) => ({ text: plainText(fact.statement, now), factId: fact.id }))
        : [],
  }));

  // Timeline
  const entries: TimelineEntry[] = [];
  const push = (entry: Omit<TimelineEntry, 'day' | 'at'> & { at: Date }) =>
    entries.push({ ...entry, at: entry.at.toISOString(), day: formatDay({ at: entry.at }) });
  const driverById = new Map(
    bundle.assignments.flatMap((a) => (a.driver ? [[a.driver.id, a.driver.displayName]] : []))
  );
  const pointName = (id: string | null | undefined) => {
    const point = bundle.plans.flatMap((p) => p.points).find((p) => p.id === id);
    if (!point) return null;
    const site = point.siteId ? siteById.get(point.siteId) : undefined;
    const address = addressById.get(point.addressId);
    return site ? `${site.name}, ${site.city}` : address ? address.city : null;
  };

  const authorName = (message: {
    authorNameSnapshot: string | null;
    authorType: string;
    authorId: string;
  }) =>
    message.authorNameSnapshot ??
    (message.authorType === 'driver'
      ? (driverById.get(message.authorId) ?? null)
      : message.authorType === 'customer'
        ? (bundle.customer?.name ?? null)
        : message.authorType === 'operator' || message.authorType === 'agent'
          ? humanize(message.authorId)
          : null);
  for (const conversation of bundle.conversations) {
    for (const message of conversation.messages) {
      if (message.authoredAt > now) continue;
      const fact = factBySource.get(`bahn.messages:${message.id}`);
      const kind = AUTHOR_KIND[message.authorType] ?? 'system';
      push({
        id: `msg:${message.id}`,
        at: message.authoredAt,
        kind,
        speaker: authorName(message) ?? speakerWord(message.authorType),
        role: authorName(message)
          ? `${speakerWord(message.authorType)} · ${humanize(message.channel).toLowerCase()}`
          : humanize(message.channel).toLowerCase(),
        text: message.body,
        quote: kind !== 'operator' && kind !== 'agent',
        factIds: fact ? [fact.id] : [],
        chip: fact ? null : 'Bahn message',
        href: null,
      });
    }
  }
  for (const thread of bundle.supportThreads) {
    for (const message of thread.messages) {
      if (message.authoredAt > now) continue;
      const fact = factBySource.get(`bahn.support_inbox_messages:${message.id}`);
      push({
        id: `inbox:${message.id}`,
        at: message.authoredAt,
        kind: 'customer',
        speaker: 'Support inbox',
        role: null,
        text: message.body,
        quote: true,
        factIds: fact ? [fact.id] : [],
        chip: fact ? null : 'Support inbox',
        href: null,
      });
    }
  }
  for (const event of bundle.events) {
    if (event.recordedAt > now) continue;
    const sentence = describeEvent({
      event,
      names: {
        driver: (id) => (id ? (driverById.get(id) ?? null) : null),
        point: pointName,
        actor: ({ id, type }) =>
          type === 'driver'
            ? (driverById.get(id ?? '') ?? 'Driver')
            : type === 'customer'
              ? (bundle.customer?.name ?? 'Customer')
              : type === 'system'
                ? null
                : id
                  ? humanize(id)
                  : humanize(type),
      },
    });
    const fact = factBySource.get(`bahn.operational_events:${event.id}`);
    push({
      id: `evt:${event.id}`,
      at: event.recordedAt,
      kind:
        event.actorType === 'driver'
          ? 'driver'
          : event.actorType === 'operator'
            ? 'operator'
            : 'system',
      speaker: sentence.actor ?? 'Bahn system',
      role: null,
      text: sentence.text,
      quote: false,
      factIds: fact ? [fact.id] : [],
      chip: fact ? null : 'Bahn event log',
      href: null,
    });
  }
  for (const signal of signals) {
    const routing = (signal.routing ?? {}) as {
      action?: string;
      playbooks?: { playbookId?: string }[];
      card?: { cardId?: string };
    };
    const trigger = signal.triggerType
      ? (TRIGGERS as Record<string, { label: string } | undefined>)[signal.triggerType]?.label
      : null;
    const what =
      routing.action === 'playbook'
        ? `Sent to the agent: ${(routing.playbooks ?? []).map((p) => playbookMeta(p.playbookId).title).join(', ') || 'playbook'}.`
        : routing.action === 'triage'
          ? 'No playbook covers it; put it in front of a person.'
          : 'Recorded; nothing to do.';
    push({
      id: `sig:${signal.id}`,
      at: signal.simAt,
      kind: 'system',
      icon: 'shield',
      speaker: 'Watchman',
      role: signal.source === 'monitor' ? 'time check' : `read the ${signal.source}`,
      text: `${trigger ?? 'Checked'}. ${what}`,
      quote: false,
      factIds: [],
      chip: null,
      href: routing.card?.cardId ? `/cards/${routing.card.cardId}` : null,
    });
  }
  const runById = new Map(runs.map((r) => [r.id, r]));
  const citedFactIds = new Set<string>();
  for (const card of cards) {
    const run = card.runId ? runById.get(card.runId) : undefined;
    const createdAt =
      card.kind === 'TRIAGE'
        ? (() => {
            const first = Array.isArray(card.agentActions)
              ? (card.agentActions[0] as { at?: string } | undefined)
              : undefined;
            return first?.at ? new Date(first.at) : simTimeOf({ real: card.createdAt, clock, run });
          })()
        : simTimeOf({ real: card.createdAt, clock, run });
    const calls = (Array.isArray(card.agentActions) ? card.agentActions : []) as {
      blockId?: string;
      tool?: string;
      summary?: string;
      factIds?: string[];
    }[];
    for (const [index, call] of calls.entries()) {
      if (!call.tool || !call.blockId) continue;
      const block = run?.blockRuns.find((b) => b.blockId === call.blockId);
      const ids = (call.factIds ?? []).filter((id) => facts[id]);
      ids.forEach((id) => citedFactIds.add(id));
      push({
        id: `call:${card.id}:${index}`,
        at: block ? simTimeOf({ real: block.startedAt, clock, run }) : createdAt,
        kind: 'agent',
        speaker: 'Agent',
        role: toolWords(call.tool),
        text: plainText(call.summary ?? toolWords(call.tool), now),
        quote: false,
        factIds: ids.slice(0, 2),
        chip: ids.length ? null : 'Agent tool',
        href: null,
      });
    }
    push({
      id: `card:${card.id}`,
      at: createdAt,
      kind: card.kind === 'TRIAGE' ? 'system' : 'agent',
      icon: card.kind === 'TRIAGE' ? 'inbox' : 'flag',
      speaker: card.kind === 'TRIAGE' ? 'Watchman' : 'Agent',
      role: card.kind === 'TRIAGE' ? 'asked a person to look' : 'brought a decision',
      text:
        card.kind === 'DECISION'
          ? decisionTitle({ title: card.title, summary: card.summary, now }).title
          : stripOrderRef(card.title),
      quote: false,
      factIds: [],
      chip: null,
      href: `/cards/${card.id}`,
    });
    if (card.status !== 'OPEN' && card.decidedAt) {
      const decision = (card.decision ?? {}) as {
        action?: string;
        optionId?: string;
        note?: string;
      };
      const verb =
        {
          APPROVED: 'approved',
          EDITED: 'approved with changes',
          REJECTED: 'rejected',
          CANCELLED: 'closed',
          EXPIRED: 'let expire',
        }[card.status as string] ?? card.status.toLowerCase();
      const decisionFact = visibleFacts.find(
        (f) => f.kind === 'OPERATOR_DECISION' && f.sourceRef === `card:${card.id}`
      );
      if (decisionFact) citedFactIds.add(decisionFact.id);
      push({
        id: `decision:${card.id}`,
        at: decisionFact?.observedAt ?? asSimTime({ at: card.decidedAt, clock, run }),
        kind: 'operator',
        speaker: sentenceCase(actorWords(card.decidedBy) ?? 'the dispatcher'),
        role: 'decided',
        text: `${verb.charAt(0).toUpperCase()}${verb.slice(1)}${decision.optionId && card.status !== 'REJECTED' ? ` option ${decision.optionId}` : ''}${decision.note ? `: “${decision.note}”` : '.'}`,
        quote: false,
        factIds: decisionFact ? [decisionFact.id] : [],
        chip: decisionFact ? null : 'Card decision',
        href: `/cards/${card.id}`,
      });
    }
  }
  for (const run of runs) {
    for (const block of run.blockRuns) {
      if (block.kind === 'human') continue;
      const summary = blockSummary(block, now);
      if (block.kind !== 'agent' && block.kind !== 'execute' && !summary) continue;
      const meta = blockMeta({ playbookId: run.playbookId, blockId: block.blockId });
      push({
        id: `block:${block.id}`,
        at: simTimeOf({ real: block.startedAt, clock, run }),
        kind: 'agent',
        speaker: 'Agent',
        role: meta.title,
        text: summary ?? (meta.description ? plainText(meta.description, now) : meta.title),
        quote: false,
        factIds: [],
        chip: null,
        href: null,
      });
    }
  }
  for (const fact of visibleFacts) {
    if (fact.sourceType === 'BAHN_RECORD' || citedFactIds.has(fact.id)) continue;
    if (fact.kind === 'OPERATOR_DECISION') continue;
    push({
      id: `fact:${fact.id}`,
      at: fact.observedAt,
      kind: fact.sourceType === 'OPERATOR' ? 'operator' : 'agent',
      speaker: fact.sourceType === 'OPERATOR' ? 'Dispatcher' : 'Agent tool',
      role: facts[fact.id]?.kindLabel ?? null,
      text: facts[fact.id]?.statement ?? plainText(fact.statement, now),
      quote: false,
      factIds: [fact.id],
      chip: null,
      href: null,
    });
  }
  entries.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  const factsByLevel = LEVEL_ORDER.map((level) => ({
    level,
    facts: visibleFacts
      .filter((fact) => fact.level === level)
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
      .map((fact) => facts[fact.id]),
  })).filter((group) => group.facts.length > 0);

  const runViews: RunTraceView[] = runs.map((run) => ({
    id: run.id,
    playbook: playbookMeta(run.playbookId),
    status: run.status,
    statusWords: RUN_STATUS_WORDS[run.status] ?? run.status,
    startedAt: (run.simStartedAt ?? simTimeOf({ real: run.createdAt, clock })).toISOString(),
    cardId: cards.find((c) => c.runId === run.id && c.kind === 'DECISION')?.id ?? null,
    steps: run.blockRuns.map((block) => {
      const meta = blockMeta({ playbookId: run.playbookId, blockId: block.blockId });
      return {
        id: block.id,
        blockId: block.blockId,
        title: meta.title,
        kind: block.kind,
        status: block.status,
        at: simTimeOf({ real: block.startedAt, clock, run }).toISOString(),
        summary: blockSummary(block, now),
        model: block.model,
        costUsd: block.costUsd,
        durationMs: block.durationMs,
        calls: [],
        callsKnown: false,
      };
    }),
  }));

  const vehicle =
    bundle.items.find((item) => item.role === 'PRIMARY')?.vehicle ?? bundle.items[0]?.vehicle;
  const from = addressById.get(bundle.order.pickupAddressId)?.city ?? null;
  const to = addressById.get(bundle.order.deliveryAddressId)?.city ?? null;
  const openCards: OpenCardLink[] = cards
    .filter((card) => card.status === 'OPEN')
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'DECISION' ? -1 : 1))
    .map((card) => ({
      id: card.id,
      kind: card.kind,
      title:
        card.kind === 'DECISION'
          ? decisionTitle({ title: card.title, summary: card.summary, now }).title
          : stripOrderRef(card.title),
      decideBy: card.decideBy?.toISOString() ?? null,
      ...splitDecideBy({ reason: card.decideByReason, decideBy: card.decideBy }),
    }));

  return {
    clock,
    now,
    order: {
      id: orderId,
      ref: bundle.order.reference,
      status: bundle.order.status,
      statusLabel: orderStatusLabel(bundle.order.status),
      car: vehicle ? `${vehicle.make} ${vehicle.model}` : null,
      plate: vehicle?.registration ?? null,
      customer: bundle.customer?.name ?? null,
      customerTier: bundle.customer?.accountTier
        ? humanize(bundle.customer.accountTier).toLowerCase()
        : null,
      route: from && to ? `${from} → ${to}` : null,
    },
    openCards,
    stops,
    legs,
    timeline: entries,
    factsByLevel,
    facts,
    runs: runViews,
  };
}
