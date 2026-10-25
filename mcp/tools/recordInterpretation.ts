import { z } from 'zod';

import { getFactsByIds, recordFact } from '@/lib/playbooks/facts';
import { requireOrder, toolNow } from '@/mcp/tools/context';
import { defineTool } from '@/mcp/types';

export const recordInterpretation = defineTool({
  name: 'record_interpretation',
  title: 'Record an interpretation',
  description:
    'Records your own reading of existing facts (e.g. "the driver accepts the later sailing if a hotel is arranged") as an AGENT_INTERPRETATION fact at STATED level, linked to the facts it is based on. It never proves anything above STATED.',
  inputSchema: {
    statement: z.string().min(5).max(500).describe('One plain sentence.'),
    basedOnFactIds: z.array(z.string()).min(1).describe('Fact ids this reading is based on.'),
  },
  handler: async (input, ctx) => {
    const bundle = await requireOrder(ctx);
    const now = await toolNow();
    const basis = await getFactsByIds({ ids: input.basedOnFactIds });
    const missing = input.basedOnFactIds.filter((id) => !basis.some((fact) => fact.id === id));
    if (missing.length) throw new Error(`Unknown fact ids: ${missing.join(', ')}`);
    const fact = await recordFact({
      orderId: bundle.order.id,
      runId: ctx.runId,
      kind: 'TOOL_RESULT',
      subject: `order:${bundle.order.reference}`,
      statement: `Agent reading (not evidence): ${input.statement}`,
      value: { basedOnFactIds: input.basedOnFactIds, blockId: ctx.blockId },
      level: 'STATED',
      sourceType: 'AGENT_INTERPRETATION',
      sourceRef: `agent:${ctx.blockId ?? 'agent'}:${ctx.runId ?? 'no-run'}`,
      observedAt: now,
      dedupeKey: `interpretation:${ctx.runId ?? bundle.order.id}:${input.statement}`,
    });
    return {
      summary: `Recorded interpretation: ${input.statement}`,
      factId: fact.id,
      factIds: [fact.id],
    };
  },
});
