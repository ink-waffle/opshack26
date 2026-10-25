// The record behind a fact, as a readable key-value list (never a raw JSON dump).

import { BAHN_COLLECTIONS } from '@/lib/bahn/collections';
import { collectionWords, parseSourceRef, toolWords } from '@/lib/control-room/facts';
import { clip, formatDayTime, formatUtc, humanize } from '@/lib/control-room/format';
import type { FactRecordView, RecordRow } from '@/lib/control-room/types';
import { prisma } from '@/lib/prismaClient';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const SKIP = new Set(['raw', 'id']);

function scalar(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    if (ISO.test(value)) {
      const at = new Date(value);
      return `${formatDayTime({ at })} (${formatUtc(at)})`;
    }
    // A whole-value code ("NO_BOOKING") reads as words; free text stays as recorded.
    return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(value) ? humanize(value) : value;
  }
  if (typeof value === 'number') return value.toLocaleString('en-GB');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return null;
}

function text(value: unknown, depth = 0): string | null {
  const plain = scalar(value);
  if (plain !== null) return plain;
  if (Array.isArray(value)) {
    const items = value.map((item) => text(item, depth + 1)).filter(Boolean);
    return items.length ? clip(items.join(depth ? '; ' : ' · '), 240) : null;
  }
  if (value && typeof value === 'object') {
    if (depth > 1) return null;
    const items = Object.entries(value)
      .map(([key, inner]) => {
        const t = text(inner, depth + 1);
        return t ? `${humanize(key).toLowerCase()}: ${t}` : null;
      })
      .filter(Boolean);
    return items.length ? clip(items.join('; '), 240) : null;
  }
  return null;
}

function rows(record: Record<string, unknown>): RecordRow[] {
  return Object.entries(record)
    .filter(([key]) => !SKIP.has(key))
    .map(([key, value]) => ({
      label: humanize(key),
      value: key === 'tool' && typeof value === 'string' ? toolWords(value) : text(value),
    }))
    .filter((row): row is RecordRow => row.value !== null)
    .slice(0, 40);
}

export async function getFactRecord(args: { factId: string }): Promise<FactRecordView> {
  const fact = await prisma.fact.findUnique({ where: { id: args.factId } });
  if (!fact) return null;
  const source = parseSourceRef(fact.sourceRef);
  if (
    source.kind === 'bahn' &&
    (BAHN_COLLECTIONS as readonly string[]).includes(source.collection)
  ) {
    const found = await prisma.$queryRawUnsafe<{ raw: Record<string, unknown> }[]>(
      `select raw from bahn."${source.collection}" where id = $1`,
      source.id
    );
    const record = found[0]?.raw;
    if (record)
      return { title: `${collectionWords(source.collection)} ${source.id}`, rows: rows(record) };
  }
  if (fact.value && typeof fact.value === 'object' && !Array.isArray(fact.value)) {
    const title =
      source.kind === 'tool'
        ? `${toolWords(source.tool)}: what the tool returned`
        : 'Recorded value';
    return { title, rows: rows(fact.value as Record<string, unknown>) };
  }
  return null;
}
