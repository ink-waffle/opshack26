import { simNow } from '@/lib/clock';
import { defineTool } from '@/mcp/types';

export const getTime = defineTool({
  name: 'get_time',
  title: 'Get current time',
  description:
    'Returns the current simulated operations time (simNow, the clock all deadlines use) and the real wall-clock time, both ISO 8601 UTC.',
  inputSchema: {},
  handler: async (_input, ctx) => {
    const sim = await simNow().catch(() => null);
    return {
      simNow: sim?.toISOString() ?? null,
      realNow: new Date().toISOString(),
      runId: ctx.runId,
    };
  },
});
