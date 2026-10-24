// Snapshots prod for `supabase db reset`: schema into supabase/migrations, data into supabase/seed.sql.

import { spawnSync } from 'child_process';
import { mkdirSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = 'supabase/migrations';
const SEED_PATH = 'supabase/seed.sql';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function prodUrl(): string {
  const url = process.env.DIRECT_URL;
  if (!url) fail('DIRECT_URL is not set — run this through `pnpm seed:generate`.');
  return url;
}

function timestamp(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function dump(args: string[]): void {
  const result = spawnSync('supabase', ['db', 'dump', '--db-url', prodUrl(), ...args], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    fail(`supabase db dump ${args.join(' ')} failed (exit ${result.status}).`);
  }
}

function main() {
  mkdirSync(MIGRATIONS_DIR, { recursive: true });
  for (const name of readdirSync(MIGRATIONS_DIR)) rmSync(join(MIGRATIONS_DIR, name));

  dump(['-f', join(MIGRATIONS_DIR, `${timestamp()}_remote_schema.sql`)]);
  dump(['--data-only', '-f', SEED_PATH]);
  console.log('Snapshot written — `pnpm full-local-reset` loads it into the local stack.');
}

main();
