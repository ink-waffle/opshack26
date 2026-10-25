import { logger, queue, task } from '@trigger.dev/sdk';

import { type AgentJobPayload, runAgentJob } from '@/lib/playbooks/agentJob';

// Subscription rate limits: at most 2 agent blocks run at once across all playbook runs.
export const agentBlocksQueue = queue({ name: 'agent-blocks', concurrencyLimit: 2 });

// One playbook agent block (Claude CLI + control MCP tools); the parent playbook task waits on it.
export const agentBlockTask = task({
  id: 'agent-block',
  queue: agentBlocksQueue,
  maxDuration: 1200,
  retry: { maxAttempts: 1 },
  run: async (payload: AgentJobPayload) => {
    logger.info('agent block', {
      runId: payload.runId,
      blockId: payload.blockId,
      model: payload.model,
      tools: payload.tools,
    });
    const result = await runAgentJob(payload);
    logger.info('agent block done', {
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      numTurns: result.numTurns,
      tools: result.toolCalls.map((call) => call.tool),
    });
    return result;
  },
});
