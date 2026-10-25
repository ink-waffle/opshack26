import { z } from 'zod';

import { listFacts as listOrderFacts } from '@/lib/playbooks/facts';
import { compactFacts } from '@/lib/playbooks/orderSummary';
import { requireOrder } from '@/mcp/tools/context';
import { defineTool } from '@/mcp/types';

export const listFacts = defineTool({
  name: 'list_facts',
  title: 'List facts',
  description:
    'Facts recorded for the current order, optionally only some kinds (e.g. FERRY_QUOTE, FERRY_SOLD_OUT, BOOKING_OUTCOME_UNKNOWN, BOOKING_RECONCILED, DRIVER_STATEMENT, PROMISE_WINDOW) or a subject substring. Each fact has id, kind, level, statement, observedAt and source.',
  inputSchema: {
    kinds: z.array(z.string()).optional().describe('Fact kinds to include; omit for all.'),
    subjectContains: z
      .string()
      .optional()
      .describe('Substring of the fact subject, e.g. "ferry:" or "driver:".'),
  },
  handler: async (input, ctx) => {
    const bundle = await requireOrder(ctx);
    const facts = await listOrderFacts({ orderId: bundle.order.id, kinds: input.kinds });
    const filtered = input.subjectContains
      ? facts.filter((fact) => fact.subject.includes(input.subjectContains as string))
      : facts;
    return { summary: `Listed ${filtered.length} facts.`, facts: compactFacts(filtered) };
  },
});
