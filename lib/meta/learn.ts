// meta-learn: corrected card → proposer → backtest (keep if better, one revision) → amendments PROPOSED for the chief dispatcher.

import { runAgent } from '@/lib/agents';
import type { Prisma } from '@/lib/generated/prisma/client';
import { backtestInstruction, backtestParameters } from '@/lib/meta/backtest';
import { type AgentBlockCase, type LearningCase, loadLearningCase } from '@/lib/meta/load';
import { buildProposerPrompt, proposeAmendments } from '@/lib/meta/propose';
import {
  type Backtest,
  type LearnResult,
  type ProposedAmendment,
  proposedAmendmentSchema,
} from '@/lib/meta/types';
import { checkParameters, currentValue, parameterWhitelist } from '@/lib/meta/whitelist';
import { prisma } from '@/lib/prismaClient';

type Log = (message: string, data?: unknown) => void;

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** The agent block an INSTRUCTION targets; falls back to the step whose output became the card's options. */
function targetBlock(args: { learning: LearningCase; blockId: string | null }): AgentBlockCase {
  const { learning, blockId } = args;
  const exact = learning.agentBlocks.find((item) => item.block.id === blockId);
  if (exact) return exact;
  const withOptions = learning.agentBlocks.find((item) =>
    Array.isArray((item.blockRun.output as { options?: unknown } | null)?.options)
  );
  return withOptions ?? learning.agentBlocks[learning.agentBlocks.length - 1];
}

/** One autoresearch revision: show the proposer its failed text and the backtest, ask for a sharper one. */
async function reviseInstruction(args: {
  learning: LearningCase;
  target: AgentBlockCase;
  text: string;
  backtest: Backtest;
}): Promise<{ text: string; costUsd: number } | null> {
  const { learning, target, text, backtest } = args;
  const prompt = [
    await buildProposerPrompt(learning),
    '## Your first attempt did not pass the backtest',
    `Text tried on \`${target.block.id}\`: “${text}”`,
    `Backtest: ${backtest.summary}`,
    ...backtest.cases.map((c) => `- ${c.label}: ${c.note}`),
    'Return exactly one INSTRUCTION amendment for the same step, sharper and more operational (say what to recommend first and what to do only as a fallback), still general and at most two sentences.',
  ].join('\n\n');
  const result = await runAgent({
    systemPrompt:
      'You revise one playbook instruction so that an AI agent follows an operator correction. Answer with one INSTRUCTION amendment.',
    prompt,
    outputSchema: proposedAmendmentSchema,
    mcpServers: {},
    allowedTools: [],
    model: 'sonnet',
    timeoutMs: 4 * 60_000,
    maxBudgetUsd: 1,
  });
  return result.output.text ? { text: result.output.text.trim(), costUsd: result.costUsd } : null;
}

async function store(args: {
  learning: LearningCase;
  proposal: ProposedAmendment;
  blockId: string | null;
  text: string;
  parameters: Record<string, number> | null;
  backtest: Backtest;
}) {
  const { learning, proposal, blockId, text, parameters, backtest } = args;
  return prisma.amendment.create({
    data: {
      playbookId: learning.definition.id,
      blockId,
      kind: proposal.kind,
      text,
      parameters: parameters ? toJson(parameters) : undefined,
      rationale: proposal.rationale,
      sourceCardId: learning.card.id,
      backtest: toJson(backtest),
      // Keep-if-better: a candidate that did not beat the baseline is recorded as discarded by the backtest.
      status: backtest.improved ? 'PROPOSED' : 'REJECTED',
      proposedBy: 'meta-learn',
      decidedBy: backtest.improved ? null : 'backtest',
      decidedAt: backtest.improved ? null : new Date(),
    },
  });
}

async function learnInstruction(args: {
  learning: LearningCase;
  proposal: ProposedAmendment;
  log: Log;
}): Promise<{ id: string; improved: boolean; costUsd: number }> {
  const { learning, proposal, log } = args;
  const target = targetBlock({ learning, blockId: proposal.blockId });
  let text = (proposal.text ?? '').trim();
  let costUsd = 0;
  const attempts: { text: string; summary: string }[] = [];
  let backtest = await backtestInstruction({ learning, target, text });
  costUsd += backtest.costUsd;
  log(`backtest ${target.block.id}: ${backtest.summary}`, { text });
  if (!backtest.improved) {
    const revised = await reviseInstruction({ learning, target, text, backtest }).catch(() => null);
    if (revised && revised.text !== text) {
      costUsd += revised.costUsd;
      const second = await backtestInstruction({ learning, target, text: revised.text });
      costUsd += second.costUsd;
      log(`revised backtest ${target.block.id}: ${second.summary}`, { text: revised.text });
      const firstFollows = Number(backtest.cases[0]?.after ?? 0);
      const secondFollows = Number(second.cases[0]?.after ?? 0);
      if (second.improved || (!backtest.improved && secondFollows > firstFollows)) {
        attempts.push({ text, summary: backtest.summary });
        text = revised.text;
        backtest = second;
      } else attempts.push({ text: revised.text, summary: second.summary });
    }
  }
  const row = await store({
    learning,
    proposal,
    blockId: target.block.id,
    text,
    parameters: null,
    backtest: { ...backtest, costUsd, attempts },
  });
  return { id: row.id, improved: backtest.improved, costUsd };
}

async function learnParameter(args: {
  learning: LearningCase;
  proposal: ProposedAmendment;
  log: Log;
}): Promise<{ id: string; improved: boolean; costUsd: number } | null> {
  const { learning, proposal, log } = args;
  const parameters = Object.fromEntries(
    (proposal.parameters ?? []).map(({ key, value }) => [key, value])
  );
  const check = checkParameters({
    definition: learning.definition,
    parameters,
    current: learning.params,
  });
  if (!check.ok || !Object.keys(parameters).length) {
    log(`parameter proposal dropped: ${check.ok ? 'no keys' : check.reason}`, parameters);
    return null;
  }
  const specs = new Map(parameterWhitelist(learning.definition).map((s) => [s.key, s]));
  const text = Object.entries(parameters)
    .map(([key, value]) => {
      const spec = specs.get(key);
      const from = spec ? currentValue({ spec, params: learning.params }) : '?';
      return `${spec?.label ?? key}: ${from} → ${value}${spec?.unit === 'probability' ? '' : ` ${spec?.unit ?? ''}`}.`;
    })
    .join(' ');
  const backtest = await backtestParameters({ learning, parameters });
  log(`parameter backtest: ${backtest.summary}`);
  const row = await store({ learning, proposal, blockId: null, text, parameters, backtest });
  return { id: row.id, improved: backtest.improved, costUsd: 0 };
}

export async function learnFromCard(args: {
  cardId: string;
  force?: boolean;
  waitMs?: number;
  log?: Log;
}): Promise<LearnResult> {
  const { cardId, force = false, waitMs, log = () => undefined } = args;
  const empty = { cardId, amendmentIds: [], proposed: 0, discarded: 0, costUsd: 0 };
  if (!force) {
    const existing = await prisma.amendment.count({ where: { sourceCardId: cardId } });
    if (existing) return { ...empty, skipped: `already learned (${existing} amendments)` };
  }
  const loaded = await loadLearningCase({ cardId, waitMs });
  if ('skipped' in loaded) return { ...empty, skipped: loaded.skipped };
  const learning = loaded.case;
  log('learning case', {
    playbook: learning.definition.id,
    order: learning.orderRef,
    blocks: learning.agentBlocks.map((item) => item.block.id),
    correction: learning.correction,
  });
  const { answer, costUsd: proposerCost } = await proposeAmendments(learning);
  log('proposer', answer);
  let costUsd = proposerCost;
  const ids: string[] = [];
  let proposed = 0;
  let discarded = 0;
  if (answer.generalizes)
    for (const proposal of answer.amendments.slice(0, 2)) {
      const result =
        proposal.kind === 'INSTRUCTION'
          ? proposal.text
            ? await learnInstruction({ learning, proposal, log })
            : null
          : await learnParameter({ learning, proposal, log });
      if (!result) continue;
      ids.push(result.id);
      costUsd += result.costUsd;
      if (result.improved) proposed += 1;
      else discarded += 1;
    }
  return {
    cardId,
    generalizes: answer.generalizes,
    reasoning: answer.reasoning,
    amendmentIds: ids,
    proposed,
    discarded,
    costUsd,
  };
}
