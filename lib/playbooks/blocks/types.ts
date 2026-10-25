import type { RuntimeAdapter } from '@/lib/playbooks/adapters';
import type { BlockDefinition, RunContext } from '@/lib/playbooks/types';

export type BlockResult = {
  output: unknown;
  // What the block worked from (prompt, wait reason, card id…), stored on block_runs.input for replay.
  input?: unknown;
  costUsd?: number;
  model?: string | null;
};

export type BlockExecutorArgs = {
  block: BlockDefinition;
  ctx: RunContext;
  adapter: RuntimeAdapter;
  blockRunId: string;
  // Agent blocks: gate feedback for a self-correction rerun.
  feedback?: string;
};

export type BlockExecutor = (args: BlockExecutorArgs) => Promise<BlockResult>;
