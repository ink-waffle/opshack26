import { z } from 'zod';

import { recordFacts } from '@/lib/playbooks/facts';
import { hotelFact } from '@/lib/playbooks/quotes';
import { getTravelProvider } from '@/lib/providers';
import { requireOrder, toolNow } from '@/mcp/tools/context';
import { defineTool } from '@/mcp/types';

export const searchHotels = defineTool({
  name: 'search_hotels',
  title: 'Search hotels',
  description:
    'Hotels near a place (a ferry terminal, a city) for the driver, with secured parking info. Each offer is written as a QUOTED fact (TRAVEL_QUOTE, mode HOTEL); returns fact ids. Nothing is booked.',
  inputSchema: {
    near: z.string().describe('Place, e.g. "West Baltic terminal" or "Helsinki".'),
    checkIn: z.string().describe('ISO date or time of check-in.'),
    nights: z.number().int().min(1).max(7).describe('Number of nights.'),
  },
  handler: async (input, ctx) => {
    const bundle = await requireOrder(ctx);
    const now = await toolNow();
    const checkIn = new Date(input.checkIn);
    if (Number.isNaN(checkIn.getTime())) throw new Error(`Invalid checkIn: ${input.checkIn}`);
    const hotels = await getTravelProvider().searchHotels({
      near: input.near,
      checkIn,
      nights: input.nights,
    });
    const facts = await recordFacts(
      hotels.map((hotel) =>
        hotelFact({
          orderId: bundle.order.id,
          runId: ctx.runId,
          simNow: now,
          tool: 'search_hotels',
          hotel,
        })
      )
    );
    return {
      summary: `Searched hotels near ${input.near} for ${input.nights} night(s) from ${input.checkIn}: ${hotels.filter((h) => h.available).length} of ${hotels.length} available.`,
      hotels: hotels.map((hotel, index) => ({ factId: facts[index].id, ...hotel })),
      factIds: facts.map((fact) => fact.id),
    };
  },
});
