// Pure sim-clock math (no DB): import from '@/lib/clock/math' in client components.

import type { SimClock } from '@/lib/generated/prisma/client';

export type ClockState = Pick<SimClock, 'anchorSim' | 'anchorReal' | 'speed'>;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/** simNow = anchorSim + (realNow - anchorReal) * speed. */
export function computeSimNow(args: { clock: ClockState; realNow?: Date }): Date {
  const { clock, realNow = new Date() } = args;
  const elapsedRealMs = realNow.getTime() - clock.anchorReal.getTime();
  return new Date(clock.anchorSim.getTime() + elapsedRealMs * clock.speed);
}

/** Real milliseconds that pass while the sim clock advances simMs; Infinity when the clock is paused. */
export function simMsToRealMs(args: { simMs: number; speed: number }): number {
  const { simMs, speed } = args;
  if (speed <= 0) return Number.POSITIVE_INFINITY;
  return simMs / speed;
}

export function realMsToSimMs(args: { realMs: number; speed: number }): number {
  const { realMs, speed } = args;
  return realMs * Math.max(speed, 0);
}

/** Real instant at which the sim clock reaches simAt (null when paused and simAt is ahead). */
export function simToRealDate(args: { clock: ClockState; simAt: Date }): Date | null {
  const { clock, simAt } = args;
  const simAheadMs = simAt.getTime() - clock.anchorSim.getTime();
  if (clock.speed <= 0) return simAheadMs <= 0 ? clock.anchorReal : null;
  return new Date(clock.anchorReal.getTime() + simAheadMs / clock.speed);
}

/** Real milliseconds to wait until the sim clock reaches simAt (0 if already past, Infinity if paused). */
export function realMsUntilSim(args: { clock: ClockState; simAt: Date; realNow?: Date }): number {
  const { clock, simAt, realNow = new Date() } = args;
  const target = simToRealDate({ clock, simAt });
  if (!target) return Number.POSITIVE_INFINITY;
  return Math.max(0, target.getTime() - realNow.getTime());
}

/** Clock re-anchored at realNow, keeping sim time continuous (use before changing speed). */
export function reanchor(args: { clock: ClockState; realNow?: Date; speed?: number }): ClockState {
  const { clock, realNow = new Date(), speed = clock.speed } = args;
  return { anchorSim: computeSimNow({ clock, realNow }), anchorReal: realNow, speed };
}
