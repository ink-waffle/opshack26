// Places and local nights for the itinerary: cities and terminals as comparable keys, zone-aware night windows.

import type { OrderBundle } from '@/lib/bahn/orders';
import type { ItineraryPlace } from '@/lib/chain/itinerary/types';
import { cityTimezone, HOUR_MS } from '@/lib/evidence/time';

type Terminal = OrderBundle['ferryTerminals'][number];

const TERMINAL_WORDS = /\b(vehicle|terminal|port|ferry|harbour|harbor)\b/g;

/** 'West Baltic Vehicle Terminal' / 'West Baltic terminal' / 'terminal-west-baltic' → 'west baltic'. */
export function terminalKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^terminal-/, '')
    .replace(/[-_,.]/g, ' ')
    .replace(TERMINAL_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cityKey(city: string): string {
  return city
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function looksLikeTerminal(label: string): boolean {
  return label.startsWith('terminal-') || new RegExp(TERMINAL_WORDS.source, 'i').test(label);
}

/** A city or terminal label (or terminal id) as a place; known terminals map to their city. */
export function resolvePlace(args: {
  label: string | null | undefined;
  terminalId?: string | null;
  terminals: Terminal[];
}): ItineraryPlace {
  const { terminalId, terminals } = args;
  const label = args.label?.trim() || terminalId || '?';
  const key = terminalKey(label);
  const terminal =
    (terminalId ? terminals.find((t) => t.id === terminalId) : undefined) ??
    terminals.find((t) => terminalKey(t.id) === key || terminalKey(t.name ?? '') === key);
  if (terminal) return { label, city: terminal.city ?? null };
  return { label, city: looksLikeTerminal(label) ? null : label };
}

export function placeKey(place: ItineraryPlace): string {
  return place.city ? `city:${cityKey(place.city)}` : `label:${terminalKey(place.label)}`;
}

export function samePlace(
  a: ItineraryPlace | null | undefined,
  b: ItineraryPlace | null | undefined
): boolean {
  return !!a && !!b && placeKey(a) === placeKey(b);
}

/** 'Tallinn', or 'West Baltic terminal (Hamburg)' when the label is not the city. */
export function placeName(place: ItineraryPlace): string {
  if (!place.city || cityKey(place.city) === cityKey(place.label)) return place.label;
  return `${place.label} (${place.city})`;
}

/** Zone of a place: the city table, then the terminal record, then an address in that city, else the fallback. */
export function placeTimezone(args: {
  place: ItineraryPlace | null | undefined;
  bundle: OrderBundle;
  fallback: string;
}): string {
  const { place, bundle, fallback } = args;
  if (!place) return fallback;
  const city = place.city ?? place.label;
  const terminal = bundle.ferryTerminals.find(
    (t) =>
      terminalKey(t.name ?? t.id) === terminalKey(place.label) ||
      (!!place.city && t.city === place.city)
  );
  const address = bundle.addresses.find((a) => place.city && cityKey(a.city) === cityKey(city));
  return cityTimezone(city) ?? terminal?.timezone ?? address?.timezone ?? fallback;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const partFormatters = new Map<string, Intl.DateTimeFormat>();

/** Local calendar date 'YYYY-MM-DD' of an instant. */
export function localDate(at: Date, timeZone: string): string {
  let f = dateFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatters.set(timeZone, f);
  }
  return f.format(at);
}

function offsetMs(at: Date, timeZone: string): number {
  let f = partFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    partFormatters.set(timeZone, f);
  }
  const parts = f.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
  return wall - Math.floor(at.getTime() / 60_000) * 60_000;
}

/** The instant of a local wall-clock hour on a local date. */
export function zonedInstant(date: string, hour: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, hour);
  const first = wall - offsetMs(new Date(wall), timeZone);
  return new Date(wall - offsetMs(new Date(first), timeZone));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type Interval = { from: Date; to: Date };

/** The night starting on a local date: nightStartHour that evening to nightEndHour (next morning when it wraps). */
export function nightWindow(args: {
  date: string;
  timeZone: string;
  startHour: number;
  endHour: number;
}): Interval {
  const { date, timeZone, startHour, endHour } = args;
  return {
    from: zonedInstant(date, startHour, timeZone),
    to: zonedInstant(endHour <= startHour ? addDays(date, 1) : date, endHour, timeZone),
  };
}

export function overlapHours(a: Interval, b: Interval): number {
  const from = Math.max(a.from.getTime(), b.from.getTime());
  const to = Math.min(a.to.getTime(), b.to.getTime());
  return Math.max(0, (to - from) / HOUR_MS);
}

/** Local dates whose night window overlaps the interval by at least minHours. */
export function nightsIn(args: {
  interval: Interval;
  timeZone: string;
  startHour: number;
  endHour: number;
  minHours: number;
}): string[] {
  const { interval, timeZone, startHour, endHour, minHours } = args;
  const out: string[] = [];
  const last = localDate(interval.to, timeZone);
  for (
    let date = localDate(new Date(interval.from.getTime() - 24 * HOUR_MS), timeZone);
    date <= last;
    date = addDays(date, 1)
  ) {
    const window = nightWindow({ date, timeZone, startHour, endHour });
    if (overlapHours(interval, window) >= minHours) out.push(date);
  }
  return out;
}

/** 'Tue 27 Oct' for a local date. */
export function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(',', '');
}
