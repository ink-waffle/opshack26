// Pure formatting helpers shared by facts, chain and gate: local times with zone, durations, money.

export const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;

// Cities in the packet (addresses, travel, terminals, driver homes) → IANA zone.
const CITY_TIMEZONES: Record<string, string> = {
  Aalborg: 'Europe/Copenhagen',
  Aarhus: 'Europe/Copenhagen',
  Copenhagen: 'Europe/Copenhagen',
  Odense: 'Europe/Copenhagen',
  Antwerp: 'Europe/Brussels',
  Ghent: 'Europe/Brussels',
  Rotterdam: 'Europe/Amsterdam',
  Berlin: 'Europe/Berlin',
  Cologne: 'Europe/Berlin',
  Düsseldorf: 'Europe/Berlin',
  Frankfurt: 'Europe/Berlin',
  Hamburg: 'Europe/Berlin',
  Leipzig: 'Europe/Berlin',
  Munich: 'Europe/Berlin',
  Stuttgart: 'Europe/Berlin',
  'West Baltic terminal': 'Europe/Berlin',
  Graz: 'Europe/Vienna',
  Vienna: 'Europe/Vienna',
  Bordeaux: 'Europe/Paris',
  Lille: 'Europe/Paris',
  Lyon: 'Europe/Paris',
  Marseille: 'Europe/Paris',
  Paris: 'Europe/Paris',
  Gothenburg: 'Europe/Stockholm',
  Malmö: 'Europe/Stockholm',
  Stockholm: 'Europe/Stockholm',
  Uppsala: 'Europe/Stockholm',
  'East Sweden terminal': 'Europe/Stockholm',
  Espoo: 'Europe/Helsinki',
  Helsinki: 'Europe/Helsinki',
  Jyväskylä: 'Europe/Helsinki',
  Lahti: 'Europe/Helsinki',
  Oulu: 'Europe/Helsinki',
  Pori: 'Europe/Helsinki',
  Seinäjoki: 'Europe/Helsinki',
  Tampere: 'Europe/Helsinki',
  Turku: 'Europe/Helsinki',
  Vantaa: 'Europe/Helsinki',
  'South Finland terminal': 'Europe/Helsinki',
};

export function cityTimezone(city: string | null | undefined): string | null {
  if (!city) return null;
  return CITY_TIMEZONES[city] ?? null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** "Wed 21 Oct 12:25 CEST"; UTC when the zone is unknown. */
export function formatLocal(args: { at: Date; timeZone?: string | null }): string {
  const { at, timeZone } = args;
  return formatter(timeZone ?? 'UTC')
    .format(at)
    .replace(',', '');
}

/** "Tue 27 Oct 13:00–15:00 EET" (or two full stamps when the window spans days). */
export function formatWindow(args: {
  startAt: Date;
  endAt: Date;
  timeZone?: string | null;
}): string {
  const { startAt, endAt, timeZone } = args;
  const start = formatLocal({ at: startAt, timeZone });
  const end = formatLocal({ at: endAt, timeZone });
  const [sDay, sDate, sMonth, sTime] = start.split(' ');
  const [eDay, eDate, eMonth, eTime, eZone] = end.split(' ');
  if (sDay === eDay && sDate === eDate && sMonth === eMonth) {
    return `${sDay} ${sDate} ${sMonth} ${sTime}–${eTime} ${eZone}`;
  }
  return `${start} – ${end}`;
}

export function hoursBetween(args: { from: Date; to: Date }): number {
  const { from, to } = args;
  return (to.getTime() - from.getTime()) / HOUR_MS;
}

export function minutesBetween(args: { from: Date; to: Date }): number {
  const { from, to } = args;
  return (to.getTime() - from.getTime()) / MINUTE_MS;
}

export function addHours(args: { at: Date; hours: number }): Date {
  const { at, hours } = args;
  return new Date(at.getTime() + hours * HOUR_MS);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "EUR 387.00"; non-EUR amounts say so ("DKK 450.00 (not EUR)"). */
export function formatMoney(args: {
  cents: number | null | undefined;
  currency?: string | null;
}): string {
  const { cents, currency } = args;
  if (cents === null || cents === undefined) return 'price unknown';
  const code = currency ?? 'EUR';
  const amount = (cents / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return code === 'EUR' ? `EUR ${amount}` : `${code} ${amount} (not EUR)`;
}

export function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}
