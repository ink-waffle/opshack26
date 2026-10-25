import { z } from 'zod';

import type { JsonSchema } from '@/lib/agents';
import type { AgentToolCallSummary } from '@/lib/playbooks/agentJob';
import type { BlockExecutor } from '@/lib/playbooks/blocks/types';
import { toJson } from '@/lib/playbooks/json';
import { buildAgentPrompt } from '@/lib/playbooks/prompt';
import type { AgentAction } from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';

function collectFactIds(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const ids = [
    ...(typeof record.factId === 'string' ? [record.factId] : []),
    ...(Array.isArray(record.factIds) ? record.factIds.filter((id) => typeof id === 'string') : []),
  ];
  return [...new Set(ids as string[])];
}

/** One readable line of a tool error (stack traces and Prisma internals are not for the operator). */
function errorLine(result: unknown): string {
  const text = String(result ?? '').replace(/^Error:\s*/i, '');
  if (/prisma|invocation|\/Users\/|node_modules/i.test(text)) return 'a system error (database)';
  return (
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim()
      .slice(0, 160) ?? 'unknown error'
  );
}

export function toAgentAction(args: {
  blockId: string;
  blockRunId?: string;
  call: AgentToolCallSummary;
}): AgentAction {
  const { blockId, blockRunId, call } = args;
  const result = call.result as { summary?: unknown } | null;
  const summary =
    typeof result?.summary === 'string'
      ? result.summary
      : `${call.tool}(${JSON.stringify(call.input).slice(0, 160)})`;
  return {
    blockId,
    ...(blockRunId ? { blockRunId } : {}),
    tool: call.tool,
    summary: call.isError ? `${call.tool} failed: ${errorLine(call.result)}` : summary,
    input: call.input,
    factIds: collectFactIds(call.result),
    isError: call.isError,
  };
}

/** The JSON schema the CLI is given (--json-schema) and block_runs.input records. */
export function outputJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { target: 'draft-7' }) as JsonSchema;
}

export const executeAgentBlock: BlockExecutor = async (args) => {
  const { block, ctx, adapter, blockRunId, feedback } = args;
  if (!block.outputSchema) throw new Error(`Agent block ${block.id} has no outputSchema`);
  const outputSchema = block.outputSchema;
  const jsonSchema = outputJsonSchema(outputSchema);
  const tools = block.tools ?? [];
  const model = block.model ?? 'sonnet';

  const { systemPrompt, prompt } = await buildAgentPrompt({ block, ctx, feedback });
  const input = { model, tools, feedback: feedback ?? null, systemPrompt, prompt, jsonSchema };
  await prisma.blockRun.update({ where: { id: blockRunId }, data: { input: toJson(input) } });
  const result = await adapter.runAgent({
    blockRunId,
    runId: ctx.run.id,
    orderId: ctx.orderId,
    blockId: block.id,
    systemPrompt,
    prompt,
    jsonSchema,
    tools,
    model,
    timeoutMs: block.timeoutMs,
    maxBudgetUsd: block.maxBudgetUsd,
  });
  const output = outputSchema.parse(result.output);
  ctx.agentActions.push(
    ...result.toolCalls.map((call) => toAgentAction({ blockId: block.id, blockRunId, call }))
  );
  await ctx.services.refresh();
  return { output, input, costUsd: result.costUsd, model: result.model };
};
