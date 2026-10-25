// The graph walker: start at `start`, run each block, follow the first matching edge, stop at a block with no edges.

import type { RunStatus } from '@/lib/generated/prisma/client';
import type { BlockDefinition, Edge, PlaybookDefinition, RunContext } from '@/lib/playbooks/types';

export const MAX_STEPS = 40;

const TERMINAL_STATUSES: RunStatus[] = ['CLOSED', 'ESCALATED', 'FAILED'];

export function getBlock(args: { definition: PlaybookDefinition; blockId: string }) {
  const { definition, blockId } = args;
  const block = definition.blocks.find((candidate) => candidate.id === blockId);
  if (!block) throw new Error(`Playbook ${definition.id} has no block "${blockId}"`);
  return block;
}

/** First edge whose `when` holds (or has none); null for a terminal block. Throws if edges exist but none match. */
export function selectEdge(args: { block: BlockDefinition; ctx: RunContext }): Edge | null {
  const { block, ctx } = args;
  if (block.next.length === 0) return null;
  const edge = block.next.find((candidate) => !candidate.when || candidate.when(ctx));
  if (!edge) throw new Error(`No edge from "${block.id}" matched`);
  return edge;
}

/** Run status a terminal block leaves the run in (CLOSED unless the block says ESCALATED / FAILED). */
export function terminalStatus(block: BlockDefinition): RunStatus {
  return block.status && TERMINAL_STATUSES.includes(block.status) ? block.status : 'CLOSED';
}

export type WalkResult = { path: string[]; lastBlockId: string; status: RunStatus };

export async function walkGraph(args: {
  definition: PlaybookDefinition;
  ctx: RunContext;
  executeBlock: (args: { block: BlockDefinition; ctx: RunContext }) => Promise<unknown>;
  startAt?: string;
  maxSteps?: number;
}): Promise<WalkResult> {
  const { definition, ctx, executeBlock, startAt = definition.start, maxSteps = MAX_STEPS } = args;
  const path: string[] = [];
  let blockId = startAt;
  for (let step = 0; step < maxSteps; step++) {
    const block = getBlock({ definition, blockId });
    path.push(block.id);
    ctx.outputs[block.id] = await executeBlock({ block, ctx });
    const edge = selectEdge({ block, ctx });
    if (!edge) return { path, lastBlockId: block.id, status: terminalStatus(block) };
    blockId = edge.to;
  }
  throw new Error(`Playbook ${definition.id} exceeded ${maxSteps} steps: ${path.join(' → ')}`);
}

/** Static checks: unique ids, start and edge targets exist, required fields per kind. */
export function validatePlaybook(definition: PlaybookDefinition): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const block of definition.blocks) {
    if (ids.has(block.id)) problems.push(`duplicate block id ${block.id}`);
    ids.add(block.id);
  }
  if (!ids.has(definition.start)) problems.push(`start block ${definition.start} missing`);
  for (const block of definition.blocks) {
    for (const edge of block.next)
      if (!ids.has(edge.to)) problems.push(`${block.id} → ${edge.to}: unknown target`);
    if (block.kind === 'agent' && (!block.instructions || !block.outputSchema))
      problems.push(`agent block ${block.id} needs instructions and outputSchema`);
    if (block.kind === 'deterministic' && !block.run)
      problems.push(`deterministic block ${block.id} needs run`);
    if (block.kind === 'wait' && !block.wait) problems.push(`wait block ${block.id} needs wait`);
    if (block.kind === 'human' && !block.card) problems.push(`human block ${block.id} needs card`);
  }
  return problems;
}

/** Identity helper that fails fast on a malformed graph (at import time, so the catalog and tasks agree). */
export function definePlaybook(definition: PlaybookDefinition): PlaybookDefinition {
  const problems = validatePlaybook(definition);
  if (problems.length) throw new Error(`Invalid playbook ${definition.id}: ${problems.join('; ')}`);
  return definition;
}
