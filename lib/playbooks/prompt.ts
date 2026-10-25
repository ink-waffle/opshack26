// Agent prompt = shared rules + evidence ladder + playbook rules (system) and block instructions + option templates + amendments + JSON context (user).

import { readFile } from 'fs/promises';
import { isAbsolute, join } from 'path';

import { repoRoot } from '@/lib/agents/controlMcp';
import { renderLadderForAgents } from '@/lib/evidence';
import { renderGuardrailsForAgents } from '@/lib/gate/actions';
import type { Amendment } from '@/lib/generated/prisma/client';
import { compactFacts, summarizeOrder } from '@/lib/playbooks/orderSummary';
import { renderTemplatesForAgents } from '@/lib/playbooks/templates';
import type { BlockDefinition, PlaybookDefinition, RunContext } from '@/lib/playbooks/types';

export const SHARED_RULES_PATH = 'playbooks/_shared/rules.md';

export function playbookPath(args: { definition: PlaybookDefinition; file: string }): string {
  const { definition, file } = args;
  const folder = isAbsolute(definition.folder)
    ? definition.folder
    : join(repoRoot(), definition.folder);
  return join(folder, file);
}

export async function readPlaybookFile(args: {
  definition: PlaybookDefinition;
  file: string;
}): Promise<string> {
  return (await readFile(playbookPath(args), 'utf8')).trim();
}

export async function readSharedRules(): Promise<string> {
  return (await readFile(join(repoRoot(), SHARED_RULES_PATH), 'utf8')).trim();
}

/** Approved INSTRUCTION amendments that apply to a block (playbook-wide ones have blockId null). */
export function amendmentsForBlock(args: {
  amendments: Amendment[];
  blockId: string;
}): Amendment[] {
  const { amendments, blockId } = args;
  return amendments.filter((amendment) => !amendment.blockId || amendment.blockId === blockId);
}

export function renderAmendments(amendments: Amendment[]): string {
  if (!amendments.length) return '';
  return [
    '## Approved amendments (chief dispatcher)',
    '',
    'These were learned from earlier operator decisions. Follow them; where they conflict with the text above, they win.',
    '',
    ...amendments.map((amendment) => `- ${amendment.text.trim()} _(amendment ${amendment.id})_`),
  ].join('\n');
}

export function buildRunContextJson(args: { block: BlockDefinition; ctx: RunContext }) {
  const { block, ctx } = args;
  return {
    simNow: ctx.simNow.toISOString(),
    playbook: { id: ctx.playbook.id, title: ctx.playbook.title },
    block: { id: block.id, title: block.title },
    trigger: { type: ctx.payload.triggerType ?? null, signalId: ctx.payload.signalId ?? null },
    params: ctx.params,
    order: summarizeOrder(ctx.order),
    facts: compactFacts(ctx.facts),
    earlierBlocks: ctx.outputs,
    ...(block.context ? { extra: block.context(ctx) } : {}),
  };
}

export async function buildAgentPrompt(args: {
  block: BlockDefinition;
  ctx: RunContext;
  feedback?: string;
}): Promise<{ systemPrompt: string; prompt: string }> {
  const { block, ctx, feedback } = args;
  if (!block.instructions) throw new Error(`Agent block ${block.id} has no instructions`);
  const [shared, playbookRules, instructions] = await Promise.all([
    readSharedRules(),
    readPlaybookFile({ definition: ctx.playbook, file: 'rules.md' }),
    readPlaybookFile({ definition: ctx.playbook, file: block.instructions }),
  ]);
  const systemPrompt = [
    `You are an operations agent in Bahn's car-delivery control room. You are running the "${ctx.playbook.title}" playbook for order ${ctx.orderRef}. Times are UTC ISO unless stated; "now" is the simulated operations time in the context.`,
    shared,
    renderLadderForAgents(),
    renderGuardrailsForAgents(),
    `# Playbook rules: ${ctx.playbook.title}\n\n${playbookRules}`,
  ].join('\n\n');
  const amendments = renderAmendments(
    amendmentsForBlock({ amendments: ctx.instructions, blockId: block.id })
  );
  const prompt = [
    `# Task: ${block.title}`,
    instructions,
    block.templates ? renderTemplatesForAgents(block.templates) : '',
    amendments,
    feedback ? `## Feedback on your previous answer\n\n${feedback}` : '',
    '## Context (JSON)',
    '```json',
    JSON.stringify(buildRunContextJson({ block, ctx }), null, 1),
    '```',
    'Use the tools for anything not in the context. Return your answer through the structured output tool.',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { systemPrompt, prompt };
}
