import type { BlockExecutor } from '@/lib/playbooks/blocks/types';
import { cardExpiresAt, isExpiryPayload, TOKEN_TIMEOUT_MS } from '@/lib/playbooks/cardExpiry';
import { createDecisionCard } from '@/lib/playbooks/cards';
import {
  applyEdits,
  CARD_STATUS_BY_ACTION,
  chosenOption,
  parseDecision,
} from '@/lib/playbooks/decision';
import { recordFact } from '@/lib/playbooks/facts';
import { errorMessage, toJson } from '@/lib/playbooks/json';
import type { HumanBlockOutput, RunContext } from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';

function numberParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const GENERIC_TITLE = /needs? (a |your )?decision|decision (is )?needed/i;

/** A card title that says what is wrong: a generic one gives way to the summary's first sentence. */
export function specificTitle(args: { title: string; summary: string; orderRef: string }): string {
  const { title, summary, orderRef } = args;
  if (!GENERIC_TITLE.test(title)) return title;
  const first = summary.match(/^[^.!?\n]+/)?.[0]?.trim();
  return first && first.length <= 110 ? `${orderRef}: ${first}` : title;
}

/** Latest human block output on this run (what the execute block acts on). */
export function latestDecision(ctx: RunContext): HumanBlockOutput | null {
  const humanBlocks = ctx.playbook.blocks.filter((block) => block.kind === 'human').reverse();
  for (const block of humanBlocks) {
    const output = ctx.outputs[block.id] as HumanBlockOutput | undefined;
    if (output?.cardId) return output;
  }
  return null;
}

export const executeHumanBlock: BlockExecutor = async (args) => {
  const { block, ctx, adapter, blockRunId } = args;
  if (!block.card) throw new Error(`Human block ${block.id} has no card()`);
  const built = await block.card(ctx);
  const draft = {
    ...built,
    title: specificTitle({ title: built.title, summary: built.summary, orderRef: ctx.orderRef }),
  };
  const card = await createDecisionCard({ ctx, blockId: block.id, draft });
  // Expiry runs on sim time (`card-expiry` completes the token); the 24 h real timeout is only a backstop.
  const timeoutAt = new Date(Date.now() + TOKEN_TIMEOUT_MS);
  const expiresAtSim = cardExpiresAt({
    decideBy: draft.decideBy ?? null,
    marginMinutes: numberParam(ctx.params.decisionMarginMinutes, 0),
  });
  const token = await adapter.createToken({
    timeoutAt,
    tags: [`card:${card.id}`, `playbook-run:${ctx.run.id}`, `order:${ctx.orderRef}`],
    idempotencyKey: `card:${card.id}`,
  });
  await prisma.card.update({ where: { id: card.id }, data: { waitpointTokenId: token.id } });
  const input = {
    cardId: card.id,
    tokenId: token.id,
    decideBy: draft.decideBy ?? null,
    decideByReason: draft.decideByReason ?? null,
    expiresAtSim: expiresAtSim?.toISOString() ?? null,
    tokenTimeoutAt: timeoutAt.toISOString(),
  };
  await prisma.blockRun.update({
    where: { id: blockRunId },
    data: { status: 'WAITING', input: toJson(input) },
  });
  adapter.log(`card ${card.id} waiting on ${token.id}`, input);

  const completion = await adapter.waitForToken({ tokenId: token.id });
  await ctx.services.refresh();
  if (!completion.ok || isExpiryPayload(completion.output)) {
    // A decision that claimed the card a moment earlier is not overwritten.
    await prisma.card.updateMany({
      where: { id: card.id, status: { in: ['OPEN', 'EXPIRED'] } },
      data: {
        status: 'EXPIRED',
        decision: toJson(
          completion.ok ? completion.output : { expired: true, reason: 'token timed out' }
        ),
        decidedAt: ctx.simNow,
      },
    });
    const output: HumanBlockOutput = {
      cardId: card.id,
      tokenId: token.id,
      expired: true,
      decision: null,
      offered: null,
      option: null,
    };
    return { output, input };
  }

  let decision;
  try {
    decision = parseDecision(completion.output);
  } catch (error) {
    await prisma.card.update({
      where: { id: card.id },
      data: {
        status: 'CANCELLED',
        decision: toJson({ invalid: completion.output, error: errorMessage(error) }),
      },
    });
    throw error;
  }
  const offered = chosenOption({
    options: draft.options.items,
    decision,
    recommendedId: draft.options.recommendation?.optionId,
  });
  const option = offered ? applyEdits({ option: offered, decision }) : null;
  await prisma.card.update({
    where: { id: card.id },
    data: {
      status: CARD_STATUS_BY_ACTION[decision.action],
      decision: toJson({ ...decision, appliedOption: option }),
      decidedBy: decision.decidedBy,
      // Sim time, like every other operations timestamp (refreshed right after the token completed).
      decidedAt: ctx.simNow,
    },
  });
  const verb = { approve: 'approved', edit: 'approved with edits', reject: 'rejected' }[
    decision.action
  ];
  await recordFact({
    orderId: ctx.orderId,
    runId: ctx.run.id,
    kind: 'OPERATOR_DECISION',
    subject: `card:${card.id}`,
    statement: `${decision.decidedBy} ${verb} ${option ? `option ${option.id}: ${option.label}` : `"${draft.title}"`}${decision.note ? ` (${decision.note})` : ''}.`,
    value: { decision: decision.action, optionId: option?.id ?? null, cardId: card.id },
    level: 'VERIFIED',
    sourceType: 'OPERATOR',
    sourceRef: `card:${card.id}`,
    observedAt: ctx.simNow,
    dedupeKey: `card-decision:${card.id}`,
  });
  await ctx.services.refresh();
  const output: HumanBlockOutput = {
    cardId: card.id,
    tokenId: token.id,
    expired: false,
    decision,
    offered,
    option,
  };
  return { output, input };
};
