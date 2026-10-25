// Spawns the `control` MCP server like the agent runner does, lists its tools and calls one: `pnpm mcp:smoke [tool] [argsJson]`.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tmpdir } from 'os';

import { controlMcpServer } from '@/lib/agents/controlMcp';

async function main() {
  const [toolName = 'get_time', rawArgs = '{}'] = process.argv.slice(2);
  const config = controlMcpServer({ runId: 'smoke', orderId: 'CD-420299' });
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...(process.env as Record<string, string>), ...config.env },
    cwd: tmpdir(),
    stderr: 'inherit',
  });
  const client = new Client({ name: 'mcp-smoke', version: '0.0.1' });
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log('tools:', tools.map((tool) => tool.name).join(', '));
  const result = await client.callTool({ name: toolName, arguments: JSON.parse(rawArgs) });
  console.log(JSON.stringify(result, null, 2));
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
