import { z } from 'zod';

import { recordFacts } from '@/lib/playbooks/facts';
import { getRoadsideProvider } from '@/lib/providers';
import { requireOrder, toolNow } from '@/mcp/tools/context';
import { defineTool } from '@/mcp/types';

export const findRoadside = defineTool({
  name: 'find_roadside',
  title: 'Find roadside help',
  description:
    'Roadside-assistance and tow candidates near a reported location, for the owner to choose from. Written as QUOTED facts (TOOL_RESULT); nothing is booked or called.',
  inputSchema: { location: z.string().describe('Reported location, e.g. a service area or city.') },
  handler: async (input, ctx) => {
    const bundle = await requireOrder(ctx);
    const now = await toolNow();
    const options = await getRoadsideProvider().find({ location: input.location });
    const facts = await recordFacts(
      options.map((option) => ({
        orderId: bundle.order.id,
        runId: ctx.runId,
        kind: 'TOOL_RESULT',
        subject: `roadside:${option.providerId}`,
        statement: `${option.name} (${option.kind === 'TOW' ? 'tow' : 'roadside assistance'}) can reach ${input.location} in about ${option.etaMinutes} min; ${option.coverage} Not booked.`,
        value: { tool: 'find_roadside', location: input.location, ...option },
        level: 'QUOTED',
        sourceType: 'TOOL',
        sourceRef: `tool:find_roadside:${option.providerId}`,
        observedAt: now,
        dedupeKey: `tool:find_roadside:${ctx.runId ?? bundle.order.id}:${option.providerId}:${now.toISOString()}`,
      }))
    );
    return {
      summary: `Found ${options.length} roadside/tow candidates near ${input.location}.`,
      options: options.map((option, index) => ({ factId: facts[index].id, ...option })),
      factIds: facts.map((fact) => fact.id),
    };
  },
});
