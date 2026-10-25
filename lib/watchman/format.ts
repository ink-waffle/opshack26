// Compact time wording for states, signals and cards (sim time, UTC unless a zone is given).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');

/** '21 Oct 07:20Z' */
export function fmtUtc(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z`;
}

/** 'Wed 21 Oct 2026 09:00Z' */
export function fmtNow(date: Date): string {
  return `${WEEKDAYS[date.getUTCDay()]} ${fmtUtc(date).replace(/ (\d\d:\d\d)Z$/, ` ${date.getUTCFullYear()} $1Z`)}`;
}

/** '23 Oct 09:00 Europe/Berlin' (local wall time in the given zone). */
export function fmtLocal(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return `${get('day')} ${get('month')} ${get('hour')}:${get('minute')} ${timeZone}`;
  } catch {
    return fmtUtc(date);
  }
}

/** '2 h 5 min' / '3 d 4 h' / '12 min' for a positive duration in ms. */
export function fmtDuration(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

/** 'in 2 h 5 min' / '40 min ago' / 'now' relative to `now`. */
export function fmtRel(date: Date, now: Date): string {
  const ms = date.getTime() - now.getTime();
  if (Math.abs(ms) < 60_000) return 'now';
  return ms > 0 ? `in ${fmtDuration(ms)}` : `${fmtDuration(ms)} ago`;
}

/** '21 Oct 07:20Z (1 h 40 min ago)' */
export function fmtAt(date: Date, now: Date): string {
  return `${fmtUtc(date)} (${fmtRel(date, now)})`;
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export function money(cents: number | null | undefined, currency: string | null | undefined) {
  if (cents === null || cents === undefined) return null;
  return `${currency ?? 'EUR'} ${(cents / 100).toFixed(0)}`;
}
