// Shared helpers for control tools: the run's order, sim now, and the playbook run id facts are filed under.

import { getOrderBundle, type OrderBundle } from '@/lib/bahn';
import { simNow } from '@/lib/clock';
import type { ToolContext } from '@/mcp/types';

export async function requireOrder(ctx: ToolContext): Promise<OrderBundle> {
  if (!ctx.orderId) throw new Error('No order in this tool context (CONTROL_ORDER_ID is unset).');
  const bundle = await getOrderBundle({ ref: ctx.orderId });
  if (!bundle) throw new Error(`Unknown order ${ctx.orderId}`);
  return bundle;
}

export async function toolNow(): Promise<Date> {
  return simNow();
}

/** ISO input → Date, never earlier than sim now. */
export function notBefore(args: { iso?: string; now: Date }): Date {
  const { iso, now } = args;
  const parsed = iso ? new Date(iso) : now;
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid time: ${iso}`);
  return parsed < now ? now : parsed;
}
