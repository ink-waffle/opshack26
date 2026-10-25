import { readFile } from 'fs/promises';
import { join } from 'path';

import type { BahnCollection, BahnRecord } from '@/lib/bahn/collections';

export const BAHN_DATASET_DIR = join(process.cwd(), 'data/bahn/dataset');

export type BahnManifest = {
  snapshot_at: string;
  release_status: string;
  tables: Record<string, number>;
};

export async function readBahnManifest(args: { dir?: string } = {}): Promise<BahnManifest> {
  const { dir = BAHN_DATASET_DIR } = args;
  return JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) as BahnManifest;
}

export async function readBahnCollection(args: {
  collection: BahnCollection;
  dir?: string;
}): Promise<BahnRecord[]> {
  const { collection, dir = BAHN_DATASET_DIR } = args;
  const text = await readFile(join(dir, `${collection}.jsonl`), 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const record = JSON.parse(line) as BahnRecord;
      if (typeof record.id !== 'string') throw new Error(`${collection}: record without string id`);
      return record;
    });
}
