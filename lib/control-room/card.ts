// One card with everything its page shows: order, options, the agent's work, facts and what happens next.

import { toFactView, toolWords } from '@/lib/control-room/facts';
import { cleanAgentText, clip, splitDecideBy } from '@/lib/control-room/format';
import { triageSources } from '@/lib/control-room/home';
import { type OptionsView, parseOptions } from '@/lib/control-room/options';
import { orderSummaries, type OrderSummary } from '@/lib/control-room/orders';
import {
  blockMeta,
  describeCurrentStep,
  type PlaybookMeta,
  playbookMeta,
  RUN_STATUS_WORDS,
} from '@/lib/control-room/playbooks';
import { decisionTitle, speakerWord, triageTitle } from '@/lib/control-room/text';
import { asSimTime, loadNow, type Now, simTimeOf } from '@/lib/control-room/time';
import type { FactView } from '@/lib/control-room/types';
import { getFacts, listOrderFacts } from '@/lib/facts';
import type { BlockRun, Fact, Prisma } from '@/lib/generated/prisma/client';
import { describeCatches, type GateStepOutput } from '@/lib/playbooks/blocks/gate';
import { HANDOVER_ACTOR } from '@/lib/playbooks/cards';
import { prisma } from '@/lib/prismaClient';
import { TRIGGERS } from '@/lib/watchman/taxonomy';

type CardWithRun = Prisma.CardGetPayload<{ include: { run: { include: { blockRuns: true } } } }>;

export type ToolCallView = {
  words: string;
  summary: string;
  factIds: string[];
  isError: boolean;
};

export type StepView = {
  id: string;
  blockId: string;
  title: string;
  kind: string;
  status: string;
  at: string | null;
  summary: string | null;
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
  calls: ToolCallView[];
  // False where tool calls were not loaded (order page traces), so "no lookups" is never claimed there.
  callsKnown: boolean;
};

export type EffectView = { statement: string; status: string; factIds: string[] };

export type DecisionView = {
  action: string;
  optionId: string | null;
  note: string | null;
  editedMessages: number;
  removedActions: number;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type TriageView = {
  speaker: string | null;
  speakerName: string | null;
  at: string | null;
  channel: string | null;
  body: string | null;
  messageFactId: string | null;
  labels: { label: string; likelihood: string }[];
  why: string | null;
  watchmanAt: string | null;
};

export type CardPage = Now & {
  card: {
    id: string;
    kind: 'DECISION' | 'TRIAGE';
    status: string;
    title: string;
    summaryLines: string[];
    decideBy: string | null;
    until: string | undefined;
    reason: string | undefined;
    createdAt: string;
    hasToken: boolean;
  };
  order: OrderSummary | null;
  playbook: PlaybookMeta;
  options: OptionsView;
  facts: Record<string, FactView>;
  cardFactIds: string[];
  steps: StepView[];
  decision: DecisionView | null;
  next: {
    runStatus: string;
    statusWords: string;
    current: string | null;
    steps: StepView[];
    effects: EffectView[];
    finished: boolean;
    // Why the run refused to carry out the decision (a blocked option, an edit it cannot carry out).
    refused: string | null;
    // The "worth a look" card the run opened when it handed over.
    handOverCardId: string | null;
  } | null;
  triage: TriageView | null;
  // Set on a TRIAGE card a playbook run opened when it stopped (failure, reject, expiry, refusal).
  handover: {
    reason: string;
    playbookTitle: string;
    runStatusWords: string | null;
    decisionCardIds: string[];
  } | null;
};

type PlaybookAction = {
  blockId?: unknown;
  blockRunId?: unknown;
  tool?: unknown;
  summary?: unknown;
  factIds?: unknown;
  isError?: unknown;
};

const strs = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

function likelihood(p: number): string {
  if (p >= 0.9) return 'very likely';
  if (p >= 0.7) return 'likely';
  return 'possible';
}

export function blockSummary(block: BlockRun, now?: Date): string | null {
  const summary = rawBlockSummary(block);
  return summary === null ? null : cleanAgentText(summary, now);
}

function rawBlockSummary(block: BlockRun): string | null {
  const output = (block.output ?? null) as Record<string, unknown> | null;
  if (block.status === 'FAILED')
    return block.error ? clip(block.error, 220) : 'Stopped with an error.';
  // What an agent did comes only from its recorded tool calls, never from its own prose.
  if (!output || block.kind === 'agent') return null;
  if (block.blockId === 'check' || block.kind === 'deterministic') {
    if (output.retried === true) {
      const caught = Array.isArray(output.caught) ? output.caught.length : null;
      return caught
        ? `The rules caught ${caught === 1 ? 'a problem' : `${caught} problems`} in the agent’s first draft and sent it back once (details below).`
        : 'The first answer broke a rule; the agent corrected it once.';
    }
    if (Array.isArray(output.firstPass)) return 'Every option passed the rules on the first draft.';
    const outcome = str(output.outcome) ?? str(output.note);
    return outcome && outcome.includes(' ') ? outcome : null;
  }
  return str(output.outcome) ?? str(output.note) ?? null;
}

const KEY_KINDS = [
  'PROMISE_WINDOW',
  'HARD_DEADLINE',
  'SLOT_WINDOW',
  'DRIVER_ASSIGNED',
  'FERRY_BOOKING',
  'TRAVEL_BOOKING',
  'HOTEL_BOOKING',
  'PICKUP_EVENT',
  'DELIVERY_EVENT',
  'BOOKING_OUTCOME_UNKNOWN',
  'ALERT',
  'INCIDENT',
  'WORK_ITEM',
  'ENDPOINT_CONTACT',
  'ENDPOINT_ACCESS',
];
const STATEMENT_KINDS = new Set([
  'DRIVER_STATEMENT',
  'CUSTOMER_STATEMENT',
  'SITE_STATEMENT',
  'HANDOFF_STATEMENT',
  'OPERATOR_MESSAGE',
  'INBOX_MESSAGE',
]);

/** A short, useful slice of an order's facts: commitments and bookings first, then the latest statements. */
function keyFacts(args: { facts: Fact[] }): Fact[] {
  const { facts } = args;
  const key = KEY_KINDS.flatMap((kind) =>
    facts
      .filter((fact) => fact.kind === kind)
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
      .slice(0, kind.startsWith('ENDPOINT') ? 2 : 1)
  );
  const statements = facts
    .filter((fact) => STATEMENT_KINDS.has(fact.kind))
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
    .slice(0, 3);
  return [...key, ...statements].slice(0, 12);
}

export async function getCardPage(args: { id: string }): Promise<CardPage | null> {
  const { id } = args;
  const { clock, now } = await loadNow();
  const card: CardWithRun | null = await prisma.card.findUnique({
    where: { id },
    include: { run: { include: { blockRuns: { orderBy: { startedAt: 'asc' } } } } },
  });
  if (!card) return null;
  const run = card.run;
  // Directed offers and roadside orders run on a yes only when they cite a backup-driver or roadside result.
  const quoteIds = JSON.stringify(card.options ?? null).match(/"quoteFactId":"([^"]+)"/g) ?? [];
  const simulatedFacts = await prisma.fact.findMany({
    where: {
      id: { in: quoteIds.map((match) => match.slice(15, -1)) },
      OR: [
        { sourceRef: { startsWith: 'tool:find_backup_drivers:' } },
        { sourceRef: { startsWith: 'tool:find_roadside:' } },
      ],
    },
    select: { id: true },
  });
  const options = parseOptions(card.options, {
    simulatedFactIds: new Set(simulatedFacts.map((fact) => fact.id)),
    now,
  });
  const playbook = playbookMeta(
    card.kind === 'TRIAGE' && !card.playbookId ? 'escape-hatch' : card.playbookId
  );

  // A hand-over card carries no tool calls itself; its run's latest decision card does.
  const runDecision =
    card.kind === 'TRIAGE' && card.runId
      ? await prisma.card.findFirst({
          where: { runId: card.runId, kind: 'DECISION' },
          orderBy: { createdAt: 'desc' },
          select: { agentActions: true },
        })
      : null;
  const ownCalls = Array.isArray(card.agentActions)
    ? card.agentActions.some((a) => typeof (a as { tool?: unknown } | null)?.tool === 'string')
    : false;
  const callSource = ownCalls
    ? card.agentActions
    : (runDecision?.agentActions ?? card.agentActions);
  const callsKnown = card.kind === 'DECISION' || !card.runId || ownCalls || !!runDecision;
  const actions = (Array.isArray(callSource) ? callSource : []) as PlaybookAction[];
  const callsByBlock = new Map<string, ToolCallView[]>();
  for (const action of actions) {
    // Keyed by block run when recorded (a gate re-ask runs the block twice), else by block id (older cards).
    const blockId = str(action.blockRunId) ?? str(action.blockId);
    const tool = str(action.tool);
    if (!blockId || !tool) continue;
    callsByBlock.set(blockId, [
      ...(callsByBlock.get(blockId) ?? []),
      {
        words: toolWords(tool),
        summary: cleanAgentText(str(action.summary) ?? toolWords(tool), now),
        factIds: strs(action.factIds),
        isError: action.isError === true,
      },
    ]);
  }

  const blockRuns = run?.blockRuns ?? [];
  const toStep = (block: BlockRun): StepView => {
    const meta = blockMeta({
      playbookId: run?.playbookId ?? card.playbookId ?? '',
      blockId: block.blockId,
    });
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
      calls: callsByBlock.get(block.id) ?? callsByBlock.get(block.blockId) ?? [],
      callsKnown,
    };
  };
  const humanIndex = blockRuns.findIndex(
    (b) => b.kind === 'human' && (b.input as { cardId?: string } | null)?.cardId === card.id
  );
  const cut =
    humanIndex >= 0
      ? humanIndex
      : card.blockId
        ? blockRuns.findIndex((b) => b.blockId === card.blockId)
        : -1;
  const before = cut >= 0 ? blockRuns.slice(0, cut) : blockRuns.filter((b) => b.kind !== 'human');
  // What followed this card, up to the next card the run opened (that card owns its own effects).
  const nextHuman = cut >= 0 ? blockRuns.findIndex((b, i) => i > cut && b.kind === 'human') : -1;
  const after = cut >= 0 ? blockRuns.slice(cut + 1, nextHuman >= 0 ? nextHuman : undefined) : [];
  // The options agent's situation usually is the card summary; do not print it twice.
  const norm = (text: string) =>
    cleanAgentText(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  const cardText = norm(card.summary);
  const steps = before
    .map(toStep)
    .map((step) =>
      step.summary && norm(step.summary) === cardText ? { ...step, summary: null } : step
    );

  const effects: EffectView[] = after.flatMap((block) => {
    const output = (block.output ?? null) as { effects?: unknown } | null;
    if (block.kind !== 'execute' || !Array.isArray(output?.effects)) return [];
    return (output.effects as Record<string, unknown>[]).map((effect) => ({
      statement: cleanAgentText(str(effect.statement) ?? 'Done.', now),
      status: str(effect.status) ?? 'DONE',
      factIds: strs(effect.factIds),
    }));
  });

  const decisionJson = (card.decision ?? null) as Record<string, unknown> | null;
  const edits = (decisionJson?.edits ?? null) as Record<string, unknown> | null;
  const decision: DecisionView | null =
    card.status !== 'OPEN' && decisionJson
      ? {
          action: str(decisionJson.action) ?? card.status.toLowerCase(),
          optionId: str(decisionJson.optionId),
          note: str(decisionJson.note),
          editedMessages:
            edits?.messages && typeof edits.messages === 'object'
              ? Object.keys(edits.messages).length
              : 0,
          removedActions: strs(edits?.removeActionIds).length,
          decidedBy: card.decidedBy ?? str(decisionJson.decidedBy),
          decidedAt: card.decidedAt
            ? asSimTime({ at: card.decidedAt, clock, run }).toISOString()
            : null,
        }
      : null;

  const runFinished = run ? ['CLOSED', 'ESCALATED', 'FAILED'].includes(run.status) : false;
  const runCards = run
    ? await prisma.card.findMany({
        where: { runId: run.id, id: { not: card.id } },
        select: { id: true, kind: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const refused =
    after
      .map((block) =>
        block.kind === 'execute' ? (block.output as { refused?: unknown } | null) : null
      )
      .map((output) => str(output?.refused))
      .map((text) => (text ? cleanAgentText(text, now) : null))
      .find(Boolean) ?? null;
  const next =
    run && card.status !== 'OPEN'
      ? {
          runStatus: run.status,
          statusWords: RUN_STATUS_WORDS[run.status] ?? run.status,
          current: runFinished
            ? null
            : describeCurrentStep({ run, blockRun: blockRuns.at(-1) ?? null }),
          steps: after.map(toStep),
          effects,
          finished: runFinished,
          refused,
          handOverCardId: runCards.find((c) => c.kind === 'TRIAGE')?.id ?? null,
        }
      : null;
  const firstAction = (Array.isArray(card.agentActions) ? card.agentActions[0] : null) as {
    actor?: unknown;
    reason?: unknown;
  } | null;
  const isHandover =
    card.kind === 'TRIAGE' &&
    (firstAction?.actor === HANDOVER_ACTOR ||
      (!!card.runId && !!card.playbookId && card.playbookId !== 'escape-hatch'));
  const handover = isHandover
    ? {
        reason: str(firstAction?.reason) ?? 'stopped',
        playbookTitle: playbook.title,
        runStatusWords: run ? (RUN_STATUS_WORDS[run.status] ?? run.status) : null,
        decisionCardIds: runCards.filter((c) => c.kind === 'DECISION').map((c) => c.id),
      }
    : null;
  // Older cards carry no plain-language catches; rebuild them from this card's own (latest) gate step.
  const storedCaught = (card.options as { caught?: unknown } | null)?.caught;
  if (card.kind === 'DECISION' && storedCaught === undefined) {
    const check = [...before]
      .reverse()
      .find((block) => block.blockId === 'check' && block.status === 'COMPLETED');
    const output = (check?.output ?? null) as Partial<GateStepOutput> | null;
    if (output?.retried && Array.isArray(output.firstPass) && Array.isArray(output.options))
      options.caught = Array.isArray(output.caught)
        ? output.caught
        : describeCatches({ firstPass: output.firstPass, final: output.options });
  }

  let triage: TriageView | null = null;
  let triggerType: string | null = null;
  if (card.kind === 'TRIAGE') {
    const source = (await triageSources([card])).get(card.id);
    const message = source?.message ?? null;
    const inbox = source?.inbox ?? null;
    const routing = (source?.signal?.routing ?? null) as {
      labels?: { p?: number; type?: string }[];
      reason?: string;
    } | null;
    const messageFact = message
      ? await prisma.fact.findFirst({ where: { sourceRef: `bahn.messages:${message.id}` } })
      : inbox
        ? await prisma.fact.findFirst({
            where: { sourceRef: `bahn.support_inbox_messages:${inbox.id}` },
          })
        : null;
    triggerType = source?.signal?.triggerType ?? null;
    const watchman = actions.find((a) => (a as { actor?: unknown }).actor === 'watchman') as
      { at?: unknown } | undefined;
    triage = {
      speaker: message ? speakerWord(message.authorType) : inbox ? 'Support inbox' : null,
      speakerName:
        message?.authorNameSnapshot ??
        (message?.authorType === 'driver'
          ? ((
              await prisma.bahnDriver.findUnique({
                where: { id: message.authorId },
                select: { displayName: true },
              })
            )?.displayName ?? null)
          : null),
      at: (message?.authoredAt ?? inbox?.authoredAt)?.toISOString() ?? null,
      channel: message?.channel ?? null,
      body: message?.body ?? inbox?.body ?? null,
      messageFactId: messageFact?.id ?? null,
      labels: (routing?.labels ?? [])
        .filter((l) => typeof l.type === 'string' && typeof l.p === 'number')
        .map((l) => ({
          label:
            (TRIGGERS as Record<string, { label: string } | undefined>)[l.type!]?.label ?? l.type!,
          likelihood: likelihood(l.p!),
        })),
      why: routing?.reason ? cleanAgentText(routing.reason, now) : null,
      watchmanAt: str(watchman?.at),
    };
  }

  // Older triage cards carry no fact ids; show the order's key facts instead.
  const gathered =
    card.kind === 'TRIAGE' && card.factIds.length === 0 && card.orderId
      ? keyFacts({ facts: await listOrderFacts({ orderId: card.orderId, observedBefore: now }) })
      : [];
  const cardFactIds = card.factIds.length ? card.factIds : gathered.map((fact) => fact.id);
  const factIds = [
    ...new Set([
      ...cardFactIds,
      ...options.items.flatMap((o) => [...o.factIds, ...o.actions.map((a) => a.quoteFactId ?? '')]),
      ...[...callsByBlock.values()].flat().flatMap((c) => c.factIds),
      ...effects.flatMap((e) => e.factIds),
      ...(triage?.messageFactId ? [triage.messageFactId] : []),
    ]),
  ].filter(Boolean);
  const facts = [
    ...gathered,
    ...(await getFacts({ ids: factIds.filter((fid) => !gathered.some((g) => g.id === fid)) })),
  ];
  const factViews = Object.fromEntries(facts.map((fact) => [fact.id, toFactView({ fact, now })]));

  const orders = card.orderId ? await orderSummaries({ ids: [card.orderId] }) : new Map();
  const decisionText = decisionTitle({ title: card.title, summary: card.summary, now });
  const title = card.kind === 'TRIAGE' ? triageTitle({ card, triggerType }) : decisionText.title;

  return {
    clock,
    now,
    card: {
      id: card.id,
      kind: card.kind,
      status: card.status,
      title,
      summaryLines:
        card.kind === 'DECISION'
          ? decisionText.lines
          : isHandover
            ? card.summary
                .split(/\n|\\n/)
                .map((line) => cleanAgentText(line.trim(), now))
                .filter(Boolean)
            : [],
      decideBy: card.decideBy?.toISOString() ?? null,
      ...splitDecideBy({ reason: card.decideByReason, decideBy: card.decideBy }),
      createdAt: simTimeOf({ real: card.createdAt, clock, run }).toISOString(),
      hasToken: !!card.waitpointTokenId,
    },
    order: card.orderId ? (orders.get(card.orderId) ?? null) : null,
    playbook,
    options,
    facts: factViews,
    cardFactIds: cardFactIds.filter((fid) => factViews[fid]),
    steps,
    decision,
    next,
    triage,
    handover,
  };
}
