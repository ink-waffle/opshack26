// Replaces every bahn.* table with data/bahn/dataset (one transaction), verifies counts, ensures control.sim_clock.

import { BAHN_COLLECTIONS, type BahnRecord } from '@/lib/bahn/collections';
import { readBahnCollection, readBahnManifest } from '@/lib/bahn/dataset';
import { countBahnTables, insertBahnRecords, truncateBahnTables } from '@/lib/bahn/insert';
import { ensureSimClock } from '@/lib/clock';
import { prisma } from '@/lib/prismaClient';

function fail(message: string): never {
  throw new Error(message);
}

async function main() {
  if (!process.env.DATABASE_URL)
    fail('DATABASE_URL is not set — run through `pnpm seed:bahn:local|prod`.');
  const target = new URL(process.env.DATABASE_URL).host;
  const manifest = await readBahnManifest();

  const manifestNames = Object.keys(manifest.tables).sort();
  const known = [...BAHN_COLLECTIONS].sort();
  if (manifestNames.join() !== known.join()) {
    fail(
      `Manifest collections differ from BAHN_COLLECTIONS: ${manifestNames.join()} vs ${known.join()}`
    );
  }

  const data = new Map<string, BahnRecord[]>();
  for (const collection of BAHN_COLLECTIONS) {
    const records = await readBahnCollection({ collection });
    if (records.length !== manifest.tables[collection]) {
      fail(
        `${collection}: manifest expects ${manifest.tables[collection]}, file has ${records.length}`
      );
    }
    data.set(collection, records);
  }

  const startedAt = Date.now();
  console.log(`Seeding bahn.* on ${target} …`);
  await prisma.$transaction(
    async (tx) => {
      await truncateBahnTables({ db: tx });
      for (const collection of BAHN_COLLECTIONS) {
        await insertBahnRecords({ collection, records: data.get(collection) ?? [], db: tx });
      }
    },
    { timeout: 600_000, maxWait: 60_000 }
  );

  const counts = await countBahnTables();
  const mismatches = BAHN_COLLECTIONS.filter((c) => counts[c] !== manifest.tables[c]);
  if (mismatches.length) {
    fail(
      `Count mismatch: ${mismatches.map((c) => `${c} ${counts[c]}≠${manifest.tables[c]}`).join(', ')}`
    );
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const clock = await ensureSimClock();
  console.log(
    `Seeded ${total} rows in ${BAHN_COLLECTIONS.length} tables (${Date.now() - startedAt} ms); counts match manifest.`
  );
  console.log(
    `sim_clock: anchorSim=${clock.anchorSim.toISOString()} anchorReal=${clock.anchorReal.toISOString()} speed=${clock.speed}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
