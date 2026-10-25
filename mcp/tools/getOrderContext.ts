import { listFacts } from '@/lib/playbooks/facts';
import { compactFacts, summarizeOrder } from '@/lib/playbooks/orderSummary';
import { requireOrder, toolNow } from '@/mcp/tools/context';
import { defineTool } from '@/mcp/types';

export const getOrderContext = defineTool({
  name: 'get_order_context',
  title: 'Get order context',
  description:
    'Compact summary of the current order (route, windows, driver, travel options and bookings, open alerts, recent messages) plus every recorded fact with its id, evidence level and source. Cite fact ids from here.',
  inputSchema: {},
  handler: async (_input, ctx) => {
    const [bundle, now] = await Promise.all([requireOrder(ctx), toolNow()]);
    const facts = await listFacts({ orderId: bundle.order.id });
    return {
      summary: `Read order ${bundle.order.reference}: ${facts.length} facts.`,
      simNow: now.toISOString(),
      order: summarizeOrder(bundle),
      facts: compactFacts(facts),
    };
  },
});
