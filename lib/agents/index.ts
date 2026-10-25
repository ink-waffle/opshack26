import { z } from 'zod';

import { claudeCliRunner } from '@/lib/agents/adapters/claudeCli';

export { AgentRunError } from '@/lib/agents/errors';

export type McpServerConfig = {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type JsonSchema = Record<string, unknown>;

export type RunAgentArgs<T = unknown> = {
  systemPrompt: string;
  prompt: string;
  // A zod schema (converted to JSON schema, output parsed with it) or a plain JSON schema object.
  outputSchema: z.ZodType<T> | JsonSchema;
  mcpServers?: Record<string, McpServerConfig>;
  // Defaults to every tool of every given MCP server (`mcp__<server>`).
  allowedTools?: string[];
  model?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxBudgetUsd?: number;
};

export type AgentToolCall = {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  isError?: boolean;
};

export type AgentResult<T = unknown> = {
  output: T;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  sessionId: string | null;
  model: string | null;
  toolCalls: AgentToolCall[];
  // Every stream-json message the CLI emitted (init, assistant, user/tool results, result).
  transcript: unknown[];
  // The final `result` message.
  raw: unknown;
};

export type AgentRunner = {
  id: string;
  run: (
    args: Omit<RunAgentArgs, 'outputSchema'> & { outputSchema: JsonSchema }
  ) => Promise<AgentResult>;
};

const registry: Record<string, AgentRunner> = {
  [claudeCliRunner.id]: claudeCliRunner,
};

export function getAgentRunner(id = process.env.AGENT_RUNNER ?? 'claude-cli'): AgentRunner {
  const runner = registry[id];
  if (!runner) throw new Error(`Unknown agent runner adapter: ${id}`);
  return runner;
}

const isZodSchema = (schema: unknown): schema is z.ZodType =>
  typeof schema === 'object' && schema !== null && '_zod' in schema;

export async function runAgent<T = unknown>(
  args: RunAgentArgs<T> & { runner?: string }
): Promise<AgentResult<T>> {
  const { runner, outputSchema, ...rest } = args;
  const zodSchema = isZodSchema(outputSchema) ? outputSchema : null;
  const jsonSchema = zodSchema
    ? (z.toJSONSchema(zodSchema, { target: 'draft-7' }) as JsonSchema)
    : (outputSchema as JsonSchema);
  const result = await getAgentRunner(runner).run({ ...rest, outputSchema: jsonSchema });
  const output = zodSchema ? zodSchema.parse(result.output) : result.output;
  return { ...result, output: output as T };
}
