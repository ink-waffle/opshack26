import {
  BAHN_COLLECTIONS,
  type BahnCollection,
  type BahnRecord,
  isBahnCollection,
} from '@/lib/bahn/collections';
import type { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prismaClient';

type Db = Prisma.TransactionClient | typeof prisma;

type Column = { name: string; isArray: boolean };

const columnCache = new Map<BahnCollection, Column[]>();

async function tableColumns(args: { db: Db; collection: BahnCollection }): Promise<Column[]> {
  const { db, collection } = args;
  const cached = columnCache.get(collection);
  if (cached) return cached;
  const rows = await db.$queryRaw<{ column_name: string; data_type: string }[]>`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'bahn' AND table_name = ${collection} ORDER BY ordinal_position`;
  if (!rows.length) throw new Error(`bahn.${collection} does not exist (migrations applied?)`);
  const columns = rows.map((row) => ({
    name: row.column_name,
    isArray: row.data_type === 'ARRAY',
  }));
  columnCache.set(collection, columns);
  return columns;
}

/** Inserts dataset-shaped records into bahn.<collection>; columns fill by JSON key, `raw` keeps the record. */
export async function insertBahnRecords(args: {
  collection: BahnCollection;
  records: BahnRecord[];
  db?: Db;
  onConflict?: 'error' | 'skip' | 'replace';
  batchSize?: number;
}): Promise<number> {
  const { collection, records, db = prisma, onConflict = 'error', batchSize = 400 } = args;
  if (!isBahnCollection(collection)) throw new Error(`Unknown bahn collection: ${collection}`);
  const columns = await tableColumns({ db, collection });
  const arrays = columns.filter((column) => column.isArray).map((column) => column.name);
  const updatable = columns.map((column) => `"${column.name}"`).filter((name) => name !== '"id"');
  const conflict = {
    error: '',
    skip: ' ON CONFLICT (id) DO NOTHING',
    replace: ` ON CONFLICT (id) DO UPDATE SET (${updatable.join(', ')}) = ROW(${updatable.map((name) => `EXCLUDED.${name}`).join(', ')})`,
  }[onConflict];
  const sql = `INSERT INTO "bahn"."${collection}" SELECT * FROM jsonb_populate_recordset(NULL::"bahn"."${collection}", $1::jsonb)${conflict}`;

  let inserted = 0;
  for (let start = 0; start < records.length; start += batchSize) {
    const payload = records.slice(start, start + batchSize).map((record) => {
      const row: Record<string, unknown> = { ...record, raw: record };
      for (const name of arrays) row[name] ??= [];
      return row;
    });
    inserted += await db.$executeRawUnsafe(sql, JSON.stringify(payload));
  }
  return inserted;
}

/** Row count of every bahn table in one query. */
export async function countBahnTables(
  args: { db?: Db } = {}
): Promise<Record<BahnCollection, number>> {
  const { db = prisma } = args;
  const sql = BAHN_COLLECTIONS.map(
    (collection) =>
      `SELECT '${collection}' AS collection, count(*)::int AS count FROM "bahn"."${collection}"`
  ).join(' UNION ALL ');
  const rows = await db.$queryRawUnsafe<{ collection: BahnCollection; count: number }[]>(sql);
  return Object.fromEntries(rows.map((row) => [row.collection, row.count])) as Record<
    BahnCollection,
    number
  >;
}

/** Empties every bahn table (seed only). */
export async function truncateBahnTables(args: { db?: Db } = {}): Promise<void> {
  const { db = prisma } = args;
  await db.$executeRawUnsafe(`TRUNCATE ${BAHN_COLLECTIONS.map((c) => `"bahn"."${c}"`).join(', ')}`);
}
