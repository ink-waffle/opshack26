This is a hackathon project, you are welcome to read envs, secrets and write them yourself too, as long as this speeds up workflow.

# Stack

Next.js 16 (App Router, `cacheComponents`), React 19, Tailwind 4, Prisma 7 over Supabase Postgres. Use `pnpm` and the scripts in `package.json`.

# Database (Prisma)

Query through `import { prisma } from '@/lib/prismaClient'`. The client is generated into `lib/generated/prisma`; import Prisma types from `@/lib/generated/prisma/client`. Use generated types or `Prisma.<Model>GetPayload<>`, never hand-typed models.

Every schema change is a Prisma migration — no `db push`, no hand-written DDL. After changing `prisma/schema.prisma`:

1. `pnpm prisma:generate`
2. `pnpm prisma:migrate:create <snake_case_name>` — `prisma migrate dev --create-only` against the local stack; review the SQL.
3. `pnpm prisma:migrate:deploy:local`, then `pnpm prisma:migrate:deploy:prod`.

# Local stack

`pnpm dev:stack` brings up local Supabase (`supabase/config.toml`: db `:55322`, studio `:55323`) and `next dev` on `:3001` against `.env.local`; Ctrl+C tears it all down.

The local database is a snapshot of prod. `pnpm seed:generate` dumps prod's schema into `supabase/migrations/` and its data (`_prisma_migrations` and `auth` included) into `supabase/seed.sql`; both are gitignored. `pnpm full-local-reset` rebuilds the local database from them, `pnpm full-local-reset:re-seed` re-dumps first.

# Code Conventions

- `@/` imports only, never relative, even within the same directory (ESLint enforces it, plus import sorting).
- Prefer types over interfaces and options objects for parameters.
- lib folder for reusable modules. Either lib/[name].ts or lib/[name]/index.ts+...; E.g lib/authorization/index.ts+types.ts+accessUtils.ts
- Use adapter pattern where relevant
- Before handoff run `pnpm lint` and `pnpm typecheck`; `pnpm format` fixes style.
