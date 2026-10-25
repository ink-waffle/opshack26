// Trigger.dev runtime: agents run as `agent-block` child runs (queue limit 2), waits and tokens are checkpointed.

import { logger, wait } from '@trigger.dev/sdk';

import type { RuntimeAdapter } from '@/lib/playbooks/adapters';
import { agentBlockTask } from '@/trigger/agent-block';

export function triggerAdapter(): RuntimeAdapter {
  return {
    id: 'trigger',
    runAgent: async (payload) => {
      const result = await agentBlockTask.triggerAndWait(payload, {
        tags: [`playbook-run:${payload.runId}`, `block:${payload.blockId}`],
      });
      if (!result.ok)
        throw new Error(`agent block ${payload.blockId} failed: ${String(result.error)}`);
      return result.output;
    },
    waitFor: async ({ realMs, idempotencyKey }) => {
      const seconds = Math.ceil(realMs / 1000);
      if (seconds <= 0) return;
      await wait.for({ seconds, idempotencyKey });
    },
    createToken: async ({ timeoutAt, tags, idempotencyKey }) => {
      const token = await wait.createToken({ timeout: timeoutAt, tags, idempotencyKey });
      return { id: token.id };
    },
    waitForToken: async ({ tokenId }) => {
      const result = await wait.forToken<unknown>(tokenId);
      return result.ok
        ? { ok: true, output: result.output }
        : { ok: false, error: String(result.error) };
    },
    log: (message, data) => logger.info(message, data === undefined ? undefined : { data }),
  };
}
