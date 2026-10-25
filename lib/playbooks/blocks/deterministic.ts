import type { BlockExecutor } from '@/lib/playbooks/blocks/types';

export const executeDeterministicBlock: BlockExecutor = async (args) => {
  const { block, ctx } = args;
  if (!block.run) throw new Error(`Deterministic block ${block.id} has no run()`);
  const raw = await block.run(ctx);
  const output = block.outputSchema ? block.outputSchema.parse(raw) : raw;
  return { output, input: { simNow: ctx.simNow.toISOString() } };
};
