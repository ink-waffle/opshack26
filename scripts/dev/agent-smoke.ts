// Runs one isolated Claude CLI agent against the control MCP server: `pnpm agent:smoke [model]`.

import { z } from 'zod';

import { runAgent } from '@/lib/agents';
import { controlMcpServer, controlToolNames } from '@/lib/agents/controlMcp';

async function main() {
  const model = process.argv[2] ?? 'haiku';
  const result = await runAgent({
    model,
    systemPrompt:
      'You are an operations agent for a car delivery control room. Use only the provided tools. Never invent data.',
    prompt:
      'Call the get_time tool, then report the simulated operations time it returned in one sentence. Also say whether you have any tools other than get_time and record_note, and whether you were given any personal rules or CLAUDE.md files.',
    outputSchema: z.object({
      summary: z.string(),
      usedTool: z.boolean(),
      otherToolsAvailable: z.boolean(),
      sawPersonalRules: z.boolean(),
    }),
    mcpServers: {
      control: controlMcpServer({ runId: 'agent-smoke', tools: ['get_time', 'record_note'] }),
    },
    allowedTools: controlToolNames(['get_time', 'record_note']),
    timeoutMs: 180_000,
  });
  const init = result.transcript.find((m) => (m as { subtype?: string }).subtype === 'init') as {
    tools?: string[];
    mcp_servers?: unknown;
    skills?: unknown;
    plugins?: unknown;
  };
  console.log(
    JSON.stringify(
      {
        output: result.output,
        toolCalls: result.toolCalls,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        numTurns: result.numTurns,
        model: result.model,
        init: {
          tools: init?.tools,
          mcpServers: init?.mcp_servers,
          skills: init?.skills,
          plugins: init?.plugins,
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
