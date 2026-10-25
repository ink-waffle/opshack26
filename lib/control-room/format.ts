// Pure display helpers for the control room (no DB): times with zone, plain words, decide-by text.

import { plainText } from '@/lib/text';

// Bahn's dispatch desk works from Helsinki; every UI time names its zone and keeps UTC in a tooltip.
export const OPERATOR_TZ = 'Europe/Helsinki';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { hourCycle: 'h23', ...options });
    formatters.set(key, f);
  }
  return f;
}

function parts(args: { at: Date; timeZone: string }) {
  const { at, timeZone } = args;
  const list = formatter(`parts:${timeZone}`, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    list.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: pick('weekday'),
    day: pick('day'),
    month: pick('month'),
    time: `${pick('hour')}:${pick('minute')}`,
    zone: pick('timeZoneName'),
  };
}

/** "09:42 EEST". */
export function formatTime(args: { at: Date; timeZone?: string }): string {
  const { at, timeZone = OPERATOR_TZ } = args;
  const p = parts({ at, timeZone });
  return `${p.time} ${p.zone}`;
}

/** "Wed 21 Oct, 09:42 EEST". */
export function formatDayTime(args: { at: Date; timeZone?: string }): string {
  const { at, timeZone = OPERATOR_TZ } = args;
  const p = parts({ at, timeZone });
  return `${p.weekday} ${p.day} ${p.month}, ${p.time} ${p.zone}`;
}

/** "Wed 21 Oct". */
export function formatDay(args: { at: Date; timeZone?: string }): string {
  const { at, timeZone = OPERATOR_TZ } = args;
  const p = parts({ at, timeZone });
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** Time of day when it is the same sim day, else day and time. */
export function formatWhen(args: { at: Date; now: Date; timeZone?: string }): string {
  const { at, now, timeZone = OPERATOR_TZ } = args;
  return formatDay({ at, timeZone }) === formatDay({ at: now, timeZone })
    ? formatTime({ at, timeZone })
    : formatDayTime({ at, timeZone });
}

/** "21 Oct 2026, 06:42 UTC", for tooltips. */
export function formatUtc(at: Date): string {
  const p = formatter('utc', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
  return `${p} UTC`;
}

/** "Tue 27 Oct, 13:00–15:00 EET" in the window's own zone. */
export function formatWindow(args: { startAt: Date; endAt: Date; timeZone?: string }): string {
  const { startAt, endAt, timeZone = OPERATOR_TZ } = args;
  const s = parts({ at: startAt, timeZone });
  const e = parts({ at: endAt, timeZone });
  if (s.day === e.day && s.month === e.month) {
    return `${s.weekday} ${s.day} ${s.month}, ${s.time}–${e.time} ${e.zone}`;
  }
  return `${s.weekday} ${s.day} ${s.month} ${s.time} – ${e.weekday} ${e.day} ${e.month} ${e.time} ${e.zone}`;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "3 min ago", "2 h ago", "4 d ago"; "just now" under a minute; "in 2 h" for the future. */
export function formatAge(args: { at: Date; now: Date }): string {
  const { at, now } = args;
  const diff = now.getTime() - at.getTime();
  const abs = Math.abs(diff);
  const text =
    abs < MIN
      ? null
      : abs < HOUR
        ? `${Math.floor(abs / MIN)} min`
        : abs < 2 * DAY
          ? `${Math.floor(abs / HOUR)} h`
          : `${Math.floor(abs / DAY)} d`;
  if (!text) return 'just now';
  return diff >= 0 ? `${text} ago` : `in ${text}`;
}

/** "snake_case_KEY" → "Snake case key". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const text = value
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function sentenceCase(value: string): string {
  const text = value.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Drops a leading "CD-420299: " / "CD-420299 · " so titles do not repeat the reference. */
export function stripOrderRef(title: string): string {
  return sentenceCase(title.replace(/^CD-\d+\s*[:·–—-]\s*/u, ''));
}

export function plural(args: { count: number; one: string; many?: string }): string {
  const { count, one, many = `${one}s` } = args;
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Splits a stored decide-by reason into the "until" part and the why. Handles both writers:
 * "until Fri 23 Oct 11:00 CEST — pickup slot starts" (chain) and "until 22 Oct 07:10Z: departure…" (watchman).
 */
export function splitDecideBy(args: { reason: string | null; decideBy: Date | null }): {
  until: string | undefined;
  reason: string | undefined;
} {
  const { reason, decideBy } = args;
  const fallbackUntil = decideBy ? formatWhenShort(decideBy) : undefined;
  if (!reason) return { until: fallbackUntil, reason: undefined };
  const plain = (text: string) => plainText(text, decideBy ?? undefined);
  const dash = reason.match(/^until (.+?) — (.+)$/u);
  if (dash) return { until: plain(dash[1]), reason: plain(dash[2]) };
  const zulu = reason.match(/^until [^:]+?\d{2}:\d{2}Z: (.+)$/u);
  if (zulu) return { until: fallbackUntil, reason: plain(zulu[1]) };
  return { until: fallbackUntil, reason: plain(reason) };
}

function formatWhenShort(at: Date): string {
  const p = parts({ at, timeZone: OPERATOR_TZ });
  return `${p.weekday} ${p.day} ${p.month} ${p.time} ${p.zone}`;
}

/** First n characters at a word boundary, with an ellipsis. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > max * 0.6 ? space : max).replace(/[,;:.\s]+$/u, '')}…`;
}

export function formatEuroCents(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return `EUR ${(cents / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Agent prose without internal ids, codes or raw UTC times; the chips carry the sources. */
export function cleanAgentText(text: string, now?: Date): string {
  return plainText(text, now);
}
