import { getSimClock, realMsUntilSim } from '@/lib/clock';
import type { RuntimeAdapter } from '@/lib/playbooks/adapters';
import type { BlockExecutor } from '@/lib/playbooks/blocks/types';
import { nextCommitment } from '@/lib/playbooks/commitments';
import { toJson } from '@/lib/playbooks/json';
import { computeWaitDuration } from '@/lib/playbooks/waitDuration';
import { prisma } from '@/lib/prismaClient';

function numberParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// Re-read the clock between short sleeps, so the wait follows the sim clock: pausing holds it, speeding up ends it sooner.
const MAX_SLEEP_MS = 30_000;

async function waitUntilSim(args: { adapter: RuntimeAdapter; until: Date; blockRunId: string }) {
  const { adapter, until, blockRunId } = args;
  for (let step = 0; ; step++) {
    const remainingMs = realMsUntilSim({ clock: await getSimClock(), simAt: until });
    if (remainingMs <= 0) return;
    await adapter.waitFor({
      realMs: Math.min(remainingMs, MAX_SLEEP_MS),
      idempotencyKey: `wait:${blockRunId}:${step}`,
    });
  }
}

// Params `<blockId>.defaultMinutes` / `<blockId>.bufferMinutes` (PARAMETER amendments) override the block's numbers.
export const executeWaitBlock: BlockExecutor = async (args) => {
  const { block, ctx, adapter, blockRunId } = args;
  if (!block.wait) throw new Error(`Wait block ${block.id} has no wait config`);
  const defaultMinutes = numberParam(
    ctx.params[`${block.id}.defaultMinutes`],
    block.wait.defaultMinutes
  );
  const bufferMinutes = numberParam(
    ctx.params[`${block.id}.bufferMinutes`],
    block.wait.bufferMinutes
  );
  const commitment = block.nextCommitment
    ? await block.nextCommitment(ctx)
    : nextCommitment({ bundle: ctx.order, after: ctx.simNow });
  const clock = await getSimClock();
  const plan = computeWaitDuration({
    defaultMinutes,
    bufferMinutes,
    simNow: ctx.simNow,
    commitment,
    speed: clock.speed,
  });
  const input = {
    reason: plan.reason,
    simMinutes: plan.simMinutes,
    realSeconds: Math.round(plan.realMs / 1000),
    from: ctx.simNow.toISOString(),
    until: plan.until.toISOString(),
    commitment,
    speed: clock.speed,
  };
  await prisma.blockRun.update({
    where: { id: blockRunId },
    data: { status: 'WAITING', input: toJson(input) },
  });
  adapter.log(plan.reason, input);
  if (adapter.id === 'inline')
    await adapter.waitFor({ realMs: plan.realMs, idempotencyKey: `wait:${blockRunId}` });
  else await waitUntilSim({ adapter, until: plan.until, blockRunId });
  await ctx.services.refresh();
  return { output: { ...input, wokeAt: ctx.simNow.toISOString() }, input };
};
