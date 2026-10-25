import { z } from 'zod';

import type { OrderBundle } from '@/lib/bahn';
import type { Fact } from '@/lib/generated/prisma/client';
import { recordFacts } from '@/lib/playbooks/facts';
import { type BackupCandidate, getDriverPoolProvider } from '@/lib/providers';
import { requireOrder, toolNow } from '@/mcp/tools/context';
import { defineTool } from '@/mcp/types';

const HOUR_MS = 3_600_000;

export type BackupSearch = {
  pickupCity: string | null;
  busyFrom: string | null;
  busyUntil: string | null;
  candidates: (BackupCandidate & { factId: string })[];
  facts: Fact[];
};

/** Pool search around the order's pickup; every candidate becomes a QUOTED TOOL_RESULT fact (free at the check, not asked). */
export async function searchBackupDrivers(args: {
  bundle: OrderBundle;
  runId: string | null;
  now: Date;
  limit?: number;
}): Promise<BackupSearch> {
  const { bundle, runId, now, limit = 3 } = args;
  const pickup = bundle.addresses.find((address) => address.id === bundle.order.pickupAddressId);
  const slot = bundle.timeWindows.find(
    (window) => window.purpose === 'SELECTED_PICKUP_SLOT' && window.isSelected
  );
  const promise = bundle.timeWindows.find(
    (window) => window.purpose === 'CUSTOMER_DELIVERY_PROMISE' && window.isSelected
  );
  if (!pickup || !slot)
    return {
      pickupCity: pickup?.city ?? null,
      busyFrom: null,
      busyUntil: null,
      candidates: [],
      facts: [],
    };
  const busyFrom = new Date(slot.startAt.getTime() - 2 * HOUR_MS);
  const busyUntil = promise?.endAt ?? new Date(slot.endAt.getTime() + 24 * HOUR_MS);
  const current = bundle.assignments
    .filter((assignment) => assignment.status !== 'CANCELLED')
    .map((assignment) => assignment.driverId);
  const found = await getDriverPoolProvider().findBackups({
    pickupCity: pickup.city,
    pickupCountry: pickup.country,
    busyFrom,
    busyUntil,
    excludeDriverIds: current,
    limit,
  });
  const facts = await recordFacts(
    found.map((candidate) => ({
      orderId: bundle.order.id,
      runId,
      kind: 'TOOL_RESULT',
      subject: `driver:${candidate.driverId}`,
      statement: `${candidate.name} (${candidate.driverId}, based in ${candidate.homeCity}) has no open duty in Bahn's records around this pickup; ${candidate.proximity === 'SAME_CITY' ? `about ${Math.round(candidate.reachMinutes / 5) * 5} min` : `roughly ${Math.round(candidate.reachMinutes / 30) / 2} h (estimate)`} from ${pickup.city}, acceptance likelihood ${candidate.likelihood.toLowerCase()}. Not asked, no offer sent.`,
      value: {
        tool: 'find_backup_drivers',
        ...candidate,
        pickupCity: pickup.city,
        checkedAt: now.toISOString(),
      },
      level: 'QUOTED',
      sourceType: 'TOOL',
      sourceRef: `tool:find_backup_drivers:${candidate.driverId}`,
      observedAt: now,
      dedupeKey: `tool:find_backup_drivers:${runId ?? bundle.order.id}:${candidate.driverId}`,
    }))
  );
  return {
    pickupCity: pickup.city,
    busyFrom: busyFrom.toISOString(),
    busyUntil: busyUntil.toISOString(),
    candidates: found.map((candidate, index) => ({ ...candidate, factId: facts[index].id })),
    facts,
  };
}

export const findBackupDrivers = defineTool({
  name: 'find_backup_drivers',
  title: 'Find backup drivers',
  description:
    "Searches the driver pool for backups near the order's pickup who have no overlapping duty. Each candidate is written as a QUOTED fact (TOOL_RESULT, free at the moment of the check); nobody is asked and no offer is sent. Use the fact id in a MARKET (directed offer) action.",
  inputSchema: {
    limit: z.number().int().min(1).max(5).optional().describe('How many candidates (default 3).'),
  },
  handler: async (input, ctx) => {
    const bundle = await requireOrder(ctx);
    const now = await toolNow();
    const result = await searchBackupDrivers({ bundle, runId: ctx.runId, now, limit: input.limit });
    return {
      summary: result.candidates.length
        ? `Found ${result.candidates.length} possible backup drivers near ${result.pickupCity}: ${result.candidates.map((c) => `${c.name} (${c.homeCity}, ~${c.reachMinutes} min)`).join(', ')}.`
        : `No free backup driver found near ${result.pickupCity ?? 'the pickup'}.`,
      candidates: result.candidates.map(({ basis: _basis, ...candidate }) => candidate),
      factIds: result.facts.map((fact) => fact.id),
    };
  },
});
