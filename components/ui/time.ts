import type { Tone } from '@/components/ui/tone';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// "2 d 4 h", "3 h 12 min", "42 min", "8 min 05 s", "40 s". Never a clock-like "8:05".
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  if (abs >= 2 * DAY) {
    const d = Math.floor(abs / DAY);
    const h = Math.floor((abs % DAY) / HOUR);
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  if (abs >= HOUR) {
    const h = Math.floor(abs / HOUR);
    const m = Math.floor((abs % HOUR) / MIN);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  if (abs >= 10 * MIN) return `${Math.floor(abs / MIN)} min`;
  if (abs >= MIN) {
    const m = Math.floor(abs / MIN);
    const s = Math.floor((abs % MIN) / 1000);
    return `${m} min ${String(s).padStart(2, '0')} s`;
  }
  return `${Math.max(0, Math.floor(abs / 1000))} s`;
}

export type CountdownThresholds = { warnBelowMs?: number; dangerBelowMs?: number };

export const DEFAULT_WARN_BELOW_MS = 60 * MIN;
export const DEFAULT_DANGER_BELOW_MS = 15 * MIN;

export function countdownTone(remainingMs: number | null, args: CountdownThresholds = {}): Tone {
  const { warnBelowMs = DEFAULT_WARN_BELOW_MS, dangerBelowMs = DEFAULT_DANGER_BELOW_MS } = args;
  if (remainingMs === null) return 'neutral';
  if (remainingMs <= dangerBelowMs) return 'danger';
  if (remainingMs <= warnBelowMs) return 'warn';
  return 'neutral';
}

// Promise slack: positive = time to spare before the customer promise, negative = late.
export function slackTone(slackMs: number): Tone {
  if (slackMs < 0) return 'danger';
  if (slackMs < 4 * HOUR) return 'warn';
  return 'ok';
}
