import { z } from 'zod';

import { askParty } from '@/mcp/tools/conversation';
import { defineTool } from '@/mcp/types';

export const askDriver = defineTool({
  name: 'ask_driver',
  title: 'Ask the driver',
  description:
    "Sends a short question to the order's assigned driver in the driver chat and returns their reply. The reply is recorded as a STATED fact (DRIVER_STATEMENT) with the driver as speaker; cite its fact id. Ask one clear question; never give mechanical or driving advice.",
  inputSchema: {
    question: z.string().min(5).max(600).describe('The exact message to the driver.'),
  },
  handler: async (input, ctx) => askParty({ ctx, party: 'driver', question: input.question }),
});
