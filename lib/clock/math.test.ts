import { describe, expect, it } from 'vitest';

import {
  computeSimNow,
  HOUR_MS,
  MINUTE_MS,
  realMsToSimMs,
  realMsUntilSim,
  reanchor,
  simMsToRealMs,
  simToRealDate,
} from '@/lib/clock/math';

const anchorSim = new Date('2026-10-21T09:00:00Z');
const anchorReal = new Date('2026-10-25T01:00:00Z');
const at = (realMs: number) => new Date(anchorReal.getTime() + realMs);

describe('computeSimNow', () => {
  it('returns the anchor at the anchor instant', () => {
    expect(
      computeSimNow({ clock: { anchorSim, anchorReal, speed: 1 }, realNow: anchorReal })
    ).toEqual(anchorSim);
  });

  it('advances at real speed when speed is 1', () => {
    const now = computeSimNow({
      clock: { anchorSim, anchorReal, speed: 1 },
      realNow: at(5 * MINUTE_MS),
    });
    expect(now.toISOString()).toBe('2026-10-21T09:05:00.000Z');
  });

  it('multiplies elapsed real time by speed', () => {
    const now = computeSimNow({
      clock: { anchorSim, anchorReal, speed: 60 },
      realNow: at(MINUTE_MS),
    });
    expect(now.toISOString()).toBe('2026-10-21T10:00:00.000Z');
  });

  it('stands still when paused', () => {
    expect(
      computeSimNow({ clock: { anchorSim, anchorReal, speed: 0 }, realNow: at(HOUR_MS) })
    ).toEqual(anchorSim);
  });
});

describe('duration conversion', () => {
  it('converts sim to real and back', () => {
    expect(simMsToRealMs({ simMs: 2 * HOUR_MS, speed: 120 })).toBe(MINUTE_MS);
    expect(realMsToSimMs({ realMs: MINUTE_MS, speed: 120 })).toBe(2 * HOUR_MS);
  });

  it('treats a paused clock as an infinite wait', () => {
    expect(simMsToRealMs({ simMs: MINUTE_MS, speed: 0 })).toBe(Number.POSITIVE_INFINITY);
    expect(realMsToSimMs({ realMs: MINUTE_MS, speed: 0 })).toBe(0);
  });
});

describe('simToRealDate / realMsUntilSim', () => {
  const clock = { anchorSim, anchorReal, speed: 30 };

  it('maps a future sim instant to the real instant it will be reached', () => {
    const real = simToRealDate({ clock, simAt: new Date('2026-10-21T10:00:00Z') });
    expect(real?.getTime()).toBe(anchorReal.getTime() + 2 * MINUTE_MS);
  });

  it('waits the remaining real time and never negative', () => {
    const simAt = new Date('2026-10-21T10:00:00Z');
    expect(realMsUntilSim({ clock, simAt, realNow: at(MINUTE_MS) })).toBe(MINUTE_MS);
    expect(realMsUntilSim({ clock, simAt, realNow: at(10 * MINUTE_MS) })).toBe(0);
  });

  it('returns Infinity for a future instant on a paused clock', () => {
    const paused = { anchorSim, anchorReal, speed: 0 };
    expect(realMsUntilSim({ clock: paused, simAt: new Date('2026-10-21T10:00:00Z') })).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(simToRealDate({ clock: paused, simAt: anchorSim })).toEqual(anchorReal);
  });
});

describe('reanchor', () => {
  it('keeps sim time continuous when the speed changes', () => {
    const clock = { anchorSim, anchorReal, speed: 10 };
    const realNow = at(6 * MINUTE_MS);
    const before = computeSimNow({ clock, realNow });
    const next = reanchor({ clock, realNow, speed: 100 });
    expect(next.anchorSim).toEqual(before);
    expect(next.anchorReal).toEqual(realNow);
    expect(computeSimNow({ clock: next, realNow: at(7 * MINUTE_MS) }).getTime()).toBe(
      before.getTime() + 100 * MINUTE_MS
    );
  });
});
