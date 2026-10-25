import { executeAgentBlock } from '@/lib/playbooks/blocks/agent';
import { executeDeterministicBlock } from '@/lib/playbooks/blocks/deterministic';
import { executeExecuteBlock } from '@/lib/playbooks/blocks/execute';
import { executeHumanBlock } from '@/lib/playbooks/blocks/human';
import type { BlockExecutor } from '@/lib/playbooks/blocks/types';
import { executeWaitBlock } from '@/lib/playbooks/blocks/wait';
import type { BlockKind } from '@/lib/playbooks/types';

export const BLOCK_EXECUTORS: Record<BlockKind, BlockExecutor> = {
  deterministic: executeDeterministicBlock,
  agent: executeAgentBlock,
  wait: executeWaitBlock,
  human: executeHumanBlock,
  execute: executeExecuteBlock,
};
