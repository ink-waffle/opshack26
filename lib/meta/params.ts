// Approved PARAMETER amendments that live outside a playbook run: the watchman's routing thresholds.

import { prisma } from '@/lib/prismaClient';
import { ROUTING_PARAMS, type RoutingParams } from '@/lib/watchman/routing';
import type { TriggerType } from '@/lib/watchman/taxonomy';

const ROUTING_KEY = /^routing\.([A-Z_]+)\.threshold$/;

/** Routing params with `routing.<TRIGGER>.threshold` / `routing.needsAttentionThreshold` overrides applied (pure). */
export function applyRoutingOverrides(args: {
  base?: RoutingParams;
  parameters: Record<string, unknown>;
}): RoutingParams {
  const { base = ROUTING_PARAMS, parameters } = args;
  const next: RoutingParams = {
    ...base,
    triggers: { ...base.triggers },
    triageSources: [...base.triageSources],
  };
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (key === 'routing.needsAttentionThreshold') next.needsAttentionThreshold = value;
    const match = ROUTING_KEY.exec(key);
    const trigger = match?.[1] as TriggerType | undefined;
    if (trigger && next.triggers[trigger])
      next.triggers[trigger] = { ...next.triggers[trigger], threshold: value };
  }
  return next;
}

/** ROUTING_PARAMS with every approved routing amendment applied, in approval order. */
export async function resolveRoutingParams(): Promise<RoutingParams> {
  const amendments = await prisma.amendment.findMany({
    where: { kind: 'PARAMETER', status: 'APPROVED' },
    orderBy: [{ decidedAt: 'asc' }, { createdAt: 'asc' }],
  });
  const parameters: Record<string, unknown> = {};
  for (const amendment of amendments)
    if (amendment.parameters && typeof amendment.parameters === 'object')
      for (const [key, value] of Object.entries(amendment.parameters))
        if (key.startsWith('routing.')) parameters[key] = value;
  return applyRoutingOverrides({ parameters });
}
