// One agent block execution (Claude CLI + control MCP tools); shared by the `agent-block` Trigger task and inline runs.

import { AgentRunError, type AgentToolCall, type JsonSchema, runAgent } from '@/lib/agents';
import { controlMcpServer, controlToolNames } from '@/lib/agents/controlMcp';
import { errorMessage, toJson } from '@/lib/playbooks/json';
import { prisma } from '@/lib/prismaClient';

export type AgentJobPayload = {
  blockRunId: string;
  // control.playbook_runs id; tools write facts with it.
  runId: string;
  orderId: string;
  blockId: string;
  systemPrompt: string;
  prompt: string;
  jsonSchema: JsonSchema;
  tools: string[];
  model: string;
  timeoutMs?: number;
  maxBudgetUsd?: number;
};

export type AgentToolCallSummary = {
  tool: string;
  input: unknown;
  // Parsed JSON result when the tool returned JSON, else the raw text (clipped).
  result: unknown;
  isError: boolean;
};

export type AgentJobResult = {
  output: unknown;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  model: string | null;
  toolCalls: AgentToolCallSummary[];
};

function toolResultText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output))
    return output
      .map((part) => (typeof part === 'object' && part && 'text' in part ? String(part.text) : ''))
      .join('');
  return JSON.stringify(output ?? null);
}

function summarizeCall(call: AgentToolCall): AgentToolCallSummary {
  const text = toolResultText(call.output);
  let result: unknown = text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
  try {
    result = JSON.parse(text);
  } catch {}
  return {
    tool: call.name.replace(/^mcp__control__/, ''),
    input: call.input,
    result,
    isError: Boolean(call.isError),
  };
}

export async function runAgentJob(payload: AgentJobPayload): Promise<AgentJobResult> {
  const { blockRunId, runId, orderId, blockId, systemPrompt, prompt, jsonSchema, tools, model } =
    payload;
  try {
    const result = await runAgent({
      systemPrompt,
      prompt,
      outputSchema: jsonSchema,
      mcpServers: { control: controlMcpServer({ runId, orderId, blockId, tools }) },
      allowedTools: controlToolNames(tools),
      model,
      timeoutMs: payload.timeoutMs ?? 10 * 60_000,
      maxBudgetUsd: payload.maxBudgetUsd,
    });
    await prisma.blockRun.update({
      where: { id: blockRunId },
      data: { transcript: toJson(result.transcript), model: result.model, costUsd: result.costUsd },
    });
    return {
      output: result.output,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      numTurns: result.numTurns,
      model: result.model,
      toolCalls: result.toolCalls.map(summarizeCall),
    };
  } catch (error) {
    const transcript = error instanceof AgentRunError ? error.details.transcript : undefined;
    await prisma.blockRun
      .update({
        where: { id: blockRunId },
        data: {
          error: errorMessage(error),
          ...(transcript ? { transcript: toJson(transcript) } : {}),
        },
      })
      .catch(() => undefined);
    throw error;
  }
}
