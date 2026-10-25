// DB convenience: load bundle, facts and driver duties, then run the pure calculator.

import { getDriverDuties, getOrderBundle } from '@/lib/bahn';
import { computeChain, deriveDecideBy } from '@/lib/chain/compute';
import type { ChainOption, ChainParameters, ChainResult } from '@/lib/chain/types';
import { listOrderFacts } from '@/lib/facts/store';

async function loadInputs(args: { ref: string; extraDriverIds?: string[] }) {
  const { ref, extraDriverIds = [] } = args;
  const bundle = await getOrderBundle({ ref });
  if (!bundle) throw new Error(`Unknown order ${ref}`);
  const driverIds = [...new Set([...bundle.assignments.map((a) => a.driverId), ...extraDriverIds])];
  const [facts, duties] = await Promise.all([
    listOrderFacts({ orderId: bundle.order.id }),
    Promise.all(driverIds.map((driverId) => getDriverDuties({ driverId }))),
  ]);
  return { bundle, facts, duties };
}

/** computeChain for an order by id or reference; falls back to projected facts when none are synced. */
export async function computeChainForOrder(args: {
  ref: string;
  option: ChainOption;
  now: Date;
  parameters?: Partial<ChainParameters>;
}): Promise<ChainResult> {
  const { ref, option, now, parameters } = args;
  const extra = option.type === 'REPLACE_DRIVER' ? [option.driverId] : [];
  const { bundle, facts, duties } = await loadInputs({ ref, extraDriverIds: extra });
  return computeChain({
    bundle,
    facts: facts.length ? facts : undefined,
    option,
    now,
    duties,
    parameters,
  });
}

/** deriveDecideBy for an order by id or reference. */
export async function deriveDecideByForOrder(args: { ref: string; now: Date }) {
  const { ref, now } = args;
  const { bundle, facts } = await loadInputs({ ref });
  return deriveDecideBy({ bundle, facts: facts.length ? facts : undefined, now });
}
