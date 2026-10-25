import { z } from 'zod';

import { recordFacts } from '@/lib/playbooks/facts';
import { trainFact } from '@/lib/playbooks/quotes';
import { getTravelProvider } from '@/lib/providers';
import { notBefore, requireOrder, toolNow } from '@/mcp/tools/context';
import { defineTool } from '@/mcp/types';

export const searchTrains = defineTool({
  name: 'search_trains',
  title: 'Search trains',
  description:
    'Train connections between two cities (e.g. driver return or positioning travel). Each connection is written as a QUOTED fact (TRAVEL_QUOTE); returns fact ids. A quote is not a ticket.',
  inputSchema: {
    from: z.string().describe('Departure city.'),
    to: z.string().describe('Arrival city.'),
    earliest: z.string().optional().describe('ISO earliest departure; default now.'),
  },
  handler: async (input, ctx) => {
    const bundle = await requireOrder(ctx);
    const now = await toolNow();
    const earliest = notBefore({ iso: input.earliest, now });
    const connections = await getTravelProvider().searchTrains({
      from: input.from,
      to: input.to,
      earliest,
    });
    const facts = await recordFacts(
      connections.map((connection) =>
        trainFact({
          orderId: bundle.order.id,
          runId: ctx.runId,
          simNow: now,
          tool: 'search_trains',
          connection,
        })
      )
    );
    return {
      summary: `Searched trains ${input.from} → ${input.to} from ${earliest.toISOString()}: ${connections.length} connections.`,
      connections: connections.map((connection, index) => ({
        factId: facts[index].id,
        ...connection,
      })),
      factIds: facts.map((fact) => fact.id),
    };
  },
});
