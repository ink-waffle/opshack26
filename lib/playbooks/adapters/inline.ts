// Inline runtime (scripts, debugging without `trigger dev`): agents run in-process, tokens are polled over the API.

import { wait } from '@trigger.dev/sdk';

import type { RuntimeAdapter } from '@/lib/playbooks/adapters';
import { runAgentJob } from '@/lib/playbooks/agentJob';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function inlineAdapter(args: { maxWaitMs?: number; pollMs?: number } = {}): RuntimeAdapter {
  const { maxWaitMs = Number(process.env.PLAYBOOK_INLINE_MAX_WAIT_MS ?? 10_000), pollMs = 3000 } =
    args;
  const log = (message: string, data?: unknown) =>
    console.log(`[playbook] ${message}`, data === undefined ? '' : JSON.stringify(data));
  return {
    id: 'inline',
    runAgent: runAgentJob,
    waitFor: async ({ realMs }) => {
      const ms = Math.min(realMs, maxWaitMs);
      log(`inline wait ${Math.round(ms / 1000)} s (asked ${Math.round(realMs / 1000)} s)`);
      await sleep(ms);
    },
    createToken: async ({ timeoutAt, tags, idempotencyKey }) => {
      const token = await wait.createToken({ timeout: timeoutAt, tags, idempotencyKey });
      return { id: token.id };
    },
    waitForToken: async ({ tokenId }) => {
      for (;;) {
        const token = await wait.retrieveToken(tokenId);
        if (token.status === 'COMPLETED') return { ok: true, output: token.output };
        if (token.status === 'TIMED_OUT') return { ok: false, error: 'timed out' };
        await sleep(pollMs);
      }
    },
    log,
  };
}
