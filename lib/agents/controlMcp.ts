import { join } from 'path';

import type { McpServerConfig } from '@/lib/agents';

// Env the control MCP server's tools need (DB access, Jev); passed through when set.
const PASSTHROUGH_ENV = ['DATABASE_URL', 'DIRECT_URL', 'OPENROUTER_API_KEY', 'NODE_ENV'];

export function repoRoot(): string {
  return process.env.CONTROL_REPO_ROOT ?? process.cwd();
}

// Launch config for our `control` MCP server (mcp/server.ts via tsx with repo tsconfig paths).
export function controlMcpServer(
  args: {
    runId?: string;
    orderId?: string;
    blockId?: string;
    tools?: string[];
    env?: Record<string, string>;
  } = {}
): McpServerConfig {
  const { runId, orderId, blockId, tools, env } = args;
  const root = repoRoot();
  const passthrough = Object.fromEntries(
    PASSTHROUGH_ENV.flatMap((key) => (process.env[key] ? [[key, process.env[key] as string]] : []))
  );
  return {
    type: 'stdio',
    command: process.execPath,
    args: [
      join(root, 'node_modules/tsx/dist/cli.mjs'),
      '--tsconfig',
      join(root, 'tsconfig.json'),
      join(root, 'mcp/server.ts'),
    ],
    env: {
      ...passthrough,
      CONTROL_REPO_ROOT: root,
      ...(runId ? { CONTROL_RUN_ID: runId } : {}),
      ...(orderId ? { CONTROL_ORDER_ID: orderId } : {}),
      ...(blockId ? { CONTROL_BLOCK_ID: blockId } : {}),
      ...(tools?.length ? { CONTROL_TOOLS: tools.join(',') } : {}),
      ...env,
    },
  };
}

// Claude Code tool names for control MCP tools, e.g. get_time -> mcp__control__get_time.
export function controlToolNames(tools: string[]): string[] {
  return tools.map((tool) => `mcp__control__${tool}`);
}
