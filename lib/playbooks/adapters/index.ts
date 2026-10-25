// How the runtime waits and runs agents: Trigger.dev (production path) or inline (scripts, tests).

import type { AgentJobPayload, AgentJobResult } from '@/lib/playbooks/agentJob';

export type TokenResult = { ok: true; output: unknown } | { ok: false; error: string };

export type RuntimeAdapter = {
  id: 'trigger' | 'inline' | 'fake';
  runAgent: (payload: AgentJobPayload) => Promise<AgentJobResult>;
  waitFor: (args: { realMs: number; idempotencyKey: string }) => Promise<void>;
  createToken: (args: {
    timeoutAt: Date;
    tags: string[];
    idempotencyKey: string;
  }) => Promise<{ id: string }>;
  waitForToken: (args: { tokenId: string }) => Promise<TokenResult>;
  log: (message: string, data?: unknown) => void;
};
