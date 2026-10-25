// Render-time cleanup of agent prose and fact statements: no ids, codes or raw ISO/UTC times on screen (pure).

import type { ACTION_CLASSES } from '@/lib/gate/actions';

// The desk works from Helsinki; times rewritten from UTC say so with the zone.
const DESK_TZ = 'Europe/Helsinki';

const ACTION_WORDS: Record<keyof typeof ACTION_CLASSES, string> = {
  READ: 'a lookup',
  ASK_DRIVER: 'a question to the driver',
  ASK_SITE: 'a question to the site',
  ASK_PROVIDER: 'a question to the provider',
  INSTRUCT_HOLD: 'a safety hold',
  INSTRUCT_CHANGE: 'a new plan for the driver',
  CUSTOMER_MESSAGE: 'a customer message',
  BOOK_TRAVEL: 'a booking',
  CANCEL_TRAVEL: 'a cancellation',
  CHANGE_WINDOW: 'a window change',
  CHANGE_ASSIGNMENT: 'an assignment change',
  MARKET: 'a driver offer',
  RECORD_ASSERTION: 'a record update',
  MONEY: 'a payment',
  FORBIDDEN: 'a forbidden step',
};
const ACTION_IDS = Object.keys(ACTION_WORDS).join('|');

// Status words Bahn's records spell in capitals; read as plain lower-case words.
const STATUS_WORDS = new Set([
  'CONFIRMED',
  'UNCONFIRMED',
  'APPROVED',
  'REJECTED',
  'VERIFIED',
  'REQUESTED',
  'SUBMITTED',
  'WITHDRAWN',
  'ACCEPTED',
  'DECLINED',
  'CLOSED',
  'PREPARED',
  'ASSIGNED',
  'CANCELLED',
  'PENDING',
  'EDITED',
  'EXPIRED',
  'PAID',
  'BOOKED',
  'QUOTED',
  'STATED',
  'OBSERVED',
  'PLANNED',
  'FAILED',
  'ESCALATED',
  'SKIPPED',
  'COMPLETED',
  'ROUTINE',
  'NONE',
  'OPEN',
  'NEW',
  'DONE',
  'WAITING',
  'MANUAL',
]);

const SOURCE_WORDS: Record<string, string> = {
  CUSTOMER: 'set by the customer',
  OPS: 'set by Bahn ops',
  SYSTEM: 'set by the system',
  SITE: 'given by the site',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { hourCycle: 'h23', ...options });
    formatters.set(key, f);
  }
  return f;
}

function deskParts(at: Date) {
  const list = formatter('desk', {
    timeZone: DESK_TZ,
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
    day: `${pick('weekday')} ${pick('day')} ${pick('month')}`,
    time: `${pick('hour')}:${pick('minute')}`,
    zone: pick('timeZoneName'),
  };
}

/** "Wed 21 Oct 12:00 EEST"; just "12:00 EEST" on the same desk day as `now`. */
export function deskTime(at: Date, now?: Date): string {
  const p = deskParts(at);
  if (now && deskParts(now).day === p.day) return `${p.time} ${p.zone}`;
  return `${p.day} ${p.time} ${p.zone}`;
}

function calendarDay(at: Date): string {
  return formatter('calendar', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(at);
}

const ISO_TIME =
  /\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/;
const ISO_DAY = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DAY_UTC = new RegExp(
  `\\b(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?(\\d{1,2}) (${MONTHS.join('|')}),? (\\d{2}):(\\d{2}) ?(?:UTC|Z)\\b`
);
const RANGE_UTC = /\b(\d{2}):(\d{2})[–-](\d{2}):(\d{2}) ?(?:UTC|Z)\b/;
const TIME_UTC = /\b(\d{2}):(\d{2}) ?(?:UTC|Z)\b/;
const ANY_TIME = new RegExp(
  [ISO_TIME, DAY_UTC, RANGE_UTC, TIME_UTC, ISO_DAY].map((re) => `(${re.source})`).join('|'),
  'g'
);

/** Raw ISO and UTC times → desk time with the zone; a time without a date takes the last date seen, else `now`. */
export function deskTimes(text: string, now?: Date): string {
  let day: { y: number; m: number; d: number } | null = null;
  const year = (now ?? new Date()).getUTCFullYear();
  const at = (hh: string, mm: string) => {
    const base =
      day ?? (now ? { y: now.getUTCFullYear(), m: now.getUTCMonth(), d: now.getUTCDate() } : null);
    return base ? new Date(Date.UTC(base.y, base.m, base.d, Number(hh), Number(mm))) : null;
  };
  return text.replace(ANY_TIME, (match) => {
    const iso = match.match(ISO_TIME);
    if (iso && iso.index === 0) {
      const [, y, m, d, hh, mm, zone] = iso;
      const parsed = new Date(`${y}-${m}-${d}T${hh}:${mm}:00${zone ?? 'Z'}`);
      if (Number.isNaN(parsed.getTime())) return match;
      day = { y: parsed.getUTCFullYear(), m: parsed.getUTCMonth(), d: parsed.getUTCDate() };
      return deskTime(parsed, now);
    }
    const dayUtc = match.match(DAY_UTC);
    if (dayUtc && dayUtc.index === 0) {
      const [, d, mon, hh, mm] = dayUtc;
      day = { y: year, m: MONTHS.indexOf(mon), d: Number(d) };
      const parsed = at(hh, mm);
      return parsed ? deskTime(parsed, now) : match;
    }
    const range = match.match(RANGE_UTC);
    if (range && range.index === 0) {
      const [, h1, m1, h2, m2] = range;
      const start = at(h1, m1);
      const end = at(h2, m2);
      if (!start || !end) return match;
      const a = deskParts(start);
      const b = deskParts(end);
      return `${a.time}–${b.time} ${b.zone}`;
    }
    const time = match.match(TIME_UTC);
    if (time && time.index === 0) {
      const parsed = at(time[1], time[2]);
      if (!parsed) return match;
      const p = deskParts(parsed);
      return `${p.time} ${p.zone}`;
    }
    const isoDay = match.match(ISO_DAY);
    if (isoDay) {
      const [, y, m, d] = isoDay;
      const parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
      if (Number.isNaN(parsed.getTime())) return match;
      day = { y: Number(y), m: Number(m) - 1, d: Number(d) };
      return calendarDay(parsed);
    }
    return match;
  });
}

const FACT_ID = 'f_[0-9a-f]{14}';
// A sentence end that is really an abbreviation keeps the next word lower-case.
const ABBREVIATION = /\b(?:e\.g|i\.e|approx|incl|ca|vs|etc)\.$/;
const RECORD_ID = '[a-z]{2,10}-x[0-9a-f]{10,}';

/**
 * Agent prose and fact statements as a person reads them: no fact or record ids, no action or status codes,
 * roles instead of actor ids, and ISO/UTC times as desk time with the zone.
 */
export function plainText(text: string, now?: Date): string {
  let out = text
    // Fact ids: the chips carry the sources.
    .replace(
      new RegExp(`\\s*[([](?:facts?\\s+)?${FACT_ID}(?:\\s*[,;]\\s*${FACT_ID})*[)\\]]`, 'g'),
      ''
    )
    .replace(new RegExp(`\\s*\\bfacts?\\s+${FACT_ID}\\b`, 'g'), '')
    .replace(new RegExp(`\\b${FACT_ID}\\b`, 'g'), 'a fact')
    .replace(/\s*\(?\bagent-x[0-9a-f]+\b\)?/g, '')
    // Rule ids in prose; the rule pages carry them.
    .replace(/\s*\((?:guard ?rails?|rules?)?\s*G\d+(?:\s*(?:,|and)\s*G\d+)*\)/gi, '')
    // Action classes: an explanatory aside goes, a bare code becomes words.
    .replace(new RegExp(`\\s*\\((?:${ACTION_IDS})(?::[^)]*)?\\)`, 'g'), '')
    .replace(new RegExp(`\\b(?:${ACTION_IDS})\\b(?=[^a-z]|$)`, 'g'), (code) =>
      code.includes('_') || code === 'MONEY' || code === 'MARKET'
        ? ACTION_WORDS[code as keyof typeof ACTION_WORDS]
        : code
    )
    // Tool and command names.
    .replace(
      /\bBooking attempt travel\.book_([a-z]+)(?: for)?/g,
      (_, what: string) => `${what.charAt(0).toUpperCase()}${what.slice(1)} booking attempt`
    )
    .replace(/\bmcp__control__([a-z_]+)\b/g, (_, name: string) => name.replace(/_/g, ' '))
    .replace(
      /\b(?:travel|driver|customer|ops|site|market|order|roadside|alert|proof|expense|offer|assignment)\.([a-z]+(?:_[a-z]+)*)\b/g,
      (_, name: string) => `“${name.replace(/_/g, ' ')}”`
    )
    // Actors: roles and names instead of ids.
    .replace(/\bAgent control-agent\b/g, 'The agent')
    .replace(/\bcontrol-agent\b/g, 'the agent')
    .replace(
      /(^|\s)([a-z]+)-agent\b/g,
      (_, lead: string, name: string, offset: number) =>
        `${lead}${offset === 0 ? 'The' : 'the'} ${name} agent`
    )
    .replace(/\bops-([a-z]+)\b/g, 'Ops $1')
    .replace(
      /\b([Dd])river drv-\d+ \(([^,()]+?)(?:, ([^()]+))?\)/g,
      (_, d: string, name: string, more?: string) => `${d}river ${name}${more ? ` (${more})` : ''}`
    )
    .replace(/\s*\(driver drv-\d+\)/g, '')
    .replace(/\(drv-\d+,\s*/g, '(')
    .replace(/\s*\(drv-\d+\)/g, '')
    .replace(/\bDriver drv-\d+\b/g, 'The driver')
    .replace(/\bdriver drv-\d+\b/g, 'the driver')
    .replace(/\bdrv-\d+\b/g, 'a driver')
    .replace(/\bCustomer cus-\d+\b/g, 'The customer')
    .replace(/\b(?:customer )?cus-\d+\b/g, 'the customer')
    .replace(/\bSite contact site-\d+\b/g, 'The site contact')
    .replace(/\bsite-\d+\b/g, 'the site')
    .replace(/\bep-x[0-9a-f]+ \(([^)]+)\)/g, '$1')
    // Record ids: the source view shows them.
    .replace(new RegExp(`(?:\\s+(?:for|on|of|in))?\\s*\\b${RECORD_ID}\\b`, 'g'), '')
    .replace(/\s*\b(?:ord-\d+|(?:msg|conv)-(?:ctl|sim)-[\w-]+)\b/g, '')
    .replace(/\s*\(effect events?\s*\)/g, '')
    // The person at the desk is the dispatcher on every page.
    .replace(/\bby (?:the )?operator\b/g, 'by the dispatcher')
    // Third person, as the shared rules ask.
    .replace(/\bI (did not|could not|have not|sent|asked|found|kept)\b/g, 'the agent $1')
    // Codes: record sources, multi-word enums, status words.
    .replace(/\bsource (CUSTOMER|OPS|SYSTEM|SITE)\b(?!_)/g, (_, who: string) => SOURCE_WORDS[who])
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, (code) => code.toLowerCase().replace(/_/g, ' '))
    .replace(/\b[A-Z]{3,}\b/g, (word) => (STATUS_WORDS.has(word) ? word.toLowerCase() : word))
    .replace(/\bcmr\b/g, 'CMR')
    // Zone names: "11:00 Europe/Helsinki" → "11:00 Helsinki time".
    .replace(
      /\b(?:Europe|America|Asia|Africa|Australia)\/([A-Za-z_]+)\b/g,
      (_, city: string) => `${city.replace(/_/g, ' ')} time`
    );
  out = deskTimes(out, now);
  return out
    .replace(/\(\s*\)/g, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/([,;])\s*([,;.])/g, '$2')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .replace(
      /(^|[.!?]\s+)([a-z])/g,
      (match, lead: string, letter: string, offset: number, all: string) =>
        // A text that started lower-case (a reason after "until …") stays so; a code turned into words does not.
        (offset === 0 && !/^[A-Z]/.test(text.trimStart())) ||
        ABBREVIATION.test(all.slice(Math.max(0, offset - 8), offset + 1))
          ? match
          : `${lead}${letter.toUpperCase()}`
    );
}

/** Who decided, in words: "operator" → "the dispatcher", "control-agent" → "the agent". */
export function actorWords(actor: string | null | undefined): string | null {
  if (!actor) return null;
  const key = actor.trim().toLowerCase().replace(/[-_]+/g, ' ');
  if (key === 'operator' || key === 'dispatcher') return 'the dispatcher';
  if (key === 'chief' || key === 'chief dispatcher') return 'the chief dispatcher';
  if (key === 'control agent' || key === 'agent') return 'the agent';
  if (key === 'runtime' || key === 'system') return 'the system';
  if (key === 'backtest') return 'the backtest';
  if (key === 'watchman') return 'the watchman';
  return plainText(actor).replace(/^./, (c) => c.toUpperCase());
}
