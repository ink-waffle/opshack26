import { describe, expect, it } from 'vitest';

import { MINUTE_MS } from '@/lib/clock/math';
import { computeWaitDuration } from '@/lib/playbooks/waitDuration';

const simNow = new Date('2026-10-22T09:00:00Z');
const inMinutes = (minutes: number) => new Date(simNow.getTime() + minutes * MINUTE_MS);

describe('computeWaitDuration', () => {
  it('waits the default when there is no commitment', () => {
    const plan = computeWaitDuration({
      defaultMinutes: 120,
      bufferMinutes: 20,
      simNow,
      commitment: null,
      speed: 1,
    });
    expect(plan.simMinutes).toBe(120);
    expect(plan.shortened).toBe(false);
    expect(plan.realMs).toBe(120 * MINUTE_MS);
    expect(plan.until.toISOString()).toBe('2026-10-22T11:00:00.000Z');
    expect(plan.reason).toMatch(/no upcoming commitment/);
  });

  it('shortens to the next commitment minus the buffer', () => {
    const plan = computeWaitDuration({
      defaultMinutes: 120,
      bufferMinutes: 20,
      simNow,
      commitment: { at: inMinutes(65), reason: "driver's train departs" },
      speed: 1,
    });
    expect(plan.simMinutes).toBe(45);
    expect(plan.shortened).toBe(true);
    expect(plan.reason).toBe(
      "waiting 45 min (sim) instead of 120: driver's train departs at 22 Oct, 10:05 UTC, 20 min buffer"
    );
  });

  it('keeps the default when the commitment is further away', () => {
    const plan = computeWaitDuration({
      defaultMinutes: 120,
      bufferMinutes: 20,
      simNow,
      commitment: { at: inMinutes(600), reason: 'pickup slot starts' },
      speed: 1,
    });
    expect(plan.simMinutes).toBe(120);
    expect(plan.shortened).toBe(false);
  });

  it('never waits a negative time when the commitment is inside the buffer', () => {
    const plan = computeWaitDuration({
      defaultMinutes: 120,
      bufferMinutes: 30,
      simNow,
      commitment: { at: inMinutes(10), reason: 'check-in cutoff' },
      speed: 1,
    });
    expect(plan.simMinutes).toBe(0);
    expect(plan.realMs).toBe(0);
  });

  it('converts sim minutes to real time with the clock speed', () => {
    const plan = computeWaitDuration({
      defaultMinutes: 120,
      bufferMinutes: 0,
      simNow,
      commitment: null,
      speed: 60,
    });
    expect(plan.realMs).toBe(2 * MINUTE_MS);
  });

  it('falls back to speed 1 when the clock is paused', () => {
    const plan = computeWaitDuration({
      defaultMinutes: 30,
      bufferMinutes: 0,
      simNow,
      commitment: null,
      speed: 0,
    });
    expect(plan.realMs).toBe(30 * MINUTE_MS);
  });
});
