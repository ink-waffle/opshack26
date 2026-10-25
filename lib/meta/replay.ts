// Replays a recorded agent block without side effects: same prompt, tools off, the recorded tool results inlined.

import { runAgent } from '@/lib/agents';
import type { RecordedAgentInput } from '@/lib/meta/load';

export type RecordedToolCall = { tool: string; input: unknown; result: string; isError: boolean };

type ContentBlock = {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

const RESULT_CHARS = 3500;

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content
      .map((part) => (part && typeof part === 'object' && 'text' in part ? String(part.text) : ''))
      .join('');
  return JSON.stringify(content ?? null);
}

/** Tool calls and their results from a stream-json transcript (StructuredOutput excluded). */
export function recordedToolCalls(transcript: unknown): RecordedToolCall[] {
  if (!Array.isArray(transcript)) return [];
  const calls = new Map<string, RecordedToolCall>();
  for (const message of transcript as { message?: { content?: ContentBlock[] } }[]) {
    const content = message?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_use' && block.id && block.name && block.name !== 'StructuredOutput')
        calls.set(block.id, {
          tool: block.name.replace(/^mcp__control__/, ''),
          input: block.input,
          result: '',
          isError: false,
        });
      else if (block.type === 'tool_result' && block.tool_use_id) {
        const call = calls.get(block.tool_use_id);
        if (call) {
          call.result = resultText(block.content);
          call.isError = Boolean(block.is_error);
        }
      }
    }
  }
  return [...calls.values()];
}

const AMENDMENTS_HEADING = '## Approved amendments (chief dispatcher)';
const CONTEXT_HEADING = '## Context (JSON)';

/** The recorded prompt with one more amendment, placed exactly where the runtime renders amendments. */
export function promptWithAmendment(args: { prompt: string; text: string }): string {
  const { prompt, text } = args;
  const line = `- ${text.trim()} _(amendment under test)_`;
  const at = prompt.indexOf(AMENDMENTS_HEADING);
  if (at >= 0) {
    const next = prompt.indexOf('\n## ', at + AMENDMENTS_HEADING.length);
    const end = next >= 0 ? next : prompt.length;
    return `${prompt.slice(0, end).trimEnd()}\n${line}\n\n${prompt.slice(end).trimStart()}`;
  }
  const section = [
    AMENDMENTS_HEADING,
    '',
    'These were learned from earlier operator decisions. Follow them; where they conflict with the text above, they win.',
    '',
    line,
  ].join('\n');
  const contextAt = prompt.indexOf(CONTEXT_HEADING);
  if (contextAt < 0) return `${prompt}\n\n${section}`;
  return `${prompt.slice(0, contextAt)}${section}\n\n${prompt.slice(contextAt)}`;
}

/** Replay prompt: the (amended) prompt plus the recorded tool results, with tools switched off. */
export function replayPrompt(args: { prompt: string; calls: RecordedToolCall[] }): string {
  const { prompt, calls } = args;
  const results = calls.map((call, index) => {
    const clipped =
      call.result.length > RESULT_CHARS ? `${call.result.slice(0, RESULT_CHARS)}…` : call.result;
    return `### ${index + 1}. ${call.tool}(${JSON.stringify(call.input)})${call.isError ? ' (error)' : ''}\n\n${clipped}`;
  });
  return [
    prompt.replace(
      /Use the tools for anything not in the context\.[^\n]*$/m,
      'Return your answer through the structured output tool.'
    ),
    '## Replay mode (backtest)',
    'This is a replay of a recorded run. Tools are switched off. These are the calls made in the recorded run and their results; treat them as calls you just made and cite the fact ids they returned. If you would need a call that is not listed, say so in your answer instead of inventing its result.',
    results.length ? results.join('\n\n') : '_No tool calls were made in the recorded run._',
  ].join('\n\n');
}

export type ReplayResult = { output: unknown; costUsd: number; durationMs: number };

/** One side-effect-free re-run of a recorded agent block, optionally with an amendment under test. */
export async function replayAgentBlock(args: {
  input: RecordedAgentInput;
  transcript: unknown;
  amendment?: string | null;
  timeoutMs?: number;
}): Promise<ReplayResult> {
  const { input, transcript, amendment, timeoutMs = 8 * 60_000 } = args;
  const base = amendment
    ? promptWithAmendment({ prompt: input.prompt, text: amendment })
    : input.prompt;
  const result = await runAgent({
    systemPrompt: input.systemPrompt,
    prompt: replayPrompt({ prompt: base, calls: recordedToolCalls(transcript) }),
    outputSchema: input.jsonSchema,
    mcpServers: {},
    allowedTools: [],
    model: input.model.includes('haiku') ? 'haiku' : 'sonnet',
    timeoutMs,
    maxBudgetUsd: 1.5,
  });
  return { output: result.output, costUsd: result.costUsd, durationMs: result.durationMs };
}
