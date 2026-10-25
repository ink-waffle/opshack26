'use client';

import { useState, useSyncExternalStore } from 'react';

import { type ClockState, computeSimNow } from '@/lib/clock/math';

// One shared 1 s ticker for every live clock on the page.
let tick = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      tick = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  if (tick === 0) tick = Date.now();
  return tick;
}

function getServerSnapshot(): number | null {
  return null;
}

// Real wall-clock ms, ticking each second; null during SSR and hydration.
export function useRealNow(): number | null {
  return useSyncExternalStore<number | null>(subscribe, getSnapshot, getServerSnapshot);
}

export type SimNowSource = {
  nowMs?: number;
  speed?: number;
  clock?: ClockState;
  now?: () => number;
};

// Sim time from (in order): a now() function, a clock anchor, or nowMs advanced since mount at speed.
export function useSimNow(args: SimNowSource): number | null {
  const { nowMs, speed = 1, clock, now } = args;
  const real = useRealNow();
  const [mountReal, setMountReal] = useState<number | null>(null);
  if (real !== null && mountReal === null) setMountReal(real);
  if (real === null) return nowMs ?? null;
  if (now) return now();
  if (clock) return computeSimNow({ clock, realNow: new Date(real) }).getTime();
  if (nowMs === undefined) return real;
  return nowMs + (real - (mountReal ?? real)) * speed;
}
