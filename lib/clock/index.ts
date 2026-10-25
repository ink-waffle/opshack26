import { BAHN_SNAPSHOT_AT } from '@/lib/bahn/collections';
import { computeSimNow, reanchor } from '@/lib/clock/math';
import type { SimClock } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prismaClient';

export * from '@/lib/clock/math';

export const SIM_CLOCK_ID = 'default';

/** Creates the clock row (anchored at the dataset snapshot, speed 1) only if it is missing. */
export async function ensureSimClock(): Promise<SimClock> {
  return prisma.simClock.upsert({
    where: { id: SIM_CLOCK_ID },
    create: { id: SIM_CLOCK_ID, anchorSim: BAHN_SNAPSHOT_AT, anchorReal: new Date(), speed: 1 },
    update: {},
  });
}

export async function getSimClock(): Promise<SimClock> {
  return (await prisma.simClock.findUnique({ where: { id: SIM_CLOCK_ID } })) ?? ensureSimClock();
}

/** Re-anchors the clock at real now; anchorSim defaults to the current sim time so only the speed changes. */
export async function setSimClock(args: { anchorSim?: Date; speed?: number }): Promise<SimClock> {
  const { anchorSim, speed } = args;
  const realNow = new Date();
  const next = reanchor({ clock: await getSimClock(), realNow, speed });
  const data = { anchorSim: anchorSim ?? next.anchorSim, anchorReal: realNow, speed: next.speed };
  return prisma.simClock.upsert({
    where: { id: SIM_CLOCK_ID },
    create: { id: SIM_CLOCK_ID, ...data },
    update: data,
  });
}

export async function simNow(): Promise<Date> {
  return computeSimNow({ clock: await getSimClock() });
}
