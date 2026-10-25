import { z } from 'zod';

import { askParty } from '@/mcp/tools/conversation';
import { defineTool } from '@/mcp/types';

export const askSite = defineTool({
  name: 'ask_site',
  title: 'Ask the pickup site',
  description:
    "Sends a short question to the order's pickup site contact and returns their reply, recorded as a STATED fact (SITE_STATEMENT); cite its fact id.",
  inputSchema: { question: z.string().min(5).max(600).describe('The exact message to the site.') },
  handler: async (input, ctx) => askParty({ ctx, party: 'site', question: input.question }),
});
