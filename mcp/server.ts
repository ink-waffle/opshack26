// stdio MCP server `control`: exposes our tools to agent blocks. Run: tsx --tsconfig <repo>/tsconfig.json mcp/server.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { controlTools } from '@/mcp/tools';
import type { ControlTool, ToolContext } from '@/mcp/types';

function readContext(): ToolContext {
  return {
    runId: process.env.CONTROL_RUN_ID || null,
    orderId: process.env.CONTROL_ORDER_ID || null,
    blockId: process.env.CONTROL_BLOCK_ID || null,
  };
}

// CONTROL_TOOLS (comma-separated tool names) narrows the exposed set; unset exposes every tool.
function selectTools(): ControlTool[] {
  const wanted = (process.env.CONTROL_TOOLS ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (wanted.length === 0) return controlTools;
  const unknown = wanted.filter((name) => !controlTools.some((tool) => tool.name === name));
  if (unknown.length > 0)
    console.error(`[control] unknown tools in CONTROL_TOOLS: ${unknown.join(', ')}`);
  return controlTools.filter((tool) => wanted.includes(tool.name));
}

async function main() {
  const ctx = readContext();
  const server = new McpServer({ name: 'control', version: '0.1.0' });

  for (const tool of selectTools()) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
      async (input: unknown) => {
        try {
          const result = await tool.handler(input ?? {}, ctx);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[control] ${tool.name} failed: ${message}`);
          return { isError: true, content: [{ type: 'text' as const, text: `Error: ${message}` }] };
        }
      }
    );
  }

  await server.connect(new StdioServerTransport());
  console.error(`[control] ready run=${ctx.runId ?? '-'} order=${ctx.orderId ?? '-'}`);
}

main().catch((error) => {
  console.error('[control] fatal', error);
  process.exit(1);
});
