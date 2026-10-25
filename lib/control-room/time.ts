// Sim "now" for a request, and mapping real write times (block runs, cards) onto the sim timeline.

import { connection } from 'next/server';

import { getSimClock } from '@/lib/clock';
import { type ClockState, computeSimNow } from '@/lib/clock/math';
import type { PlaybookRun } from '@/lib/generated/prisma/client';

export type Now = { clock: ClockState; now: Date };

/** Sim now for this request; defers rendering to request time first. */
export async function loadNow(): Promise<Now> {
  await connection();
  const row = await getSimClock();
  const clock = { anchorSim: row.anchorSim, anchorReal: row.anchorReal, speed: row.speed };
  return { clock, now: computeSimNow({ clock }) };
}

/**
 * Sim time of something written at a real instant. Exact while the clock has not been re-anchored since;
 * older writes fall back to the run's sim start plus elapsed real time.
 */
export function simTimeOf(args: {
  real: Date;
  clock: ClockState;
  run?: Pick<PlaybookRun, 'createdAt' | 'simStartedAt'> | null;
}): Date {
  const { real, clock, run } = args;
  if (real.getTime() >= clock.anchorReal.getTime()) return computeSimNow({ clock, realNow: real });
  if (run?.simStartedAt)
    return new Date(run.simStartedAt.getTime() + (real.getTime() - run.createdAt.getTime()));
  return computeSimNow({ clock, realNow: real });
}

/** For stamps some writers store in sim time and others in real time (e.g. cards.decided_at). */
export function asSimTime(args: {
  at: Date;
  clock: ClockState;
  run?: Pick<PlaybookRun, 'createdAt' | 'simStartedAt'> | null;
}): Date {
  const { at, clock, run } = args;
  const simNow = computeSimNow({ clock }).getTime();
  const realNow = Date.now();
  const looksSim = Math.abs(at.getTime() - simNow) < Math.abs(at.getTime() - realNow);
  return looksSim ? at : simTimeOf({ real: at, clock, run });
}
