import { z } from 'zod';

import { recordFacts } from '@/lib/playbooks/facts';
import { ferryFact } from '@/lib/playbooks/quotes';
import { getTravelProvider } from '@/lib/providers';
import { notBefore, requireOrder, toolNow } from '@/mcp/tools/context';
import { defineTool } from '@/mcp/types';

export const searchFerries = defineTool({
  name: 'search_ferries',
  title: 'Search ferry sailings',
  description:
    'Fresh vehicle-space check for ferry sailings between two terminals (names like "West Baltic terminal", terminal ids or port cities). Every sailing found is written as a QUOTED fact (FERRY_QUOTE or FERRY_SOLD_OUT) checked now; returns their fact ids. A quote is not a booking.',
  inputSchema: {
    fromPort: z.string().describe('Departure terminal or port city.'),
    toPort: z.string().describe('Arrival terminal or port city.'),
    earliest: z
      .string()
      .optional()
      .describe('ISO time the car can be at the terminal; default now.'),
    days: z.number().int().min(1).max(5).optional().describe('Days to search (default 3).'),
  },
  handler: async (input, ctx) => {
    const bundle = await requireOrder(ctx);
    const now = await toolNow();
    const earliest = notBefore({ iso: input.earliest, now });
    const sailings = await getTravelProvider().searchFerries({
      fromPort: input.fromPort,
      toPort: input.toPort,
      earliest,
      days: input.days,
    });
    // Road time from this order's pickup to the departure terminal, from its own ferry records.
    const roadHours = (label: string) =>
      bundle.travelOptions.find((o) => o.kind === 'FERRY' && o.fromCity === label)
        ?.roadTimeToTerminalHours ?? null;
    const facts = await recordFacts(
      sailings.map((sailing) =>
        ferryFact({
          roadTimeToTerminalHours: roadHours(sailing.from.label),
          orderId: bundle.order.id,
          runId: ctx.runId,
          simNow: now,
          tool: 'search_ferries',
          sailing,
        })
      )
    );
    const available = sailings.filter((sailing) => sailing.status === 'AVAILABLE').length;
    return {
      summary: `Searched ferries ${input.fromPort} → ${input.toPort} from ${earliest.toISOString()}: ${sailings.length} sailings, ${available} with vehicle space.`,
      checkedAt: now.toISOString(),
      sailings: sailings.map((sailing, index) => ({
        factId: facts[index].id,
        operator: sailing.operator,
        departureAt: sailing.departureAt,
        arrivalAt: sailing.arrivalAt,
        checkInCutoffAt: sailing.checkInCutoffAt,
        status: sailing.status,
        priceCents: sailing.priceCents,
        vehicleSpaces: sailing.vehicleSpaces,
        statement: facts[index].statement,
      })),
      factIds: facts.map((fact) => fact.id),
    };
  },
});
