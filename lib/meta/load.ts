// Loads what the meta-system learns from: a corrected card, its run, the playbook and the agent blocks that fed it.

import type { Amendment, BlockRun, Card, PlaybookRun } from '@/lib/generated/prisma/client';
import { loadApprovedAmendments, resolveParams } from '@/lib/playbooks/amendments';
import { outputJsonSchema } from '@/lib/playbooks/blocks/agent';
import { parseDecision } from '@/lib/playbooks/decision';
import { amendmentsForBlock, readPlaybookFile } from '@/lib/playbooks/prompt';
import { getPlaybook } from '@/lib/playbooks/registry';
import type {
  BlockDefinition,
  CardOption,
  CardOptionsPayload,
  DecisionPayload,
  PlaybookDefinition,
} from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';

export type RecordedAgentInput = {
  systemPrompt: string;
  prompt: string;
  model: string;
  tools: string[];
  jsonSchema: Record<string, unknown>;
  feedback: string | null;
};

export type AgentBlockCase = {
  block: BlockDefinition;
  blockRun: BlockRun;
  input: RecordedAgentInput;
  instructions: string;
  // Approved INSTRUCTION amendments already in this block's prompt.
  amendments: Amendment[];
};

export type LearningCase = {
  card: Card;
  decision: DecisionPayload;
  run: PlaybookRun;
  definition: PlaybookDefinition;
  orderRef: string | null;
  options: CardOptionsPayload | null;
  agentBlocks: AgentBlockCase[];
  approved: Amendment[];
  params: Record<string, unknown>;
  // The operator's correction in plain words (note, edits, chosen option).
  correction: string;
};

export function recordedAgentInput(input: unknown): RecordedAgentInput | null {
  const value = input as Partial<RecordedAgentInput> | null;
  if (!value || typeof value.prompt !== 'string' || typeof value.systemPrompt !== 'string')
    return null;
  return {
    systemPrompt: value.systemPrompt,
    prompt: value.prompt,
    model: typeof value.model === 'string' ? value.model : 'sonnet',
    tools: Array.isArray(value.tools) ? value.tools.map(String) : [],
    jsonSchema: (value.jsonSchema ?? {}) as Record<string, unknown>,
    feedback: typeof value.feedback === 'string' ? value.feedback : null,
  };
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item
  );

/** True when a recorded agent input asked for the block's current output shape (a replay of it tests today's block). */
export function inCurrentShape(args: {
  input: RecordedAgentInput;
  block: BlockDefinition;
}): boolean {
  const { input, block } = args;
  return (
    !!block.outputSchema &&
    canonical(input.jsonSchema) === canonical(outputJsonSchema(block.outputSchema))
  );
}

const optionName = (option: CardOption | undefined) =>
  option ? `option ${option.id} (“${option.label}”)` : 'an option';

/** The operator's correction as sentences: their note, the option they chose and every edit. */
export function describeCorrection(args: {
  decision: DecisionPayload;
  options: CardOptionsPayload | null;
}): string {
  const { decision, options } = args;
  const items = options?.items ?? [];
  const recommended = items.find((option) => option.recommended);
  const chosen = items.find((option) => option.id === (decision.optionId ?? recommended?.id));
  const lines: string[] = [];
  if (decision.note) lines.push(`Operator's note: “${decision.note}”`);
  if (decision.action === 'reject') lines.push('The operator rejected every option on the card.');
  else if (chosen && recommended && chosen.id !== recommended.id)
    lines.push(
      `The operator chose ${optionName(chosen)} instead of the recommended ${optionName(recommended)}.`
    );
  else if (chosen) lines.push(`The operator kept ${optionName(chosen)} but edited it.`);
  for (const [actionId, text] of Object.entries(decision.edits?.messages ?? {})) {
    const action = chosen?.actions.find((candidate) => candidate.id === actionId);
    lines.push(
      `Rewrote the message of ${actionId}${action ? ` (${action.description})` : ''}: “${action?.message ?? ''}” → “${text}”.`
    );
  }
  for (const actionId of decision.edits?.removeActionIds ?? []) {
    const action = chosen?.actions.find((candidate) => candidate.id === actionId);
    lines.push(`Removed action ${actionId}${action ? `: ${action.description}` : ''}.`);
  }
  return lines.join('\n');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until the playbook run has written the operator's decision onto the card (the UI only completes the token). */
export async function waitForDecision(args: { cardId: string; timeoutMs?: number }): Promise<Card> {
  const { cardId, timeoutMs = 120_000 } = args;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw new Error(`Card ${cardId} not found`);
    // The UI may claim the card (EDITED) before the run writes the decision payload; wait for both.
    const decided = (card.decision as { action?: unknown } | null)?.action !== undefined;
    if ((card.status !== 'OPEN' && decided) || Date.now() > deadline) return card;
    await sleep(3000);
  }
}

/** Latest completed block run per agent block of the run (the outputs that fed the card), plus blocks recorded in an older output shape. */
async function agentBlockCases(args: {
  run: PlaybookRun;
  definition: PlaybookDefinition;
  approved: Amendment[];
}): Promise<{ cases: AgentBlockCase[]; outdated: string[] }> {
  const { run, definition, approved } = args;
  const blockRuns = await prisma.blockRun.findMany({
    where: { runId: run.id, kind: 'agent', status: 'COMPLETED' },
    orderBy: { startedAt: 'desc' },
  });
  const cases: AgentBlockCase[] = [];
  const outdated: string[] = [];
  for (const block of definition.blocks.filter((candidate) => candidate.kind === 'agent')) {
    const blockRun = blockRuns.find((candidate) => candidate.blockId === block.id);
    const input = blockRun ? recordedAgentInput(blockRun.input) : null;
    if (!blockRun || !input || !block.instructions) continue;
    if (!inCurrentShape({ input, block })) {
      outdated.push(block.id);
      continue;
    }
    cases.push({
      block,
      blockRun,
      input,
      instructions: await readPlaybookFile({ definition, file: block.instructions }).catch(
        () => ''
      ),
      amendments: amendmentsForBlock({
        amendments: approved.filter((amendment) => amendment.kind === 'INSTRUCTION'),
        blockId: block.id,
      }),
    });
  }
  return { cases, outdated };
}

export type LoadResult = { case: LearningCase } | { skipped: string };

export async function loadLearningCase(args: {
  cardId: string;
  waitMs?: number;
}): Promise<LoadResult> {
  const { cardId, waitMs } = args;
  const card = await waitForDecision({ cardId, timeoutMs: waitMs });
  if (card.status !== 'EDITED' && card.status !== 'REJECTED')
    return {
      skipped: `card is ${card.status}; only EDITED or REJECTED decisions teach the playbook`,
    };
  if (!card.runId || !card.playbookId) return { skipped: 'card has no playbook run' };
  const definition = getPlaybook(card.playbookId);
  if (!definition) return { skipped: `playbook ${card.playbookId} is not in the registry` };
  const run = await prisma.playbookRun.findUnique({ where: { id: card.runId } });
  if (!run) return { skipped: `run ${card.runId} not found` };
  let decision: DecisionPayload;
  try {
    decision = parseDecision(card.decision);
  } catch {
    return { skipped: 'card has no valid decision payload' };
  }
  const options = (card.options ?? null) as CardOptionsPayload | null;
  const approved = await loadApprovedAmendments({ playbookId: definition.id });
  const { cases: agentBlocks, outdated } = await agentBlockCases({ run, definition, approved });
  if (outdated.length)
    return {
      skipped: `step ${outdated.join(', ')} was recorded in an older output shape; a replay would not test the current playbook`,
    };
  if (!agentBlocks.length) return { skipped: 'no recorded agent block fed this card' };
  const order = run.orderId
    ? await prisma.bahnOrder.findUnique({ where: { id: run.orderId }, select: { reference: true } })
    : null;
  return {
    case: {
      card,
      decision,
      run,
      definition,
      orderRef: order?.reference ?? null,
      options,
      agentBlocks,
      approved,
      params: resolveParams({ definition, amendments: approved }),
      correction: describeCorrection({ decision, options }),
    },
  };
}
