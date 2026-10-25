// Card writes: DECISION cards from human blocks and TRIAGE cards (escape hatch, failed preconditions, hand-overs).

import type { Card } from '@/lib/generated/prisma/client';
import { toJson } from '@/lib/playbooks/json';
import type { CardDraft, CardOptionsPayload, RunContext } from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';

/** The newest gate step's plain-language catches on this run (the gate step that built this card's options). */
function gateCatches(ctx: RunContext): string[] {
  const gateBlocks = ctx.playbook.blocks.filter((block) => block.status === 'OPTIONS_READY');
  for (const block of gateBlocks.reverse()) {
    const caught = (ctx.outputs[block.id] as { caught?: unknown } | undefined)?.caught;
    if (Array.isArray(caught))
      return caught.filter((line): line is string => typeof line === 'string');
  }
  return [];
}

export function clipLines(text: string, maxLines = 3): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n');
}

export async function createDecisionCard(args: {
  ctx: RunContext;
  blockId: string;
  draft: CardDraft;
}): Promise<Card> {
  const { ctx, blockId, draft } = args;
  const options: CardOptionsPayload = {
    ...draft.options,
    caught: draft.options.caught ?? gateCatches(ctx),
  };
  const card = await prisma.card.create({
    data: {
      kind: 'DECISION',
      status: 'OPEN',
      runId: ctx.run.id,
      orderId: ctx.orderId,
      playbookId: ctx.playbook.id,
      blockId,
      title: draft.title,
      summary: clipLines(draft.summary),
      agentActions: toJson(ctx.agentActions),
      factIds: [...new Set(draft.factIds)],
      options: toJson(options),
      decideBy: draft.decideBy ?? null,
      decideByReason: draft.decideByReason ?? null,
    },
  });
  // The watchman's open triage card for this order is now covered by this decision card.
  await prisma.card.updateMany({
    where: { orderId: ctx.orderId, kind: 'TRIAGE', status: 'OPEN', playbookId: 'escape-hatch' },
    data: { status: 'CANCELLED', decision: toJson({ foldedInto: card.id, by: ctx.playbook.id }) },
  });
  return card;
}

export async function createTriageCard(args: {
  runId: string | null;
  orderId: string | null;
  playbookId: string | null;
  title: string;
  summary: string;
  factIds?: string[];
  agentActions?: unknown;
  decideBy?: Date | null;
  decideByReason?: string | null;
}): Promise<Card> {
  const { runId, orderId, playbookId, title, summary, factIds = [], agentActions } = args;
  return prisma.card.create({
    data: {
      kind: 'TRIAGE',
      status: 'OPEN',
      runId,
      orderId,
      playbookId,
      title,
      summary: clipLines(summary),
      factIds,
      agentActions: agentActions === undefined ? undefined : toJson(agentActions),
      options: toJson({ items: [], recommendation: null, agentWillNot: [] }),
      decideBy: args.decideBy ?? null,
      decideByReason: args.decideByReason ?? null,
    },
  });
}

// Marks a TRIAGE card as a hand-over from a run (agentActions[0]), so the UI can tell it from watchman triage.
export const HANDOVER_ACTOR = 'runtime';

export type HandOverReason = 'failed' | 'rejected' | 'expired' | 'refused' | 'stopped' | 'watchman';

/** Opens a "worth a look" card for a person: the reason in plain words, what the run found, a link to the run. */
export async function handOver(args: {
  runId: string | null;
  orderId: string | null;
  playbookId: string | null;
  reason: HandOverReason;
  title: string;
  summary: string;
  factIds?: string[];
  decideBy?: Date | null;
  decideByReason?: string | null;
  at: Date;
}): Promise<Card> {
  const { runId, orderId, playbookId, reason, title, summary, factIds = [], at } = args;
  // One hand-over per run: a retry or a second failure path adds nothing new.
  const existing = runId
    ? await prisma.card.findFirst({
        where: { runId, kind: 'TRIAGE' },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  if (existing) return existing;
  // A watchman triage card that a decision card folded is part of what the person should see.
  const folded = orderId
    ? await prisma.card.findMany({
        where: { orderId, kind: 'TRIAGE', status: 'CANCELLED', playbookId: 'escape-hatch' },
        select: { id: true, title: true, factIds: true, decision: true },
      })
    : [];
  const runCards = runId
    ? (await prisma.card.findMany({ where: { runId }, select: { id: true } })).map((c) => c.id)
    : [];
  const earlier = folded.filter((card) =>
    runCards.includes(String((card.decision as { foldedInto?: unknown } | null)?.foldedInto))
  );
  return createTriageCard({
    runId,
    orderId,
    playbookId,
    title,
    summary,
    factIds: [...new Set([...factIds, ...earlier.flatMap((card) => card.factIds)])].slice(0, 40),
    agentActions: [
      {
        actor: HANDOVER_ACTOR,
        kind: 'handover',
        reason,
        at: at.toISOString(),
        foldedCardIds: earlier.map((card) => card.id),
      },
    ],
    decideBy: args.decideBy ?? null,
    decideByReason: args.decideByReason ?? null,
  });
}
