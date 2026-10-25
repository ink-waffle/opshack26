# Night shift: Bahn Car Delivery Control Room

Orchestrated overnight build (Sat 24 → Sun 25 Oct 2026). Submission deadline Sun 15:00 EET.
This file is the single source of truth for architecture, contracts, phases, decisions and status.
Every subagent reads it first and appends to **Decisions log** when it deviates or simplifies.

## What we are building (agreed with Damir)

A separate service ("our API") next to Bahn's own system. Bahn's DB is simulated by the `bahn` Postgres
schema, seeded from the challenge dataset. Our service reads `bahn.*` and owns only the `control` schema.
Bahn's system would call our webhook on every new message / record; we simulate that with a script.

Five components, each must exist, be demonstrated and be tested:

1. **Watchman** (`lib/watchman`). On every new message / event / clock tick it builds a compact typed
   state for the order and asks **Jev** (TypeSafe System One decision model via OpenRouter) typed
   questions: which triggers from a CLOSED list apply (probabilities), is data stale or contradictory,
   does this need an agent. Plus deterministic time monitors (e.g. pickup slot ended, no pickup event).
2. **Router + closed set of playbooks** (`lib/playbooks`, `playbooks/*`). Deterministic table
   trigger → playbook, with deterministic preconditions per playbook. Nothing fits → escape hatch:
   a human triage card with the gathered facts. A playbook is a block diagram executed as a
   Trigger.dev task. Block kinds: deterministic, agent (Claude Code CLI), wait (deadline-aware),
   human (decision card, waits on a Trigger.dev waitpoint token), execute (simulated booking etc.).
3. **Facts, gate, chain calculator** (`lib/evidence`, `lib/facts`, `lib/gate`, `lib/chain`).
   Facts carry source, time and evidence level and are written ONLY by tools / projection code, never
   by the agent directly. Agent output references fact ids. A deterministic gate checks every agent
   proposal (evidence level, quote freshness, forbidden advice, promise invariance, unknown-outcome
   lock, action class → who approves). The chain calculator computes promise slack, decide-by and
   the driver's real duty chain for each option.
4. **Operator control room** (`app/`). Only orders that need a person, sorted by **decide-by
   countdown** (with its reason, e.g. "until 10:25 — departure of the paid train"), never by
   priority labels. Card: what happened (≤3 lines), what the agent already did, options with chain
   deltas, every fact clickable to its source, approve / edit / reject → resumes the Trigger run.
5. **Meta-system + playbook catalog** (`lib/meta`, `app/playbooks`, `app/meta`). Operator edits and
   rejections become amendment proposals (instruction text or parameters), backtested by replaying
   recorded inputs, approved or rejected by the chief dispatcher. Read-only catalog: every playbook
   as a block diagram, click a block to read its instructions, rules and approved amendments —
   understandable without reading code.

Simplification is allowed and expected. Keep the five components; cut details freely and log the cut.

## Environment facts (verified 24 Oct 23:20)

- Repo: `/Users/ink_waffle/Work/operationshackathon26`. Next.js 16.4 (App Router, `cacheComponents`),
  React 19, Tailwind 4, Prisma 7.10 (`prisma-client` generator → `lib/generated/prisma`, adapter-pg),
  Supabase local (db :55322, studio :55323), pnpm 11. Read `CLAUDE.md`. Next 16 has breaking changes:
  read `node_modules/next/dist/docs/` before writing Next code.
- Env: `.env.local` (local Supabase) and `.env.production` (prod Supabase). Both now hold
  `OPENROUTER_API_KEY`, `TRIGGER_SECRET_KEY` (tr_dev key), `TRIGGER_PROJECT_REF=proj_huebjwukwrrablzkilur`.
  `.env.production` also has `TRIGGER_API_KEY` (same value). Hackathon project: reading envs is fine.
- Installed: `@trigger.dev/sdk@4.8.1`, `trigger.dev@4.8.1` (dev), `@modelcontextprotocol/sdk`, `zod@4`,
  `vitest`, `@xyflow/react`, `@dagrejs/dagre`, `react-markdown`, `remark-gfm`. Add more if needed.
- Trigger.dev: CLI is logged in (`npx trigger.dev whoami` → account damir@aniva.health). Project in the
  browser: org `test-94a4`, project `hackops26` (ref above). If `trigger dev` cannot access the project
  with this login, re-login through the debug Chrome (CDP 9223, logged in to cloud.trigger.dev).
  Trigger docs are local: `.rules/shared/docs/trigger/` (v4; see `wait-for-token.md`, `wait.md`,
  `config/config-file.md`, `cli-dev-commands.md`). Hatchet docs: `.rules/shared/docs/hatchet/`.
- Claude Code CLI headless works with Damir's subscription from a clean env:
  `claude -p "<prompt>" --output-format json --json-schema '<schema>' --no-session-persistence --model <m>`
  returns `structured_output`. Flags available: `--mcp-config`, `--strict-mcp-config`, `--allowedTools`,
  `--disallowedTools`, `--append-system-prompt`, `--system-prompt`, `--permission-mode`, `--add-dir`,
  `--setting-sources`, `--bare`. Real binary: `/Users/ink_waffle/.local/bin/claude` (also on PATH via
  `/opt/homebrew/bin/claude`). Trigger.dev dev mode runs tasks on this machine, so tasks can spawn it.
  In the cloud the same CLI adapter works with `ANTHROPIC_API_KEY`.
- Jev: `POST https://openrouter.ai/api/alpha/decisions`, `Authorization: Bearer $OPENROUTER_API_KEY`,
  body `{ model: '~typesafe/jev-latest', state: {...}, questions: { key: { type: 'noul'|'choice'|'score',
  instructions, criteria } } }` → `answers.key.noul` (P(yes)) / `.choice` + `.probabilities` + `.confidence`.
  ~0.5 s, ~$0.00002 per call. Docs: https://openrouter.ai/docs/guides/community/jev-tutorial.md and
  https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request.md
  (`typesafe/jev-router` on chat/completions is a model ROUTER, not Jev — don't use it).
- Bahn packet vendored into the repo: `data/bahn/dataset/*.jsonl` (48 files incl. manifest),
  `data/bahn/attachments/`, `data/bahn/docs/` (SCHEMA.md, OPERATIONS-CONTEXT.md, PARTICIPANT-BRIEF.md,
  DATASET-README.md), car images and logos in `public/bahn/`. Original clone (read-only reference,
  incl. the optional Drizzle starter): `/Users/ink_waffle/Work/car-delivery-control-room/`.
- Research to use: `research/decision-tree/` (README, cases.md, decision_tree.md + .yaml with 18
  playbooks, guardrails G1–G11, action classes, monitors, card schema, worked cards; evaluation.md;
  meta_loop.md; starter_audit.md). Snapshot time of the dataset: 2026-10-21T09:00:00Z.

## Repository layout (target)

```
data/bahn/                     vendored Bahn packet
prisma/schema.prisma           schemas: bahn (their DB, seeded) + control (ours)
scripts/seed/                  seed bahn.* from data/bahn/dataset (local + prod)
scripts/simulate/              act as Bahn's API: insert a record into bahn.* and POST our webhook
lib/bahn/                      typed read access to bahn.* (order bundle etc.)
lib/clock/                     simulated clock: now() = anchorSim + (realNow - anchorReal) * speed
lib/evidence/                  ladder.ts — SINGLE source of the evidence ladder; renderers for Jev + agents
lib/facts/                     projection (bahn records → facts) and writeFact (only way to create facts)
lib/chain/                     deterministic chain calculator
lib/gate/                      deterministic guardrails + action classes
lib/decisions/                 DecisionModel adapter (index.ts) + adapters/jev.ts
lib/agents/                    AgentRunner adapter (index.ts) + adapters/claudeCli.ts
lib/providers/                 mocks: ferries, trains, hotels, roadside; simulated driver/site replies
lib/watchman/                  trigger taxonomy, state builder, Jev questions, monitors, inspect()
lib/playbooks/                 runtime: types, interpreter, blocks, registry, router
lib/meta/                      amendments: learn from decisions, backtest, apply
mcp/                           MCP stdio server exposing our tools to agent blocks
playbooks/_shared/rules.md     rules injected into every agent (+ generated evidence ladder)
playbooks/<id>/                index.ts (Trigger task), playbook.ts (definition), rules.md, instructions/<block>.md
trigger/                       Trigger.dev tasks that are not playbooks (watchman.inspect, monitors tick, meta.learn)
trigger.config.ts              dirs: ['./trigger', './playbooks']
app/                           control room (/), cards, orders, /playbooks catalog, /meta, /api/webhooks/bahn
```

## Core contracts (agents may refine; keep names stable, log changes)

```ts
// lib/evidence: ordered levels. A claim needs a fact at or above the level its kind requires.
type EvidenceLevel = 'REQUESTED' | 'STATED' | 'QUOTED' | 'PLANNED' | 'BOOKED' | 'OBSERVED' | 'VERIFIED';

// control.facts — written only by lib/facts (projection, tools, operator decisions)
type Fact = {
  id: string; orderId: string | null; runId: string | null;
  kind: string;            // e.g. FERRY_QUOTE, FERRY_BOOKING, GATE_SCAN, DRIVER_STATEMENT, PICKUP_EVENT, PROMISE_WINDOW
  subject: string;         // e.g. 'ferry:res-x…', 'driver:drv-055', 'order:CD-420299'
  statement: string;       // one human sentence, shown on cards
  value: unknown;          // structured payload
  level: EvidenceLevel;
  sourceType: 'BAHN_RECORD' | 'TOOL' | 'OPERATOR' | 'AGENT_INTERPRETATION';
  sourceRef: string;       // 'bahn.travel_reservations:res-x…' | 'tool:search_ferries:<callId>' | 'card:<id>'
  observedAt: Date;        // when it was true / said (sim time)
  recordedAt: Date;
};

// Playbook = declarative graph; the same definition drives the runtime AND the catalog diagram.
type BlockKind = 'deterministic' | 'agent' | 'wait' | 'human' | 'execute';
type Edge = { to: string; label: string; when?: (ctx: RunContext) => boolean };
type BlockDefinition = {
  id: string; kind: BlockKind; title: string; description: string;   // plain language for the catalog
  instructions?: string;           // agent blocks: path to instructions md inside the playbook folder
  outputSchema?: unknown;          // zod schema for agent / deterministic output
  run?: (ctx: RunContext) => Promise<unknown>;     // deterministic / execute
  wait?: { defaultMinutes: number; bufferMinutes: number };   // waits = min(default, nextCommitment - buffer)
  next: Edge[];
};
type PlaybookDefinition = {
  id: string; title: string; summary: string;
  triggers: string[];              // watchman trigger types routed here
  preconditions: { id: string; description: string; check: (ctx: RunContext) => Promise<boolean> }[];
  start: string; blocks: BlockDefinition[];
};
```

Control tables (Prisma, schema `control`): `facts`, `signals` (watchman outputs incl. raw Jev answers),
`playbook_runs` (+ Trigger run id, status lifecycle DETECTED → GATHERING → OPTIONS_READY →
AWAITING_DECISION → EXECUTING → CLOSED / ESCALATED), `block_runs` (input, output, agent cost, transcript),
`cards` (decide_by, decide_by_reason, options json, status, decision json, waitpoint token id),
`amendments` (playbook/block, kind INSTRUCTION | PARAMETER, text, rationale, source card, backtest json,
status PROPOSED | APPROVED | REJECTED), `sim_clock` (anchor_sim, anchor_real, speed).

Agent blocks: Claude Code CLI, tools ONLY via our MCP server (`--strict-mcp-config`, allowed tools =
`mcp__control__*`), output validated by `--json-schema` → `structured_output` (no files needed). The
prompt = global rules + playbook rules + block instructions + approved amendments + the run context.
Concurrency of agent blocks ≤ 2 (subscription rate limits).

## Demo scenarios (acceptance)

- **S1 missed / sold-out ferry** (real: CD-420299, also CD-420154): agent searches sailings + hotel,
  chain calculator gives slack (299: promise holds, ~42 h slack), gate blocks buying before the
  timed-out attempt is reconciled, card with decide-by, approve → simulated booking facts (BOOKED).
- **S2 vehicle warning** (real: CD-420322 Bentley): agent asks the simulated driver (safe? where? photo),
  looks up car/owner/due date, card: owner decides roadside vs tow; gate forbids mechanical advice.
- **S3 pickup not confirmed** (monitor on the sim clock): slot ended, no pickup event, site silent →
  deadline-aware wait (min(2 h, next commitment − buffer)) → re-check → ask driver → close or card.
- **S4 escape hatch**: a message no playbook covers → human triage card with gathered facts.
- **S5 meta**: operator edits a card → amendment proposed + backtested → chief dispatcher approves →
  the next run of that playbook reflects it; visible in the catalog.
- Gate regression: on Bahn's 14 recorded proposals the guardrails block the 4 operator-corrected ones
  and none of the 6 approved ones.

## Phases

1. Foundation (parallel): **F1** data (Prisma bahn+control, migrations local+prod, seed prod, local
   snapshot, lib/bahn, lib/clock); **F2** runtime spike (trigger.config, `trigger dev`, Jev adapter,
   Claude CLI adapter + MCP skeleton, waitpoint token round-trip, dev-stack integration).
2. Core (parallel): **C1** evidence/facts/chain/gate + tests; **C2** watchman + monitors + webhook +
   simulator + Jev eval; **D1** design system from bahnexpress.fi + Bahn deck (browser).
3. Playbooks: **P1** runtime (interpreter, blocks, MCP tools, providers, router) + 3 playbooks + escape hatch.
4. Surfaces (parallel): **U1** operator control room; **U2** catalog + meta-system.
5. Integration: **T1** run S1–S5 end-to-end, fix, screenshots, DEMO.md; fresh-eyes review.

## Rules for every subagent

- Never `git add`, `git commit`, stage or unstage. Leave changes in the working tree.
- Stay in your assigned paths. Other agents work in parallel; typecheck errors outside your paths may be
  theirs — don't "fix" their files. Shared files (`package.json`, `prisma/schema.prisma`,
  `app/layout.tsx`, `app/globals.css`) only if your brief says so.
- Conventions: `@/` imports only; types over interfaces; object-parameter functions take `args` and
  destructure inside the body; comments and docstrings at most one line; adapter pattern for
  providers (index.ts with the type + registry, adapters/*.ts); mirror existing code style.
- Run `pnpm lint` and `pnpm typecheck` on your work before finishing (fix what is yours).
- Prefer simplification over perfection; log every simplification under Decisions log with your id.
- Finish with a short report: what works (with the command that proves it), what doesn't, what you cut.

## Decisions log

- [orchestrator] Playbooks are declarative graphs interpreted by one runtime, so the catalog diagram and
  the executed logic cannot drift, and the meta-system edits data (amendments), not code.
- [orchestrator] Facts are written only by code paths (projection, tool wrappers, operator decisions);
  agents reference fact ids. Answers "who writes the fact": the tool.
- [orchestrator] Agent output passes through `--json-schema` structured output instead of files.
- [orchestrator] Simulated clock shared by tasks and UI (speed factor) so waits and countdowns are demoable.
- [orchestrator] Bahn packet vendored into `data/bahn/` so the repo runs from a fresh clone.
- [F1] bahn models are generated from the dataset profile: every key with a determinable type becomes a typed
  column whose DB name equals the JSON key (camelCase in Prisma). Strings, ISO timestamps (`Timestamptz(3)`),
  ints, floats, bools, string arrays (`String[] @default([])`) and objects/arrays of objects (`Json?`) all
  qualify. Keys that are null in every row are typed only if they end in `_at` or `_id`; the rest stay in
  `raw`. A column is required only if it is non-null in every row of a collection with ≥10 rows. `raw` holds
  the full record. No Prisma relations in bahn; plain string ids, indexes on order_id and the hot foreign keys.
- [F1] Seeding and inserts go through one generic path, `insertBahnRecords` (`lib/bahn/insert.ts`):
  `INSERT … SELECT * FROM jsonb_populate_recordset(NULL::bahn.<t>, $1)`. Columns fill by key, missing arrays
  become `[]`. Use it from the simulator to add Bahn records (`onConflict: 'skip' | 'replace'`). Seed =
  one interactive transaction (TRUNCATE all 47 + insert); about 10 s against prod over the pooler.
- [F1] Control models are unprefixed: `Fact`, `Signal`, `PlaybookRun`, `BlockRun`, `Card`, `Amendment`,
  `SimClock`. Ids are text with DB default `gen_random_uuid()::text`, so raw SQL works and you may pass
  your own. Relations exist only for BlockRun→PlaybookRun (cascade) and Card→PlaybookRun (set null).
  Additions beyond the brief:
  - `Fact.dedupeKey` (unique), for idempotent projection upserts.
  - `RunStatus.FAILED`.
  - `CardKind` = DECISION | TRIAGE (TRIAGE is the escape hatch).
  - `CardStatus` = OPEN | APPROVED | EDITED | REJECTED | EXPIRED | CANCELLED (EDITED/REJECTED feed meta).
  - `BlockRunStatus` = RUNNING | WAITING | COMPLETED | FAILED | SKIPPED.
  - `BlockKind` values are lowercase, to match the TS contract.
- [F1] `sim_clock` is a single row with id `'default'`. `setSimClock({ speed })` re-anchors at real now and
  keeps sim time continuous; pass `anchorSim` to jump. Speed 0 = paused (waits become Infinity).
  Client code imports only `@/lib/clock/math` (pure); `@/lib/clock` pulls Prisma.
- [F1] `getOrderBundle` returns rows including `raw` (CD-420299 ≈ 48 KB). Strip it before sending a bundle to a
  client component. `listOrders` and the joined orders in duties/messages omit `raw`.
- [F1] Kept F2's `vitest.config.mts` (tsconfig paths, node env) instead of adding a second
  `vitest.config.ts`. `supabase db dump` already includes the `bahn` and `control` schemas and data by
  default, so `scripts/setup/generate-seed.ts` is unchanged.
- [F2] Trigger.dev auth: the stored CLI login (`default` profile, damir@aniva.health) got "Project not found"
  for `proj_huebjwukwrrablzkilur`. Created a Personal Access Token in the debug Chrome
  (cloud.trigger.dev/account/tokens, name `hackops26-night-shift`) and stored it as `TRIGGER_ACCESS_TOKEN` in
  `.env.local` and `.env.production`. The CLI checks it before the profile, but only in the process env (login
  runs before `--env-file` is read), so `trigger dev` runs under `dotenv -e .env.local --` (`pnpm trigger:dev`).
  The dev CLI hands its whole process env to task processes, so tasks see every `.env.local` var too.
- [F2] Trigger gotchas:
  - Dev mode runs tasks on this machine with the local Node (v24; `runtime: 'node-22'` only matters for deploy).
    `process.cwd()` in a task = repo root (default `legacyDevProcessCwdBehaviour`); `CONTROL_REPO_ROOT` overrides.
  - `@/` aliases work in tasks (the bundler reads tsconfig paths). `@/lib/prismaClient` works in dev with no
    Prisma build extension (`spike-probe` → `prismaOk: true`). `trigger deploy` would need `@trigger.dev/build`
    `prismaExtension({ mode: 'modern' })`; not installed, we don't deploy (agent blocks need this machine).
  - Waitpoints: `wait.createToken({ timeout, tags })` → `{ id: 'waitpoint_…', url, publicAccessToken }`;
    `wait.forToken<T>(token)` → `{ ok: true, output } | { ok: false, error }` (or `.unwrap()`). Complete with
    `wait.completeToken(id, data)` (server, needs `TRIGGER_SECRET_KEY`), POST `token.url`, or from the browser:
    POST `https://api.trigger.dev/api/v1/waitpoints/tokens/{id}/complete` with `Bearer <publicAccessToken>`
    and body `{ data }`. A run waiting on a token shows EXECUTING in dev; waiting does not count toward maxDuration.
  - Publish the token id where completers can find it: the spike does `metadata.set('tokenId', id)` (visible via
    `runs.retrieve(runId).metadata`); playbooks should write it to `cards.waitpointTokenId`.
  - `trigger dev` writes `.trigger/` (bundles, lock). Added it to `.gitignore`, `.prettierignore` and the ESLint
    `globalIgnores`; without that `pnpm lint` reports ~175k errors from `.trigger/tmp` while a dev session runs.
  - tsx scripts: package.json has no `"type": "module"`, so no top-level await in `scripts/**`; wrap in `main()`.
  - Config: `maxDuration: 3600` (compute seconds), retries off in dev, `maxAttempts: 2` otherwise.
- [F2] Claude CLI invocation (`lib/agents/adapters/claudeCli.ts`), prompt on stdin, cwd = a fresh `mkdtemp`:
  ```
  claude -p --output-format stream-json --verbose --no-session-persistence --model <sonnet|haiku>
    --setting-sources "" --strict-mcp-config --mcp-config <tmp>/mcp.json --tools ""
    --allowedTools mcp__control__get_time,mcp__control__record_note --permission-mode dontAsk
    --disable-slash-commands --system-prompt "<ours>" --json-schema '<schema>' [--max-budget-usd <n>]
  ```
  Env is a whitelist: HOME, USER, LOGNAME, LANG, LC_ALL, TMPDIR (+ ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN
  if set), PATH = node dir + system dirs, `DISABLE_AUTOUPDATER=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`.
  The task env (CLAUDECODE, OTEL_*, TRIGGER_*, secrets) never reaches the CLI. Binary: `CLAUDE_BIN` or
  `/Users/ink_waffle/.local/bin/claude`.
- [F2] Isolation findings (checked from the stream-json `init` message plus asking the model):
  - No flags, cwd = repo: 84 tools, 8 MCP servers (Damir's postgres-prod, playwright, claude.ai connectors…),
    34 skills, 3 plugins, user + project CLAUDE.md loaded.
  - Our flags: tools = `StructuredOutput, mcp__control__get_time, mcp__control__record_note`; MCP = `control`
    (connected); skills, slash commands = none; the model reports no CLAUDE.md or personal rules. Left over:
    built-in product plugins (`cc-plugin-agents-md`, `cc-plugin-plugin-authoring`), the CLI's short
    environment block (cwd, platform) and the account email line. Nothing project- or Damir-specific.
  - `--setting-sources ""` drops ~/.claude/CLAUDE.md, user settings, hooks, plugins and skills. `--tools ""` drops
    every built-in (Bash, Read, Agent, Web…); MCP tools and the StructuredOutput tool behind `--json-schema`
    still work. `--system-prompt` replaces the default prompt (only a one-line "Claude agent" preamble remains).
  - `--bare` breaks subscription auth (`terminal_reason: api_error`; it reads only ANTHROPIC_API_KEY).
    `--safe-mode` still exposes 25 built-in tools and 19 skills. Neither is used.
  - OAuth works from the stripped env as long as HOME and USER are set (keychain).
- [F2] Agent output uses `--output-format stream-json --verbose` instead of `json`: the final `result` message is
  the same (structured_output, total_cost_usd, num_turns, session_id), and we also get every tool call and
  result. `runAgent` returns them as `toolCalls` and `transcript` for `block_runs`. It throws `AgentRunError`
  (with transcript and stderr) on a timeout, an MCP server that is not `connected`, or a missing structured_output.
- [F2] MCP server `control` (`mcp/server.ts`): the CLI spawns it as `<process.execPath>
  node_modules/tsx/dist/cli.mjs --tsconfig <repo>/tsconfig.json <repo>/mcp/server.ts`. Paths are absolute
  because the agent cwd is a temp dir and the fnm `node` on PATH is per shell. tsx resolves `@/` from that
  tsconfig, and Prisma works inside (`get_time` reads `@/lib/clock`). Context comes from env: `CONTROL_RUN_ID`,
  `CONTROL_ORDER_ID`, `CONTROL_BLOCK_ID`. `CONTROL_TOOLS` narrows the exposed tools per block. The launcher
  passes through DATABASE_URL, DIRECT_URL, OPENROUTER_API_KEY and NODE_ENV. Tools log to stderr only,
  because stdout carries the protocol.
- [F2] Jev adapter: default model `~typesafe/jev-latest` (`JEV_MODEL` overrides; currently
  `typesafe/jev-1.14-20261014`), 20 s timeout, one retry after 750 ms on network error, timeout, 429 or 5xx.
  It throws if an answer is missing. Answer types are inferred from the questions (choice → literal union of
  option keys). Use `defineQuestions()` when questions live outside the call. ~0.5 s, ~$0.00002 per call.
- [F2] Agent concurrency ≤ 2 is NOT enforced in `runAgent`, because each Trigger run is its own process.
  Suggestion for P1: run agent blocks as a child task on `queue({ name: 'agent-blocks', concurrencyLimit: 2 })`
  via `triggerAndWait`, or put playbook tasks on such a queue.
- [F2] Added the shared `vitest.config.mts` (`resolve.tsconfigPaths`); `.mts` avoids Vite's CJS warning.
- [D1] Palette is Bahn's own light theme, read from bahnexpress.fi's CSS tokens (`--bx-color-*`): birch `#fffef7`
  cards on a canvas `#f1eee6`, asphalt `#12110e` ink, warm greys, and Bahn's red, orange, teal and green ramps.
  `app/globals.css` replaces Tailwind's `red/orange/green/teal` with Bahn's ramps and maps `gray/zinc/stone/
  neutral/slate`, `amber`, `emerald` and `sky/cyan` onto them, so stray default utilities stay on brand.
  Semantic tokens: `canvas surface tray sunken ink body secondary muted subtle faint line line-soft
  line-strong`; tones `danger|warn|ok|info|neutral` × `(base) -ink -soft -line`; evidence `ev-requested …
  ev-verified`; `rounded-card` (16px) and `rounded-panel` (12px); `shadow-card|raised|pill|tooltip`;
  `animate-shimmer|pulse-soft`. Type scale is overridden, so `text-base` = 14px (2xs 11, xs 12, sm 13, md 15,
  lg 17, xl 20, 2xl 24, 3xl 30, 4xl 38).
- [D1] Fonts: Bahn's faces are commercial (Owners Wide for display, Duplet Open for body; the deck also uses
  Reddit Mono). Through `next/font/google`: Archivo with the `wdth` axis at 125 as `font-display` (the
  closest Google wide grotesk to Owners Wide), Poppins 400/500/600 as `font-sans` (the fallback Bahn's own
  starter picked for Duplet Open), and Reddit Mono as `font-mono`. Title: "Bahn Control Room" (template
  `%s · Bahn Control Room`); favicon `public/brand/bahn-mark.svg` (Bahn's mark from their site).
- [D1] `app/layout.tsx` wraps every page in `AppShell` (sticky top bar: Bahn mark + "Control Room", pill nav
  Control room `/`, Orders `/orders`, Playbooks `/playbooks`, Meta `/meta`, and a `right` slot). Pages render
  `<PageContainer width='default|narrow|wide|full'>` themselves, which gives `<main>`, the gutter and the max
  width. The right slot is empty for now. U1: pass `right={<Suspense fallback={<ClockIndicator
  simNowMs={null} />}><SimClock /></Suspense>}`, where `SimClock` is an async server component that reads
  `getSimClock()` and renders `<LiveClockIndicator clock={clock} nowMs={simNow} />`.
- [D1] Primitives (all from `@/components/ui/<File>`, or from the barrel `@/components/ui`). Every one except
  the client ones is a server component:
  - `Button`, `ButtonLink`, `buttonClass` (`Button.tsx`): `variant` `primary|secondary|quiet|danger`,
    `size` `sm|md`, `icon`, `iconRight`, plus native button / `next/link` props. All are pills.
  - `Badge` (status word on a soft fill: `tone`, `dot`, `pulse`, `icon`) and `Chip` (outlined fact pill:
    `icon`, `tone`, `mono`, `href`), both in `Badge.tsx`.
  - `EvidenceChip` (`level`, `label?`, `source?`, `at?` as a preformatted string, `caution?`, `href?`; hover or
    focus shows a tooltip; with `href` it renders as a link), plus `EvidenceMark` and `EvidenceLegend`
    (`compact?`), in `EvidenceChip.tsx`. Ladder names live in `evidence.ts` (`EVIDENCE_LEVELS`,
    `EvidenceLevel`, `EVIDENCE_DISPLAY`, `evidenceRank`).
  - `Card` (`as`, `padding` `none|sm|md|lg`, `interactive`), `CardHeader` (`eyebrow`, `title`, `meta`,
    `aside`), `CardSection` (`title`, `aside`, `divided`), `CardFooter` (button tray; assumes padding `md`), and
    `Panel` (`title`, `count`, `actions`, `variant` `sunken|outline`), in `Card.tsx`.
  - `Countdown` (`remainingMs: number | null`, `reason`, `until`, `label` = 'Decide in', `layout`
    `block|compact|inline`, `warnBelowMs` = 60 min, `dangerBelowMs` = 15 min), in `Countdown.tsx`.
    `LiveCountdown` (client) takes the same props but `endsAt` (ISO, ms or Date, or null) instead of
    `remainingMs`, plus one time source: `clock` (the `ClockState` from `@/lib/clock/math`; a Date-bearing
    object passes from server to client fine), `nowMs` (sim now at render; it advances at `speed` from mount),
    or `now: () => number` (client parents only). All live clocks share one 1 s ticker.
  - `ClockIndicator` (`simNowMs`, `speed`, `paused`, `timeZone` = 'UTC'; shows the zone) and the client
    `LiveClockIndicator` (same, plus `clock`, `nowMs` or `now`).
  - `KeyValueList` (`divided`) and `KeyValue` (`label`, `hint`, `aside` for an evidence chip, `tone`, `mono`),
    in `KeyValue.tsx`.
  - `Timeline` and `TimelineItem` (`speaker`, `role`, `at`, `kind`
    `driver|customer|site|provider|agent|operator|system`, `icon`, `source`, `last`, children = the text), in
    `Timeline.tsx`.
  - `Slack` (`slackMs: number | null`, `label?`) for promise slack per option: green with room, orange under
    4 h, red when late, dashed when unknown. In `Slack.tsx`.
  - `EmptyState` (`icon`, `title`, `action`, `size` `page|inline`, children = what was checked);
    `Skeleton`, `SkeletonText` (`lines`), `SkeletonCard` (decision-card footprint); `PageHeader` (`eyebrow`,
    `title`, `description`, `meta`, `actions`).
  - `AppShell` (`right`), `PageContainer`, `NavLinks`/`NAV_ITEMS` (client, `usePathname` inside Suspense).
  - `Icon` (`name`, `size` = 16, `label?`) with `ferry car driver warning clock check cross phone hotel train
    truck plane pin arrow chevron message agent operator document photo info shield lock flow spark edit
    external search play pause inbox flag key building euro`, plus `BahnMark`. Helpers: `cx`, `Tone`, the
    `TONE_*` class maps in `tone.ts`, and `formatDuration`, `countdownTone`, `slackTone` in `time.ts`.
- [D1] `/design` (`app/design/page.tsx`) is the living style guide: a full CD-420299 decision card, a queue
  sorted by decide-by, the evidence ladder, countdown states, buttons and statuses, facts and timeline, empty
  and loading states, foundations and icons. It needs no DB; the sim "now" there is fixed at the dataset
  snapshot. U1 can lift `DecisionCardExample`, `OptionRow` and `QueueRow` from that file. Screenshot:
  `public/brand/design-preview.png`.
- [D1] `components/ui/evidence.ts` keeps its own `EVIDENCE_LEVELS` because `lib/evidence/ladder.ts` did not
  exist yet. When C1 adds it, re-export the levels and type from there (a one-line change) and keep only the
  display text here.
- [D1] `next dev` re-creates `AGENTS.md` at the repo root (Damir deleted it in bf60fdd). I removed it after my
  run. To stop it, set `agentRules: false` in `next.config.ts` (not my file).
- [D1] For screenshots I used a separate headless Chrome over CDP, not the shared debug Chrome, because another
  agent was active there. The debug Chrome was used only to read bahnexpress.fi, in my own tab, now closed.
- [C2] Taxonomy (`lib/watchman/taxonomy.ts`): 21 closed trigger types, P1–P18 plus `GATE_REJECTED` (P3),
  `DATA_CONFLICT` and `ROUTINE`. Only three route to a playbook: `CROSSING_CAPACITY` → `missed-ferry` (sold out,
  booking failed or unknown, sailing missed), `VEHICLE_WARNING` → `vehicle-warning`, `PICKUP_NOT_CONFIRMED` →
  `pickup-unconfirmed`. Everything else has `playbookId: null`: messages fall to the escape hatch, monitors and
  records are signal only. `CROSSING_AT_RISK` (M1) and `GATE_REJECTED` are deliberately not sent to missed-ferry.
- [C2] Routing (`lib/watchman/routing.ts`): pure `decideRoute`, params in one object `ROUTING_PARAMS` (per-trigger
  `{ playbookId, threshold }`, `needsAttentionThreshold`, `triageSources`, `dispatchDedupeMinutes`). Defaults
  from the eval: playbook triggers 0.7, `PICKUP_NOT_CONFIRMED` 0.8 (from text it is confused with "car not found"),
  needs_attention 0.7, triage only for `message` sources. Multi-label: every distinct playbook above its
  threshold is dispatched, best first.
- [C2] The escape hatch lives in the watchman, not in a Trigger task: a TRIAGE card with `playbookId:
  'escape-hatch'`, title, ≤3-line summary, `agentActions` (the watchman's classification) and `factIds` (C1's
  `syncOrderFacts` + `listOrderFacts`, the triggering message's fact first, ≤ 40). There is one OPEN triage card
  per order; later items are appended to it. If the order has an active playbook run, the item is attached to
  that run (`routing.attachedRunId`) instead. `decideBy` = the next hard commitment within 72 h (pickup slot
  start, unchecked ferry cutoff, paid train or flight departure, promise start), else null.
- [C2] Dispatch gate: `tasks.trigger` with an unknown task id succeeds and the run waits in the queue forever
  (verified). So the watchman triggers only when `playbooks/<id>/index.ts` exists (`WATCHMAN_PLAYBOOKS=a,b` forces
  it). Otherwise the signal records `dispatches[].status = 'not_dispatched'` with the reason. Nothing replays
  those later. The payload is `{ orderId: 'ord-…', orderRef: 'CD-…', signalId, triggerType }`; `orderRef` is extra
  and P1's `PlaybookPayload` ignores it.
- [C2] Dedupe:
  - Playbook: an active `playbook_runs` row for (order id or ref, playbook) that is not CLOSED or FAILED, or a
    signal that `triggered` it in the last 30 real minutes. On top of that, a global Trigger idempotency key
    `watchman:<orderId>:<playbookId>` (TTL 30 min); verified that a second dispatch returns the same run.
  - Message or record: one signal per source ref unless `force`.
  - Monitor: one signal per hit key `M<n>:<orderId>:<slot | reservation | assignment:lastObs | option>`.
    Signals with `simAt` after sim now are ignored, so a clock rollback cannot suppress real hits later.
- [C2] Signal row: `orderId` = bahn order id; `source` = message | record | monitor; `sourceRef` = message id,
  `<collection>:<id>` or the monitor key. `answers` = classification plus raw Jev answers. `routing` =
  `RoutingDecision` + `dispatches[]` + `card?` + `attachedRunId?` + `error?`. `runId` is left null because the
  playbook owns `playbook_runs`. If Jev fails, the signal is still written with the error and the run fails.
- [C2] Monitors (`lib/watchman/monitors.ts`) are pure over a `MonitorBundle` (a raw-free slice of `OrderBundle`).
  The tick bulk-loads all 77 active orders in 10 queries and loads a full bundle only for new hits. Deviations
  from the backtest:
  - M8 counts "no tracking" from the assignment start, so CD-420735 (started 07:33) fires at 10:34, not at 09:00.
    M8 also skips while the car is on a booked ferry.
  - M2 lead is 0 min (the backtest used 60).
  - M10 needs a future sold-out sailing and no booked ferry.
  Monitor hits skip Jev (p = 1). A record webhook runs the order's monitors first, then Jev on the record.
- [C2] Only inbound messages (driver, site_contact, customer, handoff_contact) are classified; operator and agent
  messages are skipped. Cut: support-inbox messages (no order) are skipped.
- [C2] `watchman-tick` uses `cron: { pattern: '* * * * *', window: '0m' }`. Trigger 4.8 otherwise applies a
  60-minute default "cron window", which moves each run to a stable random offset.
- [C2] Jev wording matters. Trigger questions judge only what the triggering item says or shows; background gaps
  (an unrecorded plate, an unconfirmed contact) do not count. `needs_attention` excludes factual replies the
  records already answer. Before that change, INTAKE_INPUT_MISSING and DATA_CONFLICT fired on 65 of 98 messages
  and 70 of 98 would have opened a triage card. Now they fire on 19 and 13 (at ≥ 0.5), and 61 messages on 30
  orders reach the escape hatch.
- [C2] State (`lib/watchman/state.ts`) is JSON made of short lines, 3–7 KB including C1's
  `renderLadderForDecisions()` (1.8 KB). The wording names the evidence level, e.g. "QUOTED EUR 387 as of a check
  2 h ago (stale, re-check…); NOT booked". `clipBundle({ bundle, asOf })` rolls the records back to a time, so the
  eval has no leakage from later records.
- [C2] S3 collateral: the dataset is frozen, so a one-day clock jump makes every tracker stale and passes every
  slot. The jump to 22 Oct 10:02 produced 21 extra M1/M2/M8 signals. I restored the clock and deleted them, keeping
  the S3 proof row. For a demo, run S3 last, then run `pnpm clock:local --at <printed>` and delete
  `control.signals` where `sim_at` > now.
- [C2] Backfill left OPEN triage cards on orders that now also have playbook runs (e.g. CD-420299). The attach rule
  only covers items that arrive after a run exists. Suggestion for P1/U1: fold or cancel an order's open TRIAGE
  card when a playbook run opens a DECISION card for that order.
- [C2] I once ran `prettier --write scripts`, which may have reformatted P1's `scripts/playbooks/converse.ts`
  (formatting only).

- [C1] `lib/evidence/ladder.ts` is the single source of the ladder as data: `EVIDENCE_LEVELS` (same order as the
  Prisma enum), 61 `FACT_KINDS` (domain, default level, bahn sources, "does not prove"), 31 `CLAIM_KINDS` (minimum
  evidence as `anyOf` requirements: kinds + min level + value `where` + optional quote age), and `LADDER_CHAINS`
  (Damir's rungs and rules per domain). Renderers and the gate read only this file. Level choices that are judgement
  calls: a customer- or site-supplied promise/slot is BOOKED (an outside party committed) while SYSTEM/OPS ones are
  PLANNED; tracking is STATED (an app estimate); a sold-out check is QUOTED; a timed-out booking attempt is its own
  OBSERVED fact `BOOKING_OUTCOME_UNKNOWN` (never "not booked"); a proof/document/expense takes its level from its
  status (e.g. CMR PREPARED = PLANNED, SIGNED = OBSERVED, VERIFIED = VERIFIED; expense APPROVED = VERIFIED, but the
  claim PAID needs a `PAYMENT_RECORD`, which only a tool can write).
- [C1] Fact ids are deterministic: `id = factIdFor(dedupeKey)` (`f_` + 14 hex of a 53-bit hash), dedupeKey
  `bahn:<collection>:<recordId>:<KIND>[:suffix][@<orderId>]`. So the pure projection, the DB and tests share ids
  and agents can cite them before any DB write. Records filed on another order (shared sites, related-order threads,
  bundle offers, related work items, candidate inbox threads) get `@<orderId>` because `dedupe_key` is unique;
  records on their own order keep the plain key (P1's `messageFactId` stays valid).
- [C1] `Fact.orderId` is the bahn order id (`ord-00299`). Every read/write in `lib/facts` accepts either form
  (`CD-420299` or `ord-00299`) and resolves via `findOrder`.
- [C1] `syncOrderFacts` upserts by dedupeKey, compares jsonb with sorted keys (jsonb reorders keys), fixes a wrong
  `orderId`, and prunes this order's BAHN_RECORD rows whose key is no longer projected (it removed 9 rows written
  under P1's early unscoped keys). Re-running is a no-op (2187 unchanged in 0.6 s).
- [C1] `writeFact` accepts only ladder kinds and caps `AGENT_INTERPRETATION` at STATED; the gate also treats such
  facts as at most STATED. With a `dedupeKey` it upserts with the deterministic id, otherwise the DB uuid.
- [C1] Projection skips: assignment steps, internal notifications, custody asset events, demand signals/windows,
  reach checks, and most lifecycle events (only pickup/delivery scans, customer approvals and window revisions become
  facts). No synthetic "absence" facts; absence rules live in the ladder text. The driver's stated limit is parsed
  by one narrow regex ("can wait another N minutes"); other limits need an agent/tool fact `DRIVER_STATED_LIMIT`
  with `value.at`.
- [C1] Chain simplifications: terminal → delivery road time comes from the quote's capacity note ("about N hours
  from arrival terminal") or a 3 h default (that default gives evaluation.md's 42 h for CD-420299); road-only ETAs
  use 70 km/h plus 11 h rest per 9 h driving; a `DRIVE_WITH_FERRY` route without a booked sailing has no ETA
  (verdict `unknown`). Verdict `early` = keeps the promise but arrives > 12 h before it starts (custody nights =
  ceil(hours/24)). Hotel nights at the terminal = ceil(wait/24) when the wait before cutoff exceeds 8 h. Prices for
  hotels, custody and return travel stay "unknown (X)". Site opening hours are not checked (warning only).
- [C1] decide-by candidates: first paid departure (booked train/flight/ferry), booked-ferry cutoff without a gate
  check-in, `POSITIONING_PURCHASE` (departure of the cheapest quoted positioning leg that still reaches the slot,
  when nothing is booked), the driver's stated limit, and the pickup slot start (assignment not started); an option
  adds its own cutoff/departure. Earliest wins. Each has `factId`, plain `reason` and `label` ("until … — …").
- [C1] Gate: G1, G2, G3, G4, G5, G6, G7, G9, G11 are implemented; G8 is a warning only (a booking that waits for
  a fresh check at execution); G10 is not implemented. G4 uses structural payload fields first, then a
  conservative phrase list with a negation guard ("do not restart" passes, "try restarting" blocks; mechanical
  phrases only in a vehicle-warning case, detected from INCIDENT/ALERT facts). A Jev noul check ("operate vs stop
  instruction") could back the phrase list later. G3 also infers claims from payload flags (`mark_boarding_confirmed`,
  `tell_customer_issued`, …) and from outbound sentences ("is booked", "has boarded"…). Facts observed after `now`
  are invisible, so replays have no leakage. For the 14 recorded proposals `now` = `created_at`; for the final payload
  `now` = `reviewed_at`. REJECTED proposals' `final_payload` equals the rejected one, so only EDITED final payloads
  are checked (all 3 pass).
- [P1a] Runtime split: `lib/playbooks/interpreter.ts` (pure graph walker: `walkGraph`, `selectEdge`,
  `validatePlaybook`, `definePlaybook`), `runtime.ts` (run row, preconditions, `block_runs`, statuses),
  `blocks/*` (one executor per kind + `gateStep`), `adapters/` (`trigger` | `inline`). The inline adapter runs the
  same runtime in-process (agents spawned directly, the card token polled over the API), so
  `scripts/playbooks/run.ts --inline` works without a dev worker; unit tests use fake executors.
- [P1a] Agent blocks run as the child task `agent-block` on queue `agent-blocks` (`concurrencyLimit: 2`) via
  `triggerAndWait`. The child writes the transcript, model and cost onto the parent's `block_runs` row, so big
  transcripts never travel through task outputs; the parent re-validates the output with the block's zod schema.
  `block_runs.input` of an agent block holds `systemPrompt`, `prompt`, `tools`, `model`, `jsonSchema`, `feedback`
  (the full replay input for meta backtests). Playbook tasks and `agent-block` have `retry.maxAttempts: 1`
  (a retry would re-run every agent block).
- [P1a] Lifecycle: DETECTED on create, GATHERING once preconditions pass, a block's `status` on entry (the gate step
  sets OPTIONS_READY), human → AWAITING_DECISION, execute → EXECUTING; the terminal block's `status` (CLOSED or
  ESCALATED) ends the run; an exception → FAILED (the task rethrows so Trigger shows it). Failed preconditions or an
  unknown order → ESCALATED plus a TRIAGE card (playbookId = the playbook).
- [P1a] `playbook_runs.orderId` and `cards.orderId` = bahn order id (`ord-…`), like facts and signals; the payload
  accepts either form (`orderRef` from the watchman is ignored).
- [P1a] Tools write facts only through `lib/facts` (`lib/playbooks/facts.ts` is a thin wrapper) with dedupeKeys.
  `ask_driver` / `ask_site` insert the question and the simulated reply into `bahn.messages` (author_type `agent`,
  author_id `control-agent`; reply +1 s), then `syncOrderFacts`; the tool returns the projected ids
  (`messageFactId`), so a reply is one DRIVER_STATEMENT / SITE_STATEMENT fact, never a duplicate.
- [P1a] Fact kinds written by tools: `search_ferries` FERRY_QUOTE / FERRY_SOLD_OUT; `search_trains` TRAVEL_QUOTE
  (mode TRAIN); `search_hotels` TRAVEL_QUOTE (mode HOTEL, no HOTEL_QUOTE kind in the ladder); `find_roadside`
  TOOL_RESULT at QUOTED; `ask_provider` BOOKING_RECONCILED (OBSERVED, `value.proposalId`, clears G9) or TOOL_RESULT
  (STATED) while the provider is still checking; `record_interpretation` TOOL_RESULT with sourceType
  AGENT_INTERPRETATION (capped at STATED; C1 could add an `AGENT_INTERPRETATION` kind). Fresh quotes carry
  `value.quote` (what execute books), `datasetOptionId` instead of `travelOptionId` (otherwise the chain resolves the
  stale dataset quote), and the order's own `roadTimeToTerminalHours`.
- [P1a] Mock travel provider: ferries = the dataset timetable for the route (latest check per departure wins,
  sold-out stays sold out, dataset price), plus generated sailings for days without records at the route's usual
  hours, median duration and cutoff, ~20 % sold out, seeded by route + day. Trains, hotels and roadside are seeded by
  their inputs. Operators are the dataset's fictional ones plus "Nordic Tern Ferries", "Baltic Lumen Line".
- [P1a] Conversation simulator: `lib/providers/scripts/<orderRef>.json` (first regex match per party wins;
  `CONVERSATION_SCRIPTS=off` disables) else a haiku persona built from the bundle (name, home city, assignment,
  windows, bookings on record, last 8 messages) told never to claim a booking that is not listed. ~$0.0006 a reply.
- [P1a] Execute: bookings first (provider re-check = G8; sold out now → FAILED effect), each → FERRY_BOOKING /
  HOTEL_BOOKING / TRAVEL_BOOKING at BOOKED, sourceRef `tool:book_<ferry|hotel|train>:<ref>`, `value.status BOOKED`.
  Then messages; a driver message gets "Booking references: …" appended. Drafts must not say "is booked" (C1's G3
  text rule blocks it). CANCEL_TRAVEL, CHANGE_*, MARKET, MONEY effects are `MANUAL` (operator in Bahn's system).
- [P1a] Gate step = C1 `computeChain` per option + C1 `checkProposal` on the option as a `Proposal`
  (`payload.quote_fact_id`, `payload.message`, `evidenceFactIds` = option facts, `mode: 'draft'`) + local checks
  (exact message text, sold-out hotel, infeasible chain). One re-ask with the violations as feedback; what still
  fails gets `blocked: { ruleId, message }` and loses the recommendation. Its `now` is max(sim now, this run's
  newest fact), because a tool can stamp a fact a moment after the block's last refresh (seen live: a G11 "observed
  after the decision time" re-ask on CD-420154).
- [P1a] Human block: the card's `decideBy` comes from the playbook's card builder (missed-ferry: the recommended
  option's chain `decideBy`, else `deriveDecideBy`; `decideByReason` = C1's label "until … — …"). Token timeout =
  decideBy (sim → real) + `decisionMarginMinutes` (sim), at least 15 real min; 24 h when there is no decideBy or the
  clock is paused. On a decision it writes an OPERATOR_DECISION fact (VERIFIED, `card:<id>`); on expiry the card is
  EXPIRED. Creating a DECISION card cancels the order's OPEN `escape-hatch` TRIAGE card (`decision.foldedInto`),
  as C2 suggested.
- [P1a] Cuts: G10 is not checked; no wait block in missed-ferry (the kind is implemented and unit-tested; P1b's
  pickup-unconfirmed uses it); no separate router in lib/playbooks (C2's `ROUTING_PARAMS` maps trigger → playbook id,
  `registry.playbooksForTrigger` exists for the UI); `package.json` untouched, so scripts run via
  `pnpm exec dotenv -e .env.local -- tsx scripts/playbooks/<script>.ts` (suggest `playbook:*` aliases).

- [U1] Paths: `lib/control-room/*` (server queries `home.ts`, `card.ts`, `order.ts`, `orderList.ts`, `records.ts`;
  server actions `actions.ts`; pure helpers `format.ts`, `text.ts`, `facts.ts`, `options.ts`, `events.ts`,
  `playbooks.ts`, `time.ts`, `types.ts`), `components/control/*` (domain components), `app/page.tsx`,
  `app/cards/[id]`, `app/orders`, `app/orders/[ref]` (+ `not-found.tsx`), the clock slot in `app/layout.tsx`,
  `scripts/dev/fixture-card.ts`. Every page reads the DB inside `<Suspense>` after `connection()` (`loadNow()`).
- [U1] Times: the desk zone is `Europe/Helsinki` (`OPERATOR_TZ`); every UI time names its zone and keeps UTC in a
  tooltip. Windows render in their own zone. Block runs and cards are stamped in real time, so `simTimeOf` maps them
  onto the sim timeline (exact while the clock has not been re-anchored since, else run-relative); `asSimTime`
  accepts `cards.decided_at` written in either (my action writes sim time, P1a's human block overwrites it with
  `new Date()`; suggestion for P1a: write `ctx.simNow`).
- [U1] Home: decisions sorted by decideBy (nulls last); TRIAGE cards are hidden, not closed, while the order has an
  OPEN DECISION card or an active run (P1a's `createDecisionCard` already cancels them); "Agents on it" = active runs
  not awaiting a decision, current block in plain words ("Asking the ferry company…", "Waiting until 11:05 EEST,
  before …"); "Decided recently" (3) shows the run's state after the decision; quiet = active orders with nothing open.
- [U1] Titles: a DECISION card's generic title ("…needs a decision") gives way to the first sentence of its summary
  ("The first sailing is sold out"), which then leaves the "what happened" lines (`decisionTitle`). Suggestion for
  P1a: have the card builder write that specific title. TRIAGE titles = the watchman's trigger label; the quote line
  carries the speaker. Agent prose is shown without internal fact ids (`cleanAgentText`); the chips carry sources.
- [U1] Decide action (`decideCard`): checks DECISION + OPEN + token, claims the card with `updateMany(status OPEN →
  APPROVED|EDITED|REJECTED)` (double-click guard), then `wait.completeToken`; on failure it reverts to OPEN and the
  operator sees "Your decision did not reach the agent (…). Nothing was changed". Edit form → P1a contract: ticked
  steps → `edits.removeActionIds`, changed message texts only → `edits.messages`, free text → `edits.note`, the
  required reason → `note`; reject needs a note; `decidedBy: 'operator'`. After EDITED/REJECTED it triggers
  `meta-learn` `{ cardId }` (idempotencyKey `meta-learn:<cardId>`) only if `trigger/meta*.ts` or `lib/meta` defines
  that id. TRIAGE: "Handled" (note required) → APPROVED, "Dismiss" → CANCELLED, decision `{ action, note }`.
- [U1] Fact chips (`components/control/FactChip.tsx`) copy D1's EvidenceChip fills but are buttons: click opens a
  source view (level and meaning, statement, source in words e.g. "Bahn record · Travel reservation" + record id,
  observed local time + age + UTC, kind) and "Show the record" lazily loads the bahn row (or the tool's value) as a
  key-value list via a server action, never JSON. Chip text: kind + time only for event-like kinds (date when not
  today), quote age for quotes with the G5 caution over 90 min. Rows of chips put one per kind first.
- [U1] Triage cards from the backfill carry no fact ids (16 of 17); their page shows the order's key facts instead
  (commitments, bookings, contacts, latest statements; ≤ 12). Agent steps with zero tool calls say "No new lookups in
  this step; it worked from facts already on file", because the CD-420154 find_options agent wrote "I re-checked
  sailings, hotels and trains" with no tool call in its transcript (for P1a: worth a rule or a gate check).
- [U1] Order page: route strip (pickup → legs with booked crossings → delivery, each window with who set it and its
  fact), open card callout, one merged timeline (messages, support inbox, one-sentence Bahn events, watchman signals,
  agent tool calls, agent block summaries, tool/operator facts, cards and decisions; last 30 shown, earlier folded,
  grouped by day), facts by level (strongest first, foldable), run traces block by block. Event sentences are a
  trimmed port of the starter's `describeEvent`.
- [U1] Sim clock: `components/control/SimClock.tsx` (server) → `SimClockControl` (client) in the layout's right slot:
  D1's `LiveClockIndicator` in `Europe/Helsinki`, popover labelled "Simulation" with Pause / 1× / 30× / 120× / Jump
  ahead 1 hour (server actions → `setSimClock`). `AutoRefresh` (5 s `router.refresh`) on home, card and order pages,
  skipped while the tab is hidden or an input has focus.
- [U1] Cuts: no "Ask agent to…" button; no pagination on /orders (100 rows); no per-option driver-chain detail beyond
  the at-risk flags; polling instead of push; `notFound()` inside Suspense streams the not-found UI with HTTP 200.
- [U1] Suggestions for D1 (not changed): export the EvidenceChip fill map or give it `onClick`, so clickable chips
  need no copy; at 390 px the nav pills and the clock overlap in AppShell (hide the day or the nav labels);
  `devIndicators: false` would keep the Next badge out of screenshots; Countdown `block` could clamp long reasons.
- [U1] State left on LOCAL: CD-420154 (approved A via the UI) and CD-420360 (edited A via the UI) now have simulated
  bookings; use `scripts/playbooks/reset.ts <ref>` before demoing them. Triage card `687a71c6…` (CD-420009) was
  marked handled in a test and restored to OPEN. The fixture card was deleted. The clock was only re-anchored by a
  no-op Pause click (still paused at sim 21 Oct 09:41Z). Someone else's run on CD-420154 at 21:45 real time removed
  the first run's tool facts; old cards' tool calls now fall back to an "Agent tool" chip.

- [U2] Paths: `lib/meta/*` (types, whitelist, params, load, replay, judge, propose, backtest, learn, store, stats,
  index, meta.test.ts), `trigger/meta.ts` (task `meta-learn`, queue `meta`, limit 1), `scripts/meta/{learn,amendments,
  clean-order}.ts`, `components/catalog/*`, `app/playbooks`, `app/playbooks/[id]`, `app/meta` (+ `actions.ts`).
- [U2] Learning input: `meta-learn { cardId, force? }` waits up to 2 min until the card is not OPEN **and** carries a
  decision payload, because the UI claims the card (EDITED) before the run writes the payload. It learns only from
  EDITED or REJECTED DECISION cards that have a run. It loads the latest COMPLETED block run of every agent block, the
  current instructions and the amendments in force. The correction in words (`describeCorrection`) = the note, the
  chosen vs the recommended option, rewritten messages and removed actions. Idempotent per card (`force` re-learns).
- [U2] Proposer: sonnet through `runAgent` with no tools (`mcpServers: {}`, `allowedTools: []` works) and a zod
  schema: `generalizes`, `reasoning`, ≤ 2 amendments. PARAMETER values are `[{ key, value }]` (a JSON-schema record is
  awkward for the CLI). The prompt holds the playbook steps and rules, the fixed guardrails, each agent step's
  instructions + amendments in force + its recorded output, the card, the correction and the whitelist with current
  values. Order-specific corrections give `generalizes: false` (seen live on U1's CD-420360 edit: "about this one
  receiver", no amendment).
- [U2] Replay, not re-run: an INSTRUCTION backtest replays the recorded agent input (`block_runs.input` system prompt
  + prompt; the amendment is inserted exactly where `renderAmendments` puts it) with tools OFF and the recorded tool
  calls and results from the transcript inlined ("Replay mode"). No side effects (no facts, driver messages or
  bookings); about $0.10–0.20 per replay. Limitation: a text that needs new tool calls cannot be replayed fully.
- [U2] Judging: the baseline is the recorded output (saves a replay). Jev noul "does this output follow the operator's
  correction" on a compacted output, before vs after. Regression = up to 2 other recorded runs of the same block,
  replayed with the text, Jev noul "still a sensible answer" ≥ 0.5. The gate (chain + `checkOption`) runs on the
  replayed options with the facts recorded before the block finished. Only rules the recorded answer did not already
  break count, because deleted tool facts make old answers fail G11 too (the first S5 learn was wrongly discarded for
  exactly that; fixed and re-run).
- [U2] Keep-if-better: improved = follows gain ≥ 0.15, no new rule violation, output shape valid, 0 regressions. If not,
  one autoresearch revision (the proposer sees its text and the backtest and sharpens it); the better attempt is kept,
  the other is listed under "tried first". Not improved → stored REJECTED with `decidedBy: 'backtest'` ("Discarded by
  the backtest" on /meta), so the chief dispatcher sees only candidates that beat the baseline.
- [U2] PARAMETER whitelist (`parameterWhitelist(definition)`, `listParameterWhitelists()`), built from the registry:
  gate `quoteBlockMinutes` [30–240] and `quoteWarnMinutes` [15–180] (warn < block enforced); per wait block
  `<blockId>.defaultMinutes` [5–720] and `<blockId>.bufferMinutes` [0–240]; per routed trigger
  `routing.<TRIGGER>.threshold` [0.5–0.99]; every other numeric declared param (`earlyCustodyHours` [2–72] → chain,
  `decisionMarginMinutes` [0–240], `maxOptions` [1–3], P1b's `defaultRoadHoursToTerminal`, `answerBufferMinutes`).
- [U2] PARAMETER backtest: Bahn's 14 recorded proposals through `checkProposal` with old vs new gate params (blocked,
  corrected ones caught, approved ones falsely blocked); the playbook's decided card options through chain +
  `checkOption` (blocked, promise-verdict changes, the operator's choice falsely blocked); `routing.*` keys re-route the
  recorded message signals with `decideRoute`; wait keys recompute recorded waits with `computeWaitDuration`.
  improved = no new false block. Not exercised live: both live learns chose INSTRUCTION.
- [U2] Applying PARAMETER amendments, edits outside my paths:
  - `lib/playbooks/amendments.ts`: new `numericOverrides({ params, defaults })`.
  - `lib/playbooks/blocks/gate.ts`: the gate step's `computeChain` now gets `parameters: numericOverrides({ params:
    ctx.params, defaults: DEFAULT_CHAIN_PARAMETERS })`; `earlyCustodyHours` was declared but never reached the chain.
  - `lib/watchman/inspect.ts`: `inspect()` uses `args.params ?? await resolveRoutingParams()` (`lib/meta/params.ts`:
    ROUTING_PARAMS + approved `routing.*` amendments). Monitor hits keep ROUTING_PARAMS (p = 1 passes any threshold).
  - Verified already applied by P1a: gate quote params and wait timings via `ctx.params`; INSTRUCTION text via
    `prompt.ts` (S5 below).
- [U2] Catalog: diagrams are laid out on the server with dagre (`components/catalog/layout.ts`) and drawn read-only
  with React Flow: a custom node and an edge that follows dagre's route points and label spots. The overview's main
  chain is dagre LR without edge labels (labels widen every gap); the escape hatch and the meta-system sit on a second
  row with hand-routed edges. Block panels are server components rendered per block and handed to a small client
  `PlaybookExplorer` that only switches which one shows; `?block=<id>` preselects. Inline code in instructions is
  shown in plain words (`FERRY_QUOTE` → "ferry quote", `earlierBlocks.gather` → "the gather step's result", tool names
  → their description); everything else is the same markdown the agent gets. Node heights follow the content; the
  canvas is capped at 1150 px, so a 14-step playbook (pickup-unconfirmed) renders at about 0.8 zoom.
- [U2] /meta: server actions `approveAmendment` / `rejectAmendment` → `decideAmendment` (status, `decidedBy:
  'chief-dispatcher'`, `decidedAt`) + `refresh()`, no auth (demo). INSTRUCTION "before → after" = the step's
  amendments in force → the same plus the new text (written instructions foldable); PARAMETER = label, old → new.
- [U2] S5 ran on CD-420154, not CD-420299: `reset.ts CD-420299` would have deleted U1's fixture run and card, then in
  use. `scripts/meta/clean-order.ts` instead deletes only an order's non-Bahn facts and `msg-ctl-*` messages and keeps
  runs and cards. I ran it on CD-420154 before run 1 and before run 2, so run 1's OPERATOR_DECISION fact (with the
  operator's note) could not leak into run 2. This is what removed the older CD-420154 tool facts U1 noticed.
- [U2] Someone re-anchored the sim clock during S5 (sim 22 Oct 12:35, speed 10). Run 2 ran at sim 22 Oct 12:53, a day
  after run 1. I did not touch the clock.
- [U2] Cuts: no auth on approve/reject; the chief dispatcher cannot edit the text before approving; no shadow mode,
  expiry or override counts (meta_loop §3.5–3.6); no monitor or new-playbook induction (only INSTRUCTION and
  PARAMETER); the regression set is the 2 latest other runs of the block; no rollback UI for an approved amendment.

- [P1b] Three playbooks: `vehicle-warning` (P5), `pickup-unconfirmed` (M2/S3 + Damir's example), `driver-unavailable`
  (P4). All are registered in `lib/playbooks/registry.ts` and have Trigger tasks (task id = playbook id). Routing:
  `DRIVER_CANNOT_MAKE_PICKUP` → `driver-unavailable` (threshold 0.7, `PLAYBOOK_IDS.driverUnavailable`); C2's routing
  test now expects four routed triggers. Every block has a plain-language title and description, every agent block an
  `instructions/<block>.md`, every playbook a `rules.md`. The models are haiku for asking and sonnet for options.
- [P1b] "Prepare, then green light": every playbook does the asking, looking up and chain work itself, and brings a
  person exactly one card. A clear answer closes without a card. In driver-unavailable a clear "yes" from the driver
  closes the run (`close_confirmed`). In pickup-unconfirmed a "collected" (STATED, recorded via
  `record_interpretation`) closes it with "site confirmation pending" (`close_stated`), and so does a pickup scan.
  The agent never decides.
- [P1b] Deadline-aware wait (Damir's correction): `pickup-unconfirmed.next_commitment` lists the hard deadlines after
  the pickup:
  - the slot end;
  - leave-by for a booked ferry = cutoff − road hours (the order's ferry option `roadTimeToTerminalHours`, else param
    `defaultRoadHoursToTerminal` = 2);
  - paid train or flight departures;
  - on road-only orders, leave-by for the promise = promise end − the chain's drive hours.

  It writes a plain `explanation` ("…only 105 min away, so waiting 120 min is not affordable: wait at most 75 min…").
  The wait block gets the earliest deadline through `nextCommitment`, so P1a's `computeWaitDuration` reason lands on
  `block_runs.input.reason`, the card notes and the card summary. `scripts/playbooks/run.ts` prints it under the wait
  block. Params `wait_confirmation.defaultMinutes` (120) and `wait_confirmation.bufferMinutes` (30) are declared, so
  PARAMETER amendments can tune them.
- [P1b] Additions outside the playbook folders, all small:
  - `lib/playbooks/options.ts`: the `change.type` enum gains `REPLACE_DRIVER`; `factId` = the backup-driver fact.
    `toChainOption(change, facts?)` reads its `driverId`, so the chain shows the EUR at stake and the G7 warning. The
    `quoteFactId` description now also covers MARKET (backup fact) and MONEY (roadside fact). For missed-ferry this
    only changes schema text; its answers are unaffected.
  - `lib/playbooks/blocks/gate.ts`: `gateStep({ context })` passes `Proposal.context` to `checkProposal`.
    vehicle-warning sets `{ vehicleWarning: true }`, because synthetic S2 orders (CD-420145) have no INCIDENT/ALERT
    fact and C1's G4 phrase check would otherwise stay off.
  - Gate `now` grace: a fact observed within 60 s after sim now counts as seen. With the clock paused, a simulated
    reply is stamped now + 1 s and has no runId. This caused a false G11 ("observed after the decision time") and a
    $0.11 sonnet re-ask on the first CD-420322 run; it has been gone since.
  - `lib/playbooks/simulated.ts` + `executeActions`: an approved MARKET action whose `quoteFactId` is a
    `find_backup_drivers` fact → `sendDirectedOffer` → OFFER_EXPOSURE (status NOTIFIED, OBSERVED,
    `tool:directed_offer:<offerId>`). The current assignment is untouched (G7). An approved MONEY action on a
    `find_roadside` fact → `orderRoadside` → TOOL_RESULT at BOOKED (`tool:book_roadside:<ref>`). Both run before
    messages, so a driver message gets "Booking references: TOW-…" appended. MONEY and MARKET without such a fact stay
    MANUAL.
  - `lib/playbooks/stepHelpers.ts`: shared step helpers (fact refs, selected windows, active assignment, next duty,
    recommendation text, blocked notes).
- [P1b] Tools and providers:
  - New MCP tool `find_backup_drivers` (`mcp/tools/findBackupDrivers.ts`). It also exports `searchBackupDrivers` for
    deterministic steps. It is backed by the new `DriverPoolProvider` adapter (`DRIVER_POOL_PROVIDER`, default `mock`):
    active `bahn.drivers` in the pickup country with no open assignment whose slot→promise span overlaps
    [slot − 2 h, promise end]. Same city ranks first, then a seeded likelihood. Reach is seeded (20–55 min same city,
    "roughly 3–8 h (estimate)" otherwise). Candidates become TOOL_RESULT facts at QUOTED ("free at the check, not
    asked").
  - `RoadsideProvider.order` (simulated reference).
  - Conversation scripts gain `noReply: true`. Silence: `ask_driver`/`ask_site` send the question and return
    `reply: null`, and `ConversationReply.reply` is now `string | null`.
  - `askParty` enforces G4 before sending: mechanical/driving advice or blame phrases (C1's patterns, with the negation
    guard) throw "G4: not sent…", so the agent rephrases. This applies to every playbook; shared rule 6 already
    forbids that advice everywhere.
- [P1b] Vehicle-warning:
  - A stopped car has no ETA. The card builder replaces each option's `chain.promise` (C1's stale app ETA said
    "holds" on CD-420322) with verdict `unknown`, slack null and an honest `etaBasis`. It also adds "Expect a late
    delivery…", an owner approver, and "Tow price unknown" for the tow option.
  - Decide-by is a paid departure if any, else the promise window opening ("the owner should hear from us before they
    expect the car"), else the window end.
  - A driver who says they are not safe → `safety_escalation`: a TRIAGE card due now, run ESCALATED.
  - "Call notes" for the phone call come from the options agent (`callNotes`).
- [P1b] Driver-unavailable:
  - `answerBy` = decide-by − `answerBufferMinutes` (15). For a slot-start deadline the buffer is at least 120 min.
  - Backups and the afternoon slot (end of `PICKUP_AVAILABILITY` minus the slot length) go through `computeChain`.
  - The cost label says what is at stake ("EUR 368.79 paid travel at risk (refund unknown) + new driver travel
    unknown"), because P1a's cost label only counts quotes.
- [P1b] Demo scripts: `lib/providers/scripts/CD-420322.json` (driver safe at Raststätte Göttingen Ost, A7 northbound,
  photo coming), `CD-420449.json` (driver unsure, prefers an afternoon), `CD-420442.json` (driver silent, dealer: "no
  driver came, car ready, release until 17:00").
- [P1b] Scripts:
  - `pnpm playbook:run` / `pnpm playbook:reset` aliases.
  - `reset.ts` deletes only playbook cards (not `escape-hatch`), reopens the triage cards a decision card folded, and
    deletes the order's monitor signals dated after sim now. That makes S3 repeatable after a clock rollback; it
    removed C2's old CD-420399 S3 proof row, which would have deduped S3's default order.
  - The old reset deleted escape-hatch triage cards too.
- [P1b] Clock and collateral:
  - The re-anchor U2 saw during S5 was my S3 demo. Between 21:50:31 and 22:00:00 UTC real time I set sim 22 Oct
    12:35:30 at speed 10, paused it at sim 14:00:30, then restored the exact old value (sim 21 Oct 09:41:23.641Z,
    paused).
  - The jump fired M2 on CD-420154/449/719/992 too. I cancelled those 4 pickup-unconfirmed runs and deleted them.
  - I also deleted the 21 jump signals (M2, M8, M1). I kept the CD-420442 M2 proof signal
    `fb7a4654-f9c3-4284-8599-a5c2efd09a6e`, which `playbook:reset CD-420442` removes.
  - U2's missed-ferry run on CD-420154 (`1fd1e0f6…`) ran inside that window at sim 22 Oct 12:53; I left it untouched.
- [P1b] Cuts:
  - No cancellation card after a backup accepts. The directed offer stops at NOTIFIED; reassigning and cancelling the
    paid travel stay MANUAL.
  - No photo attachment: the photo stays "promised".
  - No site-hours check for the afternoon slot (the chain warns).
  - No `ASK_PROVIDER` for ferry rebooking in pickup-unconfirmed (missed-ferry covers it).
  - The pickup `ask` block asks the site only when the driver is silent or reports a problem.
  - No "keep waiting" loop back into the wait block; the card's option A covers it.

- [T1] Agent honesty, three layers:
  - Rule 11 in `playbooks/_shared/rules.md`: third person, never claim a check/search/question this step did not make
    as a tool call. missed-ferry's `situation` instruction no longer asks for "what you already did".
  - `lib/playbooks/honesty.ts` (pure, 6 tests): finds sentences whose subject is I / we / the agent (or that open with
    the verb) and claim a lookup (checked, re-checked, searched, looked up, verified, compared…) or a question (asked,
    contacted, called…). Named topics need their own tool (sailings → `search_ferries`/`ask_provider`, hotels →
    `search_hotels`, driver → `ask_driver`…); unnamed lookups need any tool call. Negations, third-person facts and
    "checked in" pass. `blocks/agent.ts` re-asks once with the claims as feedback (first execution only; a gate rerun
    only strips), then strips what is still unbacked; `block_runs.input.honesty` records both passes. Tool calls of
    both attempts count. In the two primes since, no agent tripped it (rule 11 seems enough); it stays as the backstop.
  - The card's "What the agent already did" no longer shows agent prose: `blockSummary` returns null for agent blocks,
    so a step lists only its recorded tool calls (or "No new lookups…"). The order timeline shows the block's
    plain-language description instead. Tool errors read "<tool> failed: a system error (database)", not a stack.
- [T1] Cards and time:
  - `cards.decided_at` is sim time (`ctx.simNow` after the token completes), like the UI's own write.
  - Titles say what is wrong at the source: missed-ferry's `crossingProblem()` ("Ferry sold out, booking attempt timed
    out", "Ferry sold out, no crossing booked", "Driver may miss the booked ferry"…); the human block's
    `specificTitle()` replaces any generic "…needs a decision" title with the summary's first sentence. The UI's
    `decisionTitle` sentence split no longer breaks "EUR 387.00" (test added).
  - Expiry moved to sim time (R1 H1). The waitpoint token always gets a 24 h real timeout (backstop only). The human
    block stores `expiresAtSim` = decide-by + `decisionMarginMinutes` (30) on its block run; the new scheduled task
    `card-expiry` (`trigger/card-expiry.ts` → `lib/playbooks/expiry.ts`, every minute) claims an overdue OPEN card
    (`updateMany` OPEN → EXPIRED) and completes its token with `{ expired: true, reason, simAt }`; the human block treats
    that like a timeout. A paused clock never expires a card; at 120× a card expires 30 sim min after its decide-by.
    Both expiry writes only touch OPEN/EXPIRED cards, so a decision that claimed the card first wins.
  - Wait blocks follow the clock (R1 M3): `waitUntilSim` sleeps ≤ 30 s real at a time and re-reads the clock until
    the sim `until`. Paused = waits; 120× = wakes on time; "jump ahead" wakes it. The inline adapter keeps its single
    capped sleep.
  - G9 note on missed-ferry cards in plain words ("Buying was locked until the ferry company confirmed what the
    timed-out booking attempt did: it made no booking. Lock released (guardrail G9).") and `ask_provider`'s summary
    says "about the earlier booking attempt: it made no booking", without ids.
- [T1] Infra fixes found while priming:
  - **Postgres connection exhaustion.** The first `demo:prime` started 7 playbook runs at once; with each Trigger run,
    agent MCP server and script holding a 10-connection pg pool, local Postgres (100, ~34 used by Supabase) refused
    connections, so 2 agents' tools failed and one run crashed. `lib/prismaClient.ts` now uses `max:
    DATABASE_POOL_MAX ?? 3` and a 5 s idle timeout. The second prime: 7 runs, 0 tool errors.
  - `claudeCli.ts`: no hardcoded path. `CLAUDE_BIN`, else `~/.local/bin/claude` (the native installer), else the first
    `claude` on PATH. Deviation from "PATH second": on this machine the first `claude` on PATH is cmux's wrapper shim,
    which adds its own hooks, so the native binary goes first.
  - `next.config.ts` `devIndicators: false`; AppShell wraps the nav to its own row below `sm` (no overlap at 390 px).
  - `lib/meta/backtest.ts` passes the recorded facts to `toChainOption`, so backup-driver options backtest as
    REPLACE_DRIVER, not NO_CHANGE.
  - `lib/bahn/bahn.integration.test.ts` subtracts simulated rows (`msg-ctl-*`, `msg-sim-*`, `conv-sim-*`) before
    comparing with the manifest; it failed on any DB an agent had touched.
- [T1] Demo scripts (`scripts/demo/*`, package.json `demo:reset`, `demo:reset:prod`, `demo:prime`, `facts:sync:local`):
  - `demo:reset` (~2–5 s): cancels live Trigger runs (except `watchman-tick`), deletes all runs, block runs, cards,
    signals and non-BAHN_RECORD facts, `msg-ctl-*`/`msg-sim-*` messages and `conv-sim-*` conversations, reloads
    `bahn.conversations` from the dataset (the simulator bumps `updated_at`), checks bahn counts against the manifest,
    resets the watchman's Trigger dispatch keys, sets the clock to 21 Oct 09:00Z paused, re-syncs facts (prunes the
    deleted messages' facts). Amendments: keeps the oldest APPROVED missed-ferry one and the newest other (PROPOSED,
    or APPROVED and set back to PROPOSED for the live approve); deletes the rest. The kept amendments' source cards
    stay (their runs go, `runId` → null), so /meta still shows "what the operator corrected". `demo:reset:prod` exists
    (`--yes-prod`, skips Trigger) and was never run.
  - `demo:prime` (~2 min, ~$0.80): (1) `watchmanTick()` in-process: M10 → `missed-ferry` on CD-420154/299/360, M2 →
    `pickup-unconfirmed` on CD-420593, M1/M8 signal only; (2) the three demo targets through `inspect()`: CD-420322's
    warning-light message `msg-xbd0256027a9d35dd` → VEHICLE_WARNING 0.99 → `vehicle-warning`; CD-420449's "still
    unsure" message → DRIVER_CANNOT_MAKE_PICKUP 0.95 → `driver-unavailable` (a direct dispatch is the fallback if Jev
    declines; never needed); (3) the backfill (moved to `lib/watchman/backfill.ts`, also used by `sim:backfill`):
    CD-420399 → `driver-unavailable`, ~11 triage cards, the rest attached to the active runs; (4) waits until every
    active run has an OPEN card with a token or sits in a wait block; prints cards by decide-by with token status.
    Idempotent: started targets (active run, open card or a dispatching signal) are skipped.
  - `scripts/playbooks/reset.ts` (R1 H2/H3): also deletes all the order's signals, `msg-sim-*` messages and
    `conv-sim-*` conversations, cancels the order's live Trigger runs and resets its dispatch keys.
  - The watchman tick fires within a minute of `demo:reset` and starts the four monitor playbooks by itself; that is
    the real pipeline, and `demo:prime` copes with it.
- [T1] Ownership note for X1: I added `lib/watchman/backfill.ts` (`ordersWithOpenIssues`, `backfillMessages`, moved
  out of `scripts/simulate/backfill.ts`) before the ownership split; `scripts/demo/prime.ts` imports it.

- [X1] Run only what was approved (R1 #1, B1/B4/H6):
  - `lib/playbooks/blocks/executePlan.ts` (pure, shared by execute and the card): per step `now | waits | manual |
    done`. A step waits when its description names a condition ("once a new driver has accepted"; "once the bookings
    succeed" does not count, execute books first), or when the option needs a new driver (a MARKET action or a
    `REPLACE_DRIVER` change) and the step is BOOK_TRAVEL, INSTRUCT_CHANGE, DRIVER_MESSAGE or a message "to the new
    driver". Asking, holds and the offer itself never wait. Execute records waiting steps as `WAITING` effects and does
    not run them; the card lists the same plan under each step ("Waits for the new driver to accept…") and the summary
    reads "After yes: 2 steps run now, 3 wait for something else first, 1 for a person in Bahn's system".
    `CardOption.change` now carries the agent's plan change so execute knows about REPLACE_DRIVER.
  - Blocked options cannot be approved: `lib/control-room/decide.ts#decisionRefusal` in `decideCard` (approve of a
    blocked option, unknown option ids, edits that keep a blocked step, a second written change), and again in the
    runtime: `decision.ts#approvalProblem` in the execute block, which then executes nothing and outputs `refused`;
    each playbook routes `execute → not_carried_out` (ESCALATED) on a refusal. `applyDecision` no longer falls back
    to `options[0]`. An edit may approve a blocked option only by dropping every step the rule named (violation
    messages carry the step id); an option blocked as a whole (CHAIN) never.
  - Written change ("What should change") = re-plan, via edges: every playbook's `decide` has a first edge
    `needsReplan → replan` (`lib/playbooks/replan.ts#replanStep`), which re-runs the options agent with the
    operator's words, reason, dropped steps and rewritten messages as feedback, then `check` and a new card. Once per
    run; the re-planned card hides the field and the server refuses a second written change; if one still reaches
    execute it is refused, never ignored. The gate's own re-ask after a re-plan keeps the operator's feedback.
    `prompt.ts` (unowned, one line): the feedback heading is now neutral ("Feedback on your previous answer"); the
    gate's intro moved into `renderViolations`.
  - No plan message after a failed booking: CUSTOMER_MESSAGE, INSTRUCT_CHANGE and DRIVER_MESSAGE are SKIPPED with
    the reason once any booking or simulated order failed (holds and questions still go out).
  - Departed travel: execute fails a booking whose ferry check-in cutoff (else departure; train departure) is at or
    before sim now, without calling the provider; the gate step blocks such a quote (G5) when the card is built.
- [X1] Every failure reaches a person (R1 #2, B2):
  - `cards.ts#handOver` opens one TRIAGE card per run (playbookId = the playbook, `runId` set, `agentActions[0] =
    { actor: 'runtime', kind: 'handover', reason }`), with the reason in words, the decision card's facts plus the
    run's facts, folded watchman triage facts, and the order's next commitment as decide-by. The runtime calls it on
    every ESCALATED end (reject: "Rejected by damir with this note: …"; expiry: T1's `reason` "Nobody decided by …";
    refusal; anything else) and in the catch for FAILED runs ("The agent stopped at “Find sailings”: the agent took
    longer than 12 min…", `plainError`). Cards a playbook already opened (preconditions, vehicle-warning safety) are
    not duplicated. The steps.ts `escalate` blocks were left alone.
  - Card page: `HandOverCardView` ("Handed to you", why, links to the decision cards, the run's steps with their real
    tool calls, what it found). Decision cards show "Not carried out" refusals and links to the re-planned card and
    the hand-over card. EXPIRED is a danger badge. Home: hand-overs first in "Worth a look" with an "Agent handed over"
    badge and the reason as the quote; "Decided recently" uses a red cross for rejected/expired/stopped runs and says
    "Handed to a person" only when a hand-over card exists ("Stopped; no hand-over card yet" otherwise); an edit with
    a written change reads "Sent back to re-plan".
  - Watchman: ESCALATED runs are no longer active (`ACTIVE_RUN_EXCLUDED`), so later messages are not attached to a
    dead run and the playbook is not deduped forever. A Jev failure on a message or record opens (or appends to) a
    "watchman: could not read a … message" card instead of `record`.
- [X1] Watchman dedupe (R1 #3, H2): the Trigger idempotency key is `watchman:<orderId>:<playbookId>:<signalId>` (a
  retry of one inspection reuses its run; a new signal starts a new one). The 30-minute signal dedupe now counts a
  recent dispatch only while its Trigger run has no `playbook_runs` row yet and `runs.retrieve` says it is still live
  (on an API error it dedupes). T1's `resetDispatchKeys` (demo/shared.ts) resets the old key format and is now a
  harmless no-op; nothing in `reset.ts` or `demo:prime` depends on the old semantics.
- [X1] Rules visible, claim honest (R1 #4, H4/H5):
  - The gate step stores `caught` (plain lines from `firstPass` via `describeCatches`/`plainViolation`), and
    `createDecisionCard` copies the newest gate step's catches into `cards.options.caught`. The card shows "Caught
    before you saw it" (older cards rebuild it from their own latest check block). The check step reads "The rules
    caught 2 problems in the agent's first draft…" or "Every option passed the rules on the first draft."
  - `/playbooks#proven` (`components/control/GateReplayPanel.tsx`, `lib/control-room/gateReplay.ts`): loads the 14
    `bahn.agent_proposals` from the DB, projects each order's facts, and runs `fromBahnProposal` + `checkProposal` with
    `now` = the proposal's time on every page load. Live result: corrected 4/4 blocked, approved 0/6 blocked, agreement
    10/10, pending 0/4 blocked; each row says why in plain words.
  - Held-out (`lib/gate/heldOut.ts` + `heldOut.test.ts`): set 1 = 16 rewordings of the 4 corrected proposals (other
    keys, values, phrasing). Before: 4/16 blocked (only the "first available" ones, by the generic no-quote rule).
    Generalised in `lib/gate/forbidden.ts`/`check.ts` (C1's files; no exact-key overfitting): key tokens instead of
    key names for state claims (`confirm_boarding`, `boarding_status: 'CONFIRMED'`), blame/cause keys
    (`cause: 'DRIVER'`, a cause only counts if it names our side), permit+operate keys (`allow_engine_restart`);
    record free text checked for state claims and blame phrases; 5 more operate phrases ("turn the key", "give it
    another go", "see if it starts", "switch it off and on"); a negation now has to govern the phrase (≤ 3 words, no
    comma), so "Don't worry, try restarting" blocks and "We cannot say who caused it" passes. After: 16/16. A blind
    set of 12, written after that and run once: 9/12; the 3 misses were then fixed generically (12/12 now, no longer
    blind). Benign rewordings ("do not restart it", `keep_boarding_unconfirmed`, `delay_cause`): 0/6 blocked. The 14
    recorded proposals still give 4/4 and 0/6. Honest video claim: "blocks the 4 operator-corrected Bahn proposals in replay and
    lets the 6 approved ones through; on 12 rewordings written blind it caught 9 the first time". It matches keys
    and phrases, not meaning.
- [X1] Triage noise (orchestrator follow-up, `lib/watchman/routing.ts`): `needsAttentionThreshold` 0.7 → 0.8 (the
  highest that keeps recall ≥ 80 % in `research/eval/watchman-eval.json`: 0.8 → 85.7 %, 0.85 → 75 %), plus no card
  for a plain acknowledgement (`isAcknowledgement`), a ROUTINE-only item, or a delivered/cancelled order unless the
  message raises damage, money, proof or cancellation. Replayed offline on the 97 eval rows: triage messages 59 → 48,
  triage orders 29 → 25, recall of operator-acted messages (playbook or triage) 96.4 % → 85.7 %; the 4 closed-order
  messages dropped were all label-negative. Precision stays ~41 %: the label is weak (see the eval caveats).
  Acknowledgement and ROUTINE skips change nothing in the eval (Jev already scores them low); they guard live chat.
  Replies to our agent's question while a run is active were already attached to the run.
- [X1] Live proof (25 Oct 01:40–02:00 EEST, local, shared `trigger dev`): `playbook:reset CD-420154` +
  `playbook:run` → card `b9a3a589…` with a live catch ("Option A: the first draft tried to book from a quote 2 h old;
  the rule … sent it back, and the agent fixed it."). Edit in the UI with "Do not position Jonas by train… find
  another driver… keep Jonas assigned until a new driver has accepted" → card EDITED → `replan` (21 s) → new card
  `87f12843…` (A: publish an offer for a new driver, keep Jonas, ask the customer; no bookings) → Approve A in the UI
  → execute: A1 MARKET MANUAL, A2 customer draft sent, 0 bookings, no driver text; run CLOSED. A second run on the
  order (`16dbbe38…`, started by the watchman tick after the reset) → Reject in the UI → run ESCALATED + hand-over
  card `364026e4…` on home. Then `sim:inject` "sailing is full… I am going to miss this ferry" on CD-420154 within 30
  min of the last dispatch → signal `13135911…` → `missed-ferry: triggered` (a new run; before the fix the ESCALATED
  run and the 30-min key would have swallowed it).
- [X1] Side effects to know: `pnpm playbook:reset CD-420154` (T1's new reset) deleted the two /meta amendment source
  cards `2e3b4a24…` (EDITED) and `ce5fc7a8…` (REJECTED); /meta now shows those amendments without "what the operator
  corrected". Also: since that reset deletes the order's signals, the next watchman tick re-fires M10 and starts a
  second missed-ferry run next to `playbook:run` (seen live).

- [T1] Rehearsal round (after X1, 25 Oct 01:58–02:40 EEST):
  - **Amendment sources survive resets.** X1's `playbook:reset CD-420154` had deleted both /meta source cards. Now:
    - `demo:reset` keeps only amendments whose source card still exists: the oldest approved missed-ferry one, plus
      the newest other one, set back to PROPOSED. The two orphans (`e6a8065f`, `38643b30`) were deleted. The S5 state
      was re-created in the rehearsal: `2c1a3c46` APPROVED, `a2596727` PROPOSED.
    - It keeps their source cards, those cards' runs (moved before the snapshot: `simStartedAt` = 06:00Z, `decidedAt`
      = 08:00Z) and the runs' hand-over cards (marked handled), so nothing on screen is dated after sim now.
    - `playbook:reset` keeps amendment source cards and their runs.
  - **No duplicate runs.**
    - `runPlaybook` now refuses a second live run: when another non-terminal run of the same order and playbook is
      older, the newer run deletes its own row and steps aside. This covers tick vs prime, reset vs `playbook:run`,
      and two signals.
    - `playbook:reset` keeps monitor signals up to sim now, so the next tick does not re-fire M10 next to a manual run.
    - R1 M4: `inspect()` dispatches only the best playbook per signal; the runner-up is recorded as
      `not_dispatched: one playbook per signal`.
  - **R1 M1, decide-by reasons:**
    - `computeChain` keeps only future candidates and drops POSITIONING_PURCHASE for REPLACE_DRIVER;
    - missed-ferry's card skips POSITIONING_PURCHASE when the recommended option brings a new driver (a MARKET action
      or REPLACE_DRIVER).
  - **S1 never worked end to end.** It was found in the rehearsal and fixed. With a booked ferry, missed-ferry's
    `gather` saw nothing wrong and closed at once, ignoring the driver's "the sailing is full" message. `gather` now
    reads the signal that started the run: a message or record makes `reported` non-null, and that blocks the
    nothing-to-do edge (renamed "A ferry is booked and nobody reports a problem"). `find-options.md` treats a booked
    but reported-lost sailing as lost. S1 on CD-420075 → card "Driver may miss the booked ferry" in 54 s.
  - **Re-planned cards listed the first attempt's tool calls twice.** `AgentAction.blockRunId` is now recorded, and
    `getCardPage` groups calls by block run (older cards fall back to the block id).
  - **S5 needs a written change.** X1's refusal rejects an Edit that only switches the option and gives a reason. The
    demo's S5 is therefore one Edit with "What should change", which shows re-plan and learning in one go.
  - Expired cards in the rehearsal (S3b clock jump) handed over as designed: "Expired, nobody decided" (demo-19).
  - `demo:prime` now prints the cost of this prime only. Formatting-only prettier fixes in 3 files: `route.ts`,
    `prompt.ts`, `fixture-card.ts`.
  - Rough edges seen, not fixed:
    - Step times on a card are approximate after the clock ran at 120× (`simTimeOf` falls back to run start + real
      elapsed).
    - Wait reasons and some tool summaries still print UTC/ISO times.
    - vehicle-warning call notes still show "(INSTRUCT_HOLD: …)" and an `f_…` id in "Why".
    - Full-page screenshots of a scrolled page show the sticky header mid-page (demo-11 is cropped).

- [P2] Taste polish (25 Oct 02:45–03:10 EEST), render-time only; no runtime, gate, chain or playbook logic touched:
  - One sanitizer, `lib/text/index.ts` (`plainText(text, now?)`, `deskTimes`, `actorWords`, 8 tests). It drops fact
    ids, `agent-x…` ids, rule asides ("(guardrail G9)"), action-class asides ("(INSTRUCT_HOLD: …)") and record ids
    (`asg-x…`, `offer-x…`, `ord-…`). It names people instead of ids: "Agent control-agent" → "The agent",
    "Driver drv-319 (Kasper Kovelund)" → "Driver Kasper Kovelund", "Customer cus-024" → "The customer",
    `ops-support` → "Ops support", "by operator" → "by the dispatcher". It turns codes into words
    (`WAITING_FOR_PICKUP` → "waiting for pickup", `source CUSTOMER` → "set by the customer", `travel.book_ferry` →
    "Ferry booking attempt"). ISO, "07:10 UTC" and "23 Oct 07:00Z" become Helsinki time with the zone; a bare UTC
    time takes the date it follows, else sim now. "Europe/Paris" → "Paris time". A few first-person agent phrases
    ("I did not…") become third person.
  - Applied everywhere agent prose or fact statements show:
    - `toFactView` (chips, the card aside, triage and order fact lists);
    - card titles and summaries (`decisionTitle`), tool-call and block summaries (`blockSummary(block, now)`);
    - options: label, detail, why, notes, will-not, caught, step descriptions, plan reasons, rule messages,
      reversibility;
    - effects, refusals, hand-over lines (also split on a literal `\n`), triage "why", decide-by reasons
      (`splitDecideBy`), wait reasons (`describeCurrentStep`);
    - the order timeline; /meta amendment text, rationale, correction and backtest notes.
    Draft messages to drivers or customers are not touched: the card shows exactly what will be sent. The record view
    (`records.ts`) stays faithful, except whole-value codes ("NO_BOOKING" → "No booking") and tool names.
  - Approvers (`whoMustAgree`): "Needs your yes for the bookings, the new driver plan and the customer message",
    "Needs your yes · the owner must agree to the message", "Needs your yes and the owner’s agreement to pay".
  - The vehicle-warning card is shorter:
    - "What happened" is `MoreLines` (client): at most 3 lines, each clamped to 2, with a quiet "more" that shows
      only when something is cut. Tool-call summaries are clamped the same way.
    - The agent's notes keep at most 3 plain lines visible. "Call notes:" and "Agent's reading:" lines fold behind
      "Show the agent’s other notes (7)"; duplicate notes are dropped.
    - Each option shows 3 evidence chips + "+N more".
  - Times: `components/control/When.tsx` (desk time with the zone, UTC on hover) for step times, decided-at, "since",
    "Started". /meta and /playbooks no longer print wall-clock dates: amendment "proposed …" and "approved …" dates
    are dropped (the source card's sim decision time stays, now with its zone); "approved by the chief dispatcher"
    instead. /playbooks "last run" is mapped to sim time (`simTimeOf`). The `formatWhen` in `components/catalog/Section`
    is removed.
  - Words: "dispatcher" for the person at the desk (decided by, /meta "What the dispatcher corrected", timeline
    speaker). "What this card rests on" instead of "Facts behind this card". "What the records show" instead of
    "Facts gathered", and "N items" instead of "N facts". "On record" on the order page. "the rules" instead of "the
    gate" on `/playbooks#proven` (rule ids stay as labels). Home footer: "flags in the last simulated hour".
    Plural fixes: "1 card was", "1 approved change".
  - `playbooks/_shared/rules.md` rule 12: no ids, codes or ISO/UTC times in prose; cite facts only in `factIds`.
    Every existing card is already clean at render time, so a re-prime is not needed for this. The rule only makes
    future agent text cleaner at the source. The vehicle-warning "(INSTRUCT_HOLD …)" note is written by
    `playbooks/vehicle-warning/steps.ts` (not mine) and is cleaned at render.
  - Screens re-shot (own headless Chrome over CDP, :9335):
    - demo-01 (+ mobile), demo-02, demo-03, demo-05, demo-07, demo-14, demo-16, demo-20.
    - demo-08 now shows CD-420015's triage card ("Status or information request", same layout). S4's CD-420123
      card does not exist in the primed state, and running S4 would spend the live step.
    - demo-13 (S5's proposed missed-ferry rule) is a state that no longer exists; it is unchanged and still shows
      the old wording and the real "proposed" date. demo-20 is the current /meta.

## How to run: demo (T1)

```bash
pnpm demo:reset          # clean state, clock Wed 21 Oct 09:00Z paused (LOCAL; demo:reset:prod needs --yes-prod)
pnpm demo:prime          # watchman tick + demo targets + backfill, waits for the cards (~2 min, ~$0.80)
pnpm facts:sync:local    # project Bahn records into facts (fresh clone; demo:reset does it too)
```

End state left running (25 Oct 02:38 EEST, after the rehearsal, a final `demo:reset` and `demo:prime`, 112 s):
- Clock: Wed 21 Oct 09:00Z (12:00 EEST), **paused**.
- 6 OPEN decision cards with live tokens, by decide-by:
  - CD-420322 vehicle-warning, 12:00 CEST;
  - CD-420449 driver-unavailable, 12:25 CEST;
  - CD-420154 missed-ferry, 23:00 CEST; it already follows the approved rule (A = ask the customer first);
  - CD-420399 driver-unavailable, Thu 11:00 CEST;
  - CD-420299 missed-ferry, Fri 11:00 CEST;
  - CD-420360 missed-ferry, Tue 27 Oct.
- CD-420593 `pickup-unconfirmed` is in its clock-following wait (until 11:00Z sim).
- 9 triage cards.
- `/meta`: 1 APPROVED missed-ferry amendment (`2c1a3c46…`, learned from the CD-420154 edit) and 1 PROPOSED
  driver-unavailable amendment (`a2596727…`, from the CD-420399 reject), both with their source cards. Their two hand-over
  cards were re-created by hand as "handled", after a reset deleted them; `demo:reset` keeps such cards from now on.

README.md (fresh-clone setup) and DEMO.md (video script, live runbook with times, backup plan) are the judge-facing
docs; `public/brand/screens/demo-*.png` (22 files) cover every step.

## How to run: control room (U1)

```bash
pnpm dev:local                      # Next on :3001: / (control room), /cards/<id>, /orders, /orders/<ref>
pnpm exec dotenv -e .env.local -- tsx scripts/playbooks/run.ts --playbook missed-ferry --order CD-420154
#   → a real DECISION card with a waitpoint; approve, edit or reject it in the UI, the run resumes
pnpm exec dotenv -e .env.local -- tsx scripts/dev/fixture-card.ts [--from <cardId>]   # LOCAL: OPEN clone, fake token
pnpm exec dotenv -e .env.local -- tsx scripts/dev/fixture-card.ts --delete
```

Proof (25 Oct 00:37–00:46 EEST, local DB, `trigger dev` worker):
- CD-420154: `run.ts` → Trigger run `run_06gmvm4ugregmdbn7s9v7t5ma2`, card `c637c39a-299c-4068-ad62-a35501df04b3`
  (3 options). "Approve A" clicked in the UI (headless Chrome) → card APPROVED, run resumed: 3 BOOKED facts, a MANUAL
  offer step, the driver message; playbook run `42001562…` CLOSED.
- CD-420360: card `4fb1eee4-c0ba-4a5f-aef8-76f59e84a36a`, Edit in the UI (A, skip step A3, change text + reason) →
  card EDITED with `edits.removeActionIds: ['A3']`, run CLOSED with 2 bookings; `meta-learn` run
  `run_06gmvo2nr7d7kooppps8kdbna2` `{ cardId }` COMPLETED (no amendment proposed).
- Fixture with a fake token: Edit → "Your decision did not reach the agent (Internal Server Error)…", card back to OPEN.
- Screenshots: `public/brand/screens/` (control-room, control-room-mobile, control-room-after, decision-card(-full),
  decision-card-after-approve, decision-card-edited, triage-card, order(-full), orders, sim-clock).

## How to run: meta-system and catalog (U2)

```bash
pnpm dev:local                      # /playbooks (system overview + catalog), /playbooks/<id>[?block=<id>], /meta
pnpm exec dotenv -e .env.local -- tsx scripts/meta/learn.ts <cardId> [--inline] [--force]
#   triggers `meta-learn` { cardId } like the control room does (or runs it in-process), prints the amendments
pnpm exec dotenv -e .env.local -- tsx scripts/meta/amendments.ts [list | approve <id> | reject <id>]
pnpm exec dotenv -e .env.local -- tsx scripts/meta/clean-order.ts CD-420154   # LOCAL: drop learned facts, keep runs/cards
pnpm test lib/meta                  # replay prompt, transcript extraction, whitelist, routing overrides, correction text
```

```ts
import { learnFromCard, parameterWhitelist, listParameterWhitelists, resolveRoutingParams, decideAmendment,
  listAmendmentViews } from '@/lib/meta';
await tasks.trigger('meta-learn', { cardId });   // EDITED or REJECTED decision card → backtested PROPOSED amendments
```

Proof S5 (25 Oct 00:45–00:56 EEST, local DB, shared `trigger dev`):
1. `clean-order.ts CD-420154`, then `run.ts --playbook missed-ferry --order CD-420154` → Trigger
   `run_06gmvo2qdfrro1u0bfe4ma4oa2`, playbook run `d3984cd0-1ad4-4369-8c7b-bcb7332301de`, card
   `2e3b4a24-81e4-4e78-8b5e-90a45a0b0cc5`: recommended **A** "Sun 25 Oct sailing, driver keeps car; hotel at terminal
   and in Lahti", B "… ask customer about earlier delivery instead of Lahti hotel". No amendments in the prompt.
2. Token completed with `{ action: 'edit', optionId: 'B', note: "Don't pay custody nights in Lahti: when the car arrives
   early, always draft the early-delivery question to the customer first, and only book hotels if they decline",
   decidedBy: 'damir' }` → card EDITED, run CLOSED.
3. `meta-learn` via `tasks.trigger` (`run_06gmvp3vo9reqojm4biqiqura2`, $0.45) → amendment
   `e6a8065f-1291-4418-9294-59f08b686abf` (INSTRUCTION on `find_options`, PROPOSED): "When the chosen sailing would put
   the car at the destination more than the early-custody threshold before the delivery window, make the option that
   drafts the early-delivery question to the customer (a draft that promises no date) the recommended option A, and do
   not include destination custody hotel nights in it. Offer destination hotel nights with secured parking only as a
   separate fallback option, to be used if the customer declines." Backtest: "follows correction 0.05 → 0.76; no new
   rule problems; regressions 0/2" (CD-420360 still sensible 0.67, CD-420154 earlier run 0.74).
4. Approved with the "Approve for every future run" button on /meta (headless Chrome) → APPROVED by
   `chief-dispatcher`.
5. `clean-order.ts CD-420154`, `run.ts` again → `run_06gmvpk3d6lfd824eb6tnehga2`, playbook run
   `1fd1e0f6-5efe-4dbf-a4ce-aa3e35d785fa`. Block run `d8e13367-bbd9-41ff-b5a0-fd916a7e68d6` (find_options) input
   prompt contains "## Approved amendments (chief dispatcher) … (amendment e6a8065f-…)"; its output recommends **A**
   "Sat 24 Oct ferry (EUR 387) + ask customer about earlier delivery; no Lahti hotel", with B "Fallback if customer
   declines: … Lahti hotel 25–27 Oct". It passed the gate first time (run 1 needed a re-ask). Approved A unchanged →
   CLOSED.
- Earlier: `learnFromCard` on the REJECTED CD-420154 card `ce5fc7a8-…` ("positioning by train from Bordeaux is not
  realistic; find another driver") → `38643b30-…` PROPOSED, follows 0.03 → 0.93, regressions 0/1, $0.39 (left for the
  chief dispatcher). U1's CD-420360 edit → `generalizes: false`, no amendment, $0.04.
- Screenshots: `public/brand/screens/playbooks.png`, `playbook-missed-ferry.png` (find_options panel open, approved
  change highlighted), `meta.png`, `meta-full.png`.

## How to run: data

```bash
supabase start                      # local DB :55322 (or pnpm dev:stack)
pnpm prisma:generate                # after any schema change
pnpm prisma:migrate:create <name>   # new migration against local, review SQL
pnpm prisma:migrate:deploy:local && pnpm prisma:migrate:deploy:prod
pnpm seed:bahn:local                # TRUNCATE + reload bahn.* from data/bahn/dataset, verify vs manifest, ensure sim_clock
pnpm seed:bahn:prod                 # same on prod (~10 s)
pnpm seed:generate                  # dump prod schema+data → supabase/migrations + supabase/seed.sql
pnpm full-local-reset               # rebuild local DB from that dump (bahn + control + _prisma_migrations)
pnpm prisma:migrate:status:local    # "Database schema is up to date!"
pnpm test                           # unit tests (DB tests skip without DATABASE_URL)
pnpm test:local                     # + integration: bahn counts == manifest, bundle, duties
pnpm clock:local                    # print sim now; --reset (anchor at snapshot 2026-10-21T09:00Z), --at <ISO>, --speed <n>
pnpm clock:prod --reset --speed 1   # do this before a demo: the clock was anchored at seed time and keeps running
```

Reading Bahn data (server only): `import { getOrderBundle, listOrders, getDriverDuties, getMessage,
getSupportInboxMessage, findOrder, insertBahnRecords, countBahnTables, BAHN_COLLECTIONS, BAHN_SNAPSHOT_AT }
from '@/lib/bahn'`. Types: `OrderBundle`, `OrderListItem`, `DriverDuties`, `DriverDuty`, `MessageWithContext`.
Prisma accessors: `prisma.bahnOrder`, `prisma.bahnMessage`, … (model `Bahn<SingularPascal>`, table
`bahn.<collection>`); control: `prisma.fact`, `.signal`, `.playbookRun`, `.blockRun`, `.card`, `.amendment`,
`.simClock`. Clock: `import { simNow, getSimClock, setSimClock, ensureSimClock } from '@/lib/clock'`; pure
`computeSimNow`, `simMsToRealMs`, `realMsToSimMs`, `simToRealDate`, `realMsUntilSim`, `reanchor`,
`MINUTE_MS`, `HOUR_MS` from `@/lib/clock/math`.

## How to run: runtime

```bash
pnpm trigger:dev                       # Trigger.dev dev worker (.env.local via dotenv); pnpm dev:stack also starts it
pnpm spike:trigger                     # trigger spike-roundtrip, follow it, print its waitpoint token
pnpm spike:complete <tokenId> '{"decision":"approve"}'   # complete the token -> the run resumes and finishes
pnpm spike:trigger <taskId> '<json>' [--no-wait]         # trigger any task, e.g. spike-probe
pnpm mcp:smoke [tool] ['<argsJson>']   # spawn the control MCP server like the CLI does, list tools, call one
pnpm agent:smoke [model]               # one isolated Claude CLI agent against the control MCP server
pnpm test:local lib/decisions          # live Jev test (skipped without OPENROUTER_API_KEY)
```

"Project not found" from `trigger dev` means `TRIGGER_ACCESS_TOKEN` is missing from the process env (use the
pnpm script). Runs: https://cloud.trigger.dev/projects/v3/proj_huebjwukwrrablzkilur/runs?envSlug=dev

```ts
import { decide, defineQuestions } from '@/lib/decisions';
const { answers, costUsd, model, raw } = await decide({
  state: { order, latestMessage },
  questions: {
    stale: { type: 'noul', instructions: '…', criteria: { true: '…', false: '…' } },
    trigger: { type: 'choice', instructions: '…', criteria: { FERRY_DISRUPTION: '…', NONE: '…' } },
    severity: { type: 'score', instructions: '…', criteria: ['low', 'medium', 'high'] },
  },
});
answers.stale.noul;                    // P(yes)
answers.trigger.choice;                // 'FERRY_DISRUPTION' | 'NONE', plus .probabilities and .confidence
answers.severity.score;                // 0..n-1, plus .probabilities, .legend and .confidence

import { AgentRunError, runAgent } from '@/lib/agents';
import { controlMcpServer, controlToolNames } from '@/lib/agents/controlMcp';
const tools = ['get_time', 'record_note'];
const res = await runAgent({
  systemPrompt, prompt,
  outputSchema: z.object({ … }),       // zod (output is parsed with it) or a plain JSON schema object
  mcpServers: { control: controlMcpServer({ runId, orderId, blockId, tools }) },
  allowedTools: controlToolNames(tools), // default: all tools of the given servers
  model: 'haiku',                      // default 'sonnet'
  timeoutMs: 5 * 60_000,               // default 10 min; optional maxBudgetUsd, cwd, env
});
res.output; res.costUsd; res.durationMs; res.numTurns; res.sessionId; res.model; res.toolCalls; res.transcript;
```

New MCP tool: add `mcp/tools/<name>.ts` exporting `defineTool({ name, description, inputSchema: { /* zod
raw shape */ }, handler: async (input, ctx) => result })`, then list it in `controlTools` (`mcp/tools/index.ts`).
The handler's return value is sent as JSON text; a throw becomes an `isError` result. `ctx` = `{ runId, orderId,
blockId }`. Adapters: `DECISION_MODEL` (default `jev`) and `AGENT_RUNNER` (default `claude-cli`) choose the
registry entry.

Proof (24 Oct, 23:39–23:43): `run_06gmv8ujvhobtmb964729mk3a2` (sonnet): Jev → FERRY_DISRUPTION (p = 1),
missedFerry 0.92. Agent called `get_time` and `record_note` and returned `{ summary, usedTool: true }` for
$0.0105. Token `waitpoint_06gmv8vak5bb9f4jvbhfs4cfa2` was completed by `pnpm spike:complete`, and the run
COMPLETED with the payload. Repeat run `run_06gmv9jfvg72ilo7q3vpsnuja2` (haiku): agent cost $0.00066, token
completed with `reject`.

## How to run: watchman and simulator

```bash
pnpm trigger:dev        # registers watchman-inspect + watchman-tick (every minute: monitors at sim now, each hit once)
pnpm dev:local          # Next on :3001 serves POST /api/webhooks/bahn (header x-bahn-webhook-secret)
pnpm sim:inject --order CD-420299 --from driver|site|customer --text '…' [--lang de] [--direct] [--no-wait]
pnpm sim:scenario S1|S2|S3|S4 [--order CD-…] [--direct] [--phase ended|started] [--local-tick]
pnpm sim:backfill [--force] [--tick] [--dry]   # inspect the latest inbound message of each order with an open issue
pnpm eval:watchman [--limit n]                  # → research/eval/watchman-eval.{md,json}; ~5 s, ~$0.03
pnpm test lib/watchman                          # monitors vs backtest hits (jsonl, no DB) + routing table
pnpm test:local lib/watchman                    # + state builder on the DB + one live Jev call
curl -X POST localhost:3001/api/webhooks/bahn -H 'content-type: application/json' \
  -H 'x-bahn-webhook-secret: local-bahn-webhook-secret' -d '{"collection":"messages","id":"msg-…"}'
```

- `inject` acts as Bahn: it inserts a `bahn.messages` row authored at sim now (and a `conversations` row if no open
  one fits) through `insertBahnRecords`, then POSTs the webhook, or with `--direct` triggers `watchman-inspect`
  itself. Then it follows the run and prints the signal, labels, routing and card.
- Scenarios (default orders; `--order` overrides):
  - S1: driver at the terminal, "sailing is full… I'm going to miss this ferry", on CD-420075 (VW ID.4, booked
    ferry) → `missed-ferry`.
  - S2: red warning light on CD-420145 (Porsche 911, moving) → `vehicle-warning`.
  - S3: moves the sim clock 2 min past the end of the earliest upcoming selected pickup slot of an ASSIGNED,
    not-picked-up order (CD-420399 from the snapshot), then waits for the scheduled tick → M2
    `PICKUP_NOT_CONFIRMED` → `pickup-unconfirmed`. It prints the command to undo the clock jump.
  - S4: customer asks to also deliver winter tyres stored at the dealer, on CD-420123 → TRIAGE card.
- Webhook body `{ collection, id, orderId? }`: `messages` → `{ kind: 'message', ref: id }`; any other bahn collection
  → `{ kind: 'record', ref: '<collection>:<id>' }`. It returns 202 `{ runId }`, 401 on a bad secret, and 400 on an
  unknown collection. `BAHN_WEBHOOK_SECRET` is in `.env.local` (`local-bahn-webhook-secret`); not set on prod.

```ts
import { inspect, watchmanTick, decideRoute, ROUTING_PARAMS, PLAYBOOK_IDS, TRIGGER_TYPES, TRIGGERS,
  runMonitors, MONITOR_PARAMS, buildOrderState, clipBundle, classify, upcomingCommitments } from '@/lib/watchman';
await inspect({ kind: 'message', ref: 'msg-…' });             // or 'record' 'travel_options:travel-…' | 'monitor' 'M2:ord-00593:win-…'
// → { signalId, orderId, triggerType, skipped?, routing: { action: 'playbook' | 'triage' | 'record', playbooks, labels,
//      needsAttention, reason, dispatches: [{ playbookId, status: 'triggered' | 'deduped' | 'not_dispatched', triggerRunId? }],
//      card?: { cardId, status: 'created' | 'appended' }, attachedRunId? } }
```

Proof (25 Oct 00:03–00:12 EEST; local Supabase, `trigger dev`, Next on :3001):
- First scheduled tick `run_06gmvec5bdbvq9u8q94cmqhea2` (sim 09:22) wrote 11 monitor signals, exactly the backtest
  hits: M1 075/324/439/603, M2 593, M8 322/806/1013, M10 154/299/360. Later ticks wrote nothing new until M1 fired
  for CD-420584 at sim 09:30 (`run_06gmvg6ofqb0d5vfn09qv5hka2`, its cutoff entering the 6 h window).
- S4 via webhook: run `run_06gmvegm1b9bi9j0pvk8rerma2`, signal `333fd4f8-56db-4d3d-a7e5-47c08af78d38`
  (INFO_REQUEST, needs_attention 0.96) → TRIAGE card `18b18290-f13f-4aa9-aa4f-2f4603fdbedb` (CD-420123, decide-by
  22 Oct 07:10Z = departure of the paid positioning train). Repeat on CD-420413: card
  `0f0e2b21-98b2-4ecc-89e5-c961b56fb68b` with 23 fact ids, the triggering customer statement first.
- S1 via webhook: run `run_06gmvehkakomr862b216srega2`, signal `0163d971-811f-44b3-aef1-5693cca5cefb` (CD-420075,
  CROSSING_CAPACITY 0.95 → `missed-ferry`, recorded `not_dispatched` because the task was not registered then).
- S2 via webhook: run `run_06gmvehvor3irc1fans2u09na2`, signal `0cfc7af8-86c8-4b89-ac49-762ae23e73d6` (CD-420145,
  VEHICLE_WARNING 0.99 → `vehicle-warning`, `not_dispatched`).
- S3: tick `run_06gmvf9eocqnq8m8p3jhsjona2` at sim 22 Oct 10:02 → signal `e997a542-c0d0-493c-a3c0-24203c24f299`
  (M2 CD-420399 → `pickup-unconfirmed`, `not_dispatched`).
- Record via webhook (`travel_options:travel-xc1d8163d5443a606`): run `run_06gmvfgv61r87ln6v9ur7fmua2` → signal
  `d1939388-680d-4825-a36b-c052734f3dab` (CD-420299, CROSSING_CAPACITY 0.97).
- Trigger path: `dispatchPlaybook` → `spike-probe` run `run_06gmvg9242kgs1lt5hs3gftsa2`; a second dispatch for the
  same (order, playbook) returned the same run (idempotency key).
- Backfill (`pnpm sim:backfill`): 23 orders with an open issue and an inbound message → 23 signals, 17 TRIAGE cards,
  6 record-only.

## Using facts, chain, gate (C1)

Pure modules (no DB, safe anywhere): `@/lib/evidence` (ladder, renderers, time helpers), `@/lib/facts/projection`,
`@/lib/facts/ids`, `@/lib/facts/types`, `@/lib/chain/compute`, `@/lib/gate` (all of it). Server only:
`@/lib/facts` (index includes `store.ts`) and `@/lib/chain` (index includes `load.ts`).

```ts
// evidence
EVIDENCE_LEVELS, LEVEL_MEANING, levelRank(level), atLeast({ level, min }),
FACT_KINDS, FactKind, CLAIM_KINDS, ClaimKind, LADDER_CHAINS, DOMAINS
renderLadderForAgents(): string                         // markdown for agent prompts
renderLadderForDecisions({ domains? }): string          // short criteria for Jev questions
ladderRows(): LadderRow[]; claimRows(): ClaimRow[]      // UI
formatLocal({ at, timeZone }), formatWindow({ startAt, endAt, timeZone }), formatMoney({ cents, currency }), cityTimezone(city)

// facts (pure)
projectOrderFacts({ bundle }): ProjectedFact[]          // deterministic ids/keys; sourceType BAHN_RECORD
factIdFor(dedupeKey), bahnDedupeKey({ collection, recordId, kind, suffix?, scopeOrderId? })
factValue(fact, key), bahnRecordId(fact); types FactLike, ProjectedFact
// facts (DB)
syncOrderFacts({ orderId }) → { orderId, total, created, updated, unchanged, pruned }
syncAllOrderFacts({ orderIds? })
writeFact({ orderId?, runId?, kind, subject, statement, value?, level, sourceType: 'TOOL'|'OPERATOR'|'AGENT_INTERPRETATION',
            sourceRef, observedAt, dedupeKey? }): Promise<Fact>
listOrderFacts({ orderId, kinds?, minLevel?, observedBefore?, runId? }): Promise<Fact[]>
getFacts({ ids }): Promise<Fact[]>                       // in the order asked
resolveOrderId({ ref })                                  // 'CD-420299' | 'ord-00299' → 'ord-00299'

// chain (pure)
computeChain({ bundle, facts?, option, now, duties?, parameters? }): ChainResult
  option: { type: 'NO_CHANGE' } | { type: 'NEW_SAILING' | 'NEW_TRAIN', travelOptionId? | factId? | quote? }
        | { type: 'HOTEL_NIGHTS', nights, city?, costCents? } | { type: 'MOVE_PICKUP_SLOT', startAt, endAt }
        | { type: 'REPLACE_DRIVER', driverId } | { type: 'EARLY_DELIVERY', startAt, endAt }   (+ assignmentId?)
  ChainResult: { label, feasible, promise: { local, source, customerAgreed, etaAt, etaBasis, slackHours, earlyHours,
    verdict: 'holds'|'early'|'breaks'|'unknown', keepsPromise, custodyNights, factId }, decideBy: { at, local, kind,
    reason, label, factId } | null, decideByCandidates, driverChain: { previous, current, next, gapBeforeHours,
    gapAfterHours, flags: { positioning_record_mismatch, next_duty_at_risk }, notes } | null,
    bookings: { create, cancel, keep }, cost: { eurCents, lines, unknown, nonEur }, approvals: ActionClass[],
    notify, locks, warnings }
deriveDecideBy({ bundle, facts?, now }): { decideBy, candidates }
DEFAULT_CHAIN_PARAMETERS                                 // tunable
// chain (DB)
computeChainForOrder({ ref, option, now, parameters? }); deriveDecideByForOrder({ ref, now })

// gate (pure)
checkProposal({ proposal, facts, now, parameters? }): { ok, violations: [{ ruleId, message, actionIndex }],
  warnings, approvalsRequired: [{ actionIndex, actionClass, authority, reason }], autoAllowed: [{ actionIndex,
  actionClass, notify }], claims }
  proposal: { id?, orderId?, orderRef?, summary?, context?: { vehicleWarning? }, actions: [{ class: ActionClass,
    summary?, payload?, claims?: [{ kind: ClaimKind, factIds }], evidenceFactIds?, text?, mode?: 'draft'|'execute' }] }
ACTION_CLASSES (authority table), GUARDRAILS (G1–G11 text), renderGuardrailsForAgents(),
DEFAULT_GATE_PARAMETERS { quoteBlockMinutes: 90, quoteWarnMinutes: 60 }, fromBahnProposal({ proposal, facts, now?, payload?, orderRef? })
// test-only loader (no DB)
import { loadBahnDataset, buildOrderBundle, buildDriverDuties, buildOrderDriverDuties } from '@/lib/bahn/testing'
```

Sync the projection into a DB (local was done: 100 orders, 2187 facts; prod not yet):
`npx dotenv -e .env.local -- npx tsx --tsconfig tsconfig.json <script calling syncAllOrderFacts()>`; the script needs
an `async function main()` (CJS, no top-level await). Pass the agent ladder via `renderLadderForAgents()` and the
guardrails via `renderGuardrailsForAgents()`. To let an agent's quote drive the chain, write it as a TOOL
`FERRY_QUOTE`/`TRAVEL_QUOTE` fact with top-level `departureAt`, `arrivalAt`, `checkInCutoffAt`, `checkedAt`,
`quoteCents`, `currency` (P1's tool facts already have this shape) and call `computeChain({ option: { type:
'NEW_SAILING', factId } })`. A provider reconciliation is a TOOL `BOOKING_RECONCILED` fact with `value.proposalId`
(or `value.attemptFactId`); it lifts the G9 lock in both chain and gate.

## How to write a playbook (P1a)

A playbook is data: a graph of blocks interpreted by one runtime. The same definition drives the Trigger task, the
router and the catalog diagram. Reference implementation: `playbooks/missed-ferry/`.

### Folder layout

```
playbooks/_shared/rules.md          global agent rules (every agent block gets them)
playbooks/<id>/playbook.ts          the definition: export const <name>Definition = definePlaybook({...})
playbooks/<id>/steps.ts             deterministic functions (gather, card builder, close…), optional
playbooks/<id>/rules.md             playbook rules (system prompt of every agent block of this playbook)
playbooks/<id>/instructions/*.md    one per agent block (the task text)
playbooks/<id>/index.ts             export const <name> = definePlaybookTask(<name>Definition)   ← the Trigger task
lib/playbooks/registry.ts           add the definition to PLAYBOOKS (catalog, scripts, router helpers)
```

`trigger.config.ts` scans `./playbooks`, so `index.ts` registers the task (id = playbook id). C2's watchman
dispatches only when `playbooks/<id>/index.ts` exists and `ROUTING_PARAMS` (`lib/watchman/routing.ts`) maps a
trigger type to that id. Every file in `./playbooks` is bundled by `trigger dev`: an import that does not resolve
breaks the whole dev worker. `playbook.ts` must not import `@trigger.dev/sdk` (the registry is imported by Next).

### Definition API (`lib/playbooks/types.ts`)

```ts
definePlaybook({
  id: 'pickup-unconfirmed', title: 'Pickup not confirmed', summary: '…plain language for the chief dispatcher…',
  triggers: ['PICKUP_NOT_CONFIRMED'], folder: 'playbooks/pickup-unconfirmed',
  params: { 'recheck.defaultMinutes': { default: 120, description: '…' } },   // PARAMETER amendments override
  preconditions: [{ id, description, check: async (ctx) => boolean }],      // any false → ESCALATED + TRIAGE card
  start: 'gather',
  blocks: [ /* BlockDefinition[] */ ],
});
```

`BlockDefinition` common fields: `id`, `kind`, `title`, `description` (both plain language, shown in the catalog),
`status?` (run status on entry; on a terminal block CLOSED or ESCALATED), `next: Edge[]`.
`Edge = { to, label, when?: (ctx) => boolean }`: the first edge whose `when` holds (or has none) wins; `label` is
what the diagram shows. A block with `next: []` ends the run. `definePlaybook` validates the graph at import.

Block kinds:
- `deterministic`: `run: async (ctx) => output` (optional `outputSchema` zod parse). Read `ctx.order` (OrderBundle),
  `ctx.facts`, `ctx.outputs[<blockId>]`, `ctx.params`, `ctx.simNow`.
- `agent`: `instructions: 'instructions/<file>.md'`, `tools: [...]` (control MCP names), `outputSchema` (zod; sent as
  `--json-schema`, use `.nullable()` rather than optional fields), `model: 'sonnet' | 'haiku'` (default sonnet),
  `timeoutMs?`, `maxBudgetUsd?`, `context?: (ctx) => extra JSON`. Prompt = system: role line + `_shared/rules.md` +
  `renderLadderForAgents()` + `renderGuardrailsForAgents()` + playbook `rules.md`; user: `# Task: <title>` +
  instructions + approved INSTRUCTION amendments + gate feedback (reruns) + JSON context `{ simNow, playbook, block,
  trigger, params, order: summarizeOrder(bundle), facts: [{ id, kind, level, statement, observedAt, source }],
  earlierBlocks: ctx.outputs, extra }`. Runs as `agent-block` (queue limit 2); tool calls become `ctx.agentActions`.
- `wait`: `wait: { defaultMinutes, bufferMinutes }`, optional `nextCommitment: async (ctx) => ({ at, reason }) | null`
  (default: the order's next booked departure/cutoff or selected window edge). Sleeps
  min(default, commitment − buffer) sim minutes, converted with the clock speed (`computeWaitDuration`), and records
  the reason on `block_runs.input`, e.g. "waiting 45 min (sim) instead of 120: driver's train departs at 22 Oct,
  10:05 UTC, 20 min buffer". Params `<blockId>.defaultMinutes` / `<blockId>.bufferMinutes` override.
- `human`: `card: async (ctx) => CardDraft` (`{ title, summary ≤3 lines, factIds, options: CardOptionsPayload,
  decideBy?, decideByReason? }`). Creates the DECISION card, a waitpoint token (saved as `cards.waitpointTokenId`),
  waits, then writes the decision. Output `HumanBlockOutput { cardId, tokenId, expired, decision, option }`; route on
  it, e.g. `when: (ctx) => Boolean((ctx.outputs.decide as HumanBlockOutput).option)` → execute, else escalate.
- `execute`: default runs the latest decision's option actions (see Execute in Decisions log); or give `run`.
- Gate step: `gateStep({ id, title, description, optionsFrom: '<agent block id>', next })` returns a deterministic
  block (status OPTIONS_READY) for an agent block whose `outputSchema` is `optionsAnswerSchema`
  (`lib/playbooks/options.ts`: `{ situation, options: [{ id A|B|C, label, detail, change, actions, factIds,
  costCents, reversibility }], recommendation, agentWillNot }`). Output `GateStepOutput { options: CardOption[],
  answer, retried, firstPass }`; build the card from it (see `playbooks/missed-ferry/steps.ts#buildCard`).

### Card JSON (what U1 renders)

`cards.options` = `CardOptionsPayload { items: CardOption[], recommendation: { optionId, why } | null,
agentWillNot: string[], notes?: string[] }`. `CardOption = { id, label, detail, actions: CardAction[], factIds,
chain (C1 ChainResult: promise.slackHours/verdict, decideBy, bookings, cost, driverChain, warnings), slackMinutes,
costLabel, costCents, approvers, gate: { ok, violations, warnings }, blocked: { ruleId, message } | null,
reversibility, recommended }`. `CardAction = { id, actionClass, description, quoteFactId?, message? }`.
`cards.agentActions` = `AgentAction[] { blockId, tool, summary, input, factIds, isError }`.

### Decision payload contract (complete the card's token with exactly this)

```ts
type DecisionPayload = {
  action: 'approve' | 'edit' | 'reject';
  optionId?: string;                       // default: the recommended option
  edits?: { messages?: Record<actionId, string>; removeActionIds?: string[]; note?: string };
  note?: string;
  decidedBy: string;                       // operator name
};
// server: await wait.completeToken(card.waitpointTokenId, payload)   (zod: decisionPayloadSchema in lib/playbooks/decision.ts)
```

approve → card APPROVED, edit → EDITED (edits applied to the option), reject → REJECTED (run ESCALATED in
missed-ferry). The run writes `cards.status`, `decision` (payload + `appliedOption`), `decidedBy`, `decidedAt` and an
OPERATOR_DECISION fact; the UI only completes the token. `{ decision: 'approve' }` (spike shape) is also accepted.

### Amendments

Approved `control.amendments` for the playbook are loaded at run start (`lib/playbooks/amendments.ts`):
INSTRUCTION amendments (blockId null = every agent block, else that block) are appended to the user prompt under
"Approved amendments (chief dispatcher)", which win over the instructions; PARAMETER amendments' `parameters` JSON is
merged over `definition.params` into `ctx.params` (later approvals win). The catalog helper
`getPlaybookCatalog(id)` / `listPlaybookCatalog()` (`lib/playbooks/catalog.ts`, server only) returns the graph,
texts, rules, instructions and approved amendments per block.

### Tools (control MCP, `mcp/tools/`)

`get_order_context`, `list_facts {kinds?, subjectContains?}`, `search_ferries {fromPort, toPort, earliest?, days?}`,
`search_trains {from, to, earliest?}`, `search_hotels {near, checkIn, nights}`, `find_roadside {location}`, `find_backup_drivers {limit?}` (P1b),
`ask_driver {question}`, `ask_site {question}`, `ask_provider {question, reference?}`,
`record_interpretation {statement, basedOnFactIds}`, plus F2's `get_time`, `record_note`. Every tool that learns
something returns `{ summary, factIds, … }`. Context comes from `CONTROL_RUN_ID` (= `playbook_runs.id`) and
`CONTROL_ORDER_ID` (bahn id). Scripted demo replies: `lib/providers/scripts/<orderRef>.json`.

### Run and test

```bash
pnpm trigger:dev                                                    # dev worker (only one at a time)
pnpm exec dotenv -e .env.local -- tsx scripts/playbooks/run.ts --playbook missed-ferry --order CD-420299
#   follows the run, prints the card, its token and the approve command; add --inline to run without a worker
pnpm spike:complete <tokenId> '{"action":"approve","optionId":"A","decidedBy":"damir"}'
pnpm exec dotenv -e .env.local -- tsx scripts/playbooks/reset.ts CD-420299   # LOCAL only: drop runs, playbook cards, tool facts, agent messages
pnpm exec dotenv -e .env.local -- tsx scripts/playbooks/converse.ts CD-420322 driver "Are you safe?"   # simulator probe
pnpm mcp:smoke search_ferries '{"fromPort":"West Baltic terminal","toPort":"South Finland terminal"}'
pnpm test lib/playbooks                                             # interpreter, wait duration, decision payload
pnpm test:local lib/playbooks                                       # + gate step on CD-420299 (reads DB, writes nothing)
```

Proof (25 Oct, 00:15–00:21 EET, local DB, sim 21 Oct ~09:35Z, final code): `missed-ferry` on CD-420299, Trigger
run `run_06gmvi18vd2rlncrp9ga5nm8a2` (playbook run `06b7fffc-21e1-4162-9509-3e733cd00949`), child `agent-block`
runs `run_06gmvi1g9cco1s7o7t8odtuca2` (reconcile, haiku, $0.0045, 8.2 s) and `run_06gmvi2fvjsqlu64u7gcc9g8a2`
(find_options, sonnet, $0.1793, 40 s). Card `a4657683-3f74-432e-8818-454c92b4c937`: decide by 23 Oct 09:00Z
("until Fri 23 Oct 11:00 CEST — pickup slot starts in Leipzig"), note "G9: purchases were locked by the failed
attempt agent-x4ac988b20000595f until the provider answered: no booking. Lock released."; A (recommended) 24 Oct
sailing + Hamburg hotel + 2 Helsinki nights with the car + train home to Pori, slack 42 h, EUR 722.68; B same
sailing + customer early-delivery draft instead of the Helsinki nights, slack 42 h, EUR 487.95; C 25 Oct sailing,
slack 19 h, EUR 936.20. Approved A with `pnpm spike:complete` → 4 BOOKED facts (ferry `VCL-E0B3AF47`, 2 hotels,
train), an OPERATOR_DECISION fact and a driver message with the references; run CLOSED, 78 s wall time, $0.18.
Earlier identical run `run_06gmvh5sfp7aaf9mj1t256laa2`: 52 s, $0.12. CD-420154 (`run_06gmvhfq03q8itbkprcu9b2la2`):
3 options incl. a positioning train, one live gate re-ask (G11, fixed since), rejected → ESCALATED.

## How to run: vehicle-warning, pickup-unconfirmed, driver-unavailable (P1b)

```bash
pnpm playbook:run --playbook vehicle-warning --order CD-420322       # follows the run, prints the card + token
pnpm playbook:run --playbook driver-unavailable --order CD-420449    # decide-by 12:25 CEST (paid train)
pnpm spike:complete <token> '{"action":"approve","optionId":"B","decidedBy":"damir"}'   # or edit / reject (+ note)
pnpm playbook:reset CD-420442                                       # LOCAL: runs, cards, tool facts, agent msgs, future signals
pnpm sim:scenario S2 --direct                                       # watchman → VEHICLE_WARNING → vehicle-warning (CD-420145)
pnpm sim:inject --order CD-420399 --from driver --text '…cannot make the pickup…' --direct   # → driver-unavailable
pnpm test playbooks                                                 # deadline-aware wait on CD-420442, G4 in vehicle-warning
```

S3 with the deadline-aware wait (the demo used CD-420442). Run it last; it moves the shared clock:
1. `pnpm playbook:reset CD-420442`.
2. Just after a `watchman-tick` (ticks land around :28 s of each minute), run
   `pnpm clock:local --at 2026-10-22T12:35:30Z --speed 10`.
3. The next tick (sim ≈ 12:45) fires M2 and dispatches `pickup-unconfirmed`. The wait is 75 sim min instead of 120:
   the driver must leave Stockholm by 16:30 CEST for the ferry check-in, minus a 30 min buffer. At speed 10 that is
   7.5 real minutes.
4. Cancel the other M2 dispatches the jump causes (CD-420154/449/719/992).
5. Once the run reaches `ask`, pause (`pnpm clock:local --speed 0`). The card's decide-by is then still ahead.
6. Afterwards, `pnpm clock:local --at 2026-10-21T09:41:23.641Z --speed 0` and delete
   `control.signals where sim_at > <that time>`.

Proof (25 Oct, 00:46–01:01 EEST, local DB, shared `trigger dev`):

| Playbook / order | Trigger run · playbook run | Card | Decide-by (reason) | Decision | Agent cost (per block) | Wall |
|---|---|---|---|---|---|---|
| vehicle-warning, CD-420322 | `run_06gmvo9m70ep2lo3l8ikknvua2` · `9586e65b-e997-48ec-895d-c6253368d309` | `9b8789a1-3c36-47e7-bfd8-dff613758375` "Bentley Continental GT stopped with a warning. Call the owner: roadside or tow" | 21 Oct 10:00Z ("until Wed 21 Oct 12:00 CEST — the delivery window opens; the owner should hear from us before they expect the car") | EDITED A: owner text rewritten + note → driver hold message and the edited owner message sent | safety haiku $0.0056 (11 s); options sonnet $0.1749 (32 s) + one gate re-ask $0.1133 (18 s, false G11, fixed since); total $0.29 | 94 s |
| driver-unavailable, CD-420449 | `run_06gmvoo1uu0f3778oq43g762a2` · `ca5ea39c-dfd7-4548-8f62-aba25ee4daf3` | `c641c278-fe0f-4bfb-8bcc-368e0b88d0c9`: A keep / **B directed offer to Liam Norvalen (Hamburg)** / C afternoon 14:00–17:00 CEST (slack 18.8 h) | 21 Oct 10:25Z ("until Wed 21 Oct 12:25 CEST — departure of the paid train Aalborg → Copenhagen (EUR 76.06, ref TR8B1BF640)") | APPROVED B → OFFER_EXPOSURE `f_0eab9f4887104c` (NOTIFIED) + "hold off on the 12:25 train, assignment stays" to Carl; nothing cancelled | ask_driver haiku $0.0053 (9 s); options sonnet $0.1317 (20 s); total $0.137 | 43 s |
| pickup-unconfirmed, CD-420442 (S3 via `watchman-tick`, M2 signal `fb7a4654-f9c3-4284-8599-a5c2efd09a6e`) | `run_06gmvpe0eag6elgu8bqclvv8a2` · `cf2259e8-677a-4ce8-99bf-e4a82345d2c6` | `e49f13a1-b961-4b0c-a188-c4cd0f42742a`: "pickup not confirmed after the slot ended": A wait until 16:20 / **B site holds the car** / C backup (cannot arrive in time) | 22 Oct 14:30Z ("until Thu 22 Oct 16:30 CEST — the driver must leave Stockholm to reach the check-in of the booked ferry WBV-FERRY-00442 (cutoff 17:30 CEST, about 1 h drive)") | REJECTED with a note ("reached Kasper by phone…") → ESCALATED | ask haiku $0.0055 (10 s); options sonnet $0.1201 (21 s); total $0.126 | 8 min 9 s (7.5 min of it the sim wait) |

The wait block's persisted reason: "waiting 75 min (sim) instead of 120: the driver must leave Stockholm to reach the
check-in of the booked ferry WBV-FERRY-00442 (cutoff Thu 22 Oct 17:30 CEST, about 1 h drive) at 22 Oct, 14:30 UTC,
30 min buffer". It woke at sim 14:00:30. Two extra runs through the watchman:
- S2 on CD-420145: signal `83a7b1b3-b502-4e90-a4ec-bbaa8b967202` (VEHICLE_WARNING 0.99) → `run_06gmvrg00r4loddrb62tinu2a2`.
  Card `a5d9993d-945c-459b-8b44-572462e2528b` was EDITED to option B (tow) → TOOL_RESULT BOOKED `f_0d29e57ce7dfc7`
  (`tool:book_roadside:TOW-35A1AC`), with the reference appended to the driver message; $0.112.
- CD-420399: signal `9dcf4184-a5e0-4371-b9ae-2a26cf8edfc2` (DRIVER_CANNOT_MAKE_PICKUP 0.99) → `driver-unavailable`
  `run_06gmvrpltha12nrc1h62v90aa2`. The card had backups in Leipzig and decide-by = slot start. It was rejected, then
  reset with `pnpm playbook:reset CD-420399` (1 run, 1 card, 4 tool facts, 1 triage card reopened).

## Design rules (D1, for every UI agent)

Open `/design` first; it shows every rule below. Build from `@/components/ui`, not raw markup.

- **Surfaces.** Page = `bg-canvas` (set on body). Content sits on `Card` (birch, hairline, `rounded-card`). Inside a
  card, group things with `CardSection` (hairline above) or a sunken `Panel`. No heavy shadows or borders, and no
  gradients. Never put `overflow-hidden` on a card, or evidence tooltips get clipped.
- **Spacing.** Use a 4 px grid. Inside cards: padding `p-5`, gaps between sections `mt-5 pt-4`, row gaps `gap-1.5`
  to `gap-2.5`. Between page sections: `mt-12`. Pages go inside `<PageContainer>` (`max-w-6xl`; use `wide` or
  `full` for diagrams).
- **Type.** `PageHeader` title is `font-display text-3xl font-extrabold`. A card title is `font-display text-xl
  font-bold`: a plain sentence saying what is wrong ("Ferry sold out, rebooking timed out"). Body is
  `text-base` (14px, `text-body`); labels and meta are `text-sm text-muted`; ids, refs and plates are
  `font-mono`; numbers are `tabular-nums`. Use sentence case everywhere, with no ALL CAPS labels.
  `font-display` is only for titles and countdown numerals.
- **Tone budget.** Colour is spent only on what needs a person.
  - `danger`: the promise or someone's safety is at stake, or a deadline is under 15 min or overdue.
  - `warn`: decide soon (under 60 min), or stale or unconfirmed.
  - `info` (teal): the agent is working, or something is live or simulated.
  - `ok`: confirmed and holds.
  - Everything else is `neutral`.
  - At most one asphalt `primary` button per card: the recommended action. Alternatives are `secondary`,
    rejection is `danger`, and "Ask agent to…" is `quiet`.
  - Do not use Tailwind's raw palette (indigo, purple, pink); `gray/zinc/…` are already remapped to Bahn greys.
- **Evidence.** Every fact the operator might act on carries an `EvidenceChip` with the real `source` (the fact's
  `sourceRef`) and `at` (human time + age), plus `href` to the source when there is a page for it. Weak levels
  (REQUESTED, STATED) are dashed and hollow; QUOTED and PLANNED are outlined with a partly filled disc; BOOKED
  is teal; OBSERVED and VERIFIED are solid green. Never style a weaker fact as a stronger one. If a quote is
  past the freshness limit (G5), pass `caution`. Show the ladder with `EvidenceLegend compact` where people need it.
- **Countdowns.** Sort queues by decide-by, never by priority labels. Always pass `reason` (and `until` when you
  have one): "Decide in 42 min · until 09:42 · before buying, reconcile the timed-out booking". Use `block` on
  a card, `compact` in queue rows, `inline` in dense lists. `null` renders "No deadline" with a reason; never
  invent one. Live values come from `LiveCountdown` with the sim `clock` from `lib/clock`, never `Date.now()` in
  render.
- **Options.** At most 3 per card, each with `Slack` (promise effect), cost, who must agree, and its evidence chips.
  Mark the recommendation with the asphalt outline and the word "Recommended", not with colour.
- **Empty and loading.** Empty states say what is true and what was checked ("97 orders on track. Watchman
  checked at 09:41"), never "No data". Loading uses `SkeletonCard` / `Skeleton` in the shape of what is coming,
  inside `<Suspense>`.
- **Copy.** Short plain sentences, no jargon, no exclamation marks. Write times as `09:42` or `Thu 23 Oct, 09:00–11:00`.
  Write durations with `formatDuration` ("1 h 25 min", never "1:25").

## Status

| Phase | Agent | Status | Notes |
|---|---|---|---|
| 0 | orchestrator | done | env checked, deps installed, packet vendored, this plan |
| 1 | F1 | done | bahn (47) + control (7) migrated local+prod; 4366 bahn rows seeded on prod and local (= manifest); lib/bahn, lib/clock, tests |
| 1 | F2 | done | trigger dev + PAT auth; Jev adapter; Claude CLI runner (isolated); control MCP server; waitpoint round trip proven (2 runs) |
| 2 | D1 | done | Bahn theme (globals.css), fonts + AppShell (layout.tsx), 20 primitives in components/ui, /design style guide, preview in public/brand |
| 2 | C2 | done | lib/watchman (21-trigger taxonomy, ROUTING_PARAMS, state, Jev questions, inspect, monitors M1/M2/M8/M10, tick); trigger/watchman.ts; webhook; sim:inject/scenario/backfill; eval → research/eval/watchman-eval.md; S1–S4 proven |
| 2 | C1 | done | lib/evidence (ladder as data: 61 fact kinds, 31 claim kinds, renderers), lib/facts (projection, sync, writeFact; local DB: 100 orders → 2187 facts), lib/chain (computeChain, deriveDecideBy), lib/gate (G1–G7, G9, G11; 4/4 corrected proposals blocked, 0/6 approved blocked); 47 unit tests + 2 DB tests |
| 3 | P1a | done | lib/playbooks runtime (interpreter, 5 block kinds + gate step, trigger/inline adapters, registry, catalog), trigger/agent-block.ts (queue limit 2), 10 MCP tools, lib/providers (mock travel/roadside, conversation simulator + scripts), playbooks/_shared + missed-ferry; CD-420299 e2e on Trigger CLOSED with 4 BOOKED facts; 24 tests |
| 4 | U1 | done | control room `/` (decisions by decide-by, worth a look, agents on it, decided recently, watchman), `/cards/[id]` (decision + triage, clickable fact sources, approve/edit/reject → waitpoint, meta-learn hook, what happens next), `/orders` + `/orders/[ref]` (route strip, merged timeline, facts by level, run traces), sim clock control; approve + edit proven through the UI on real runs; screenshots in public/brand/screens |
| 3 | P1b | done | playbooks vehicle-warning, pickup-unconfirmed (deadline-aware wait), driver-unavailable + routing DRIVER_CANNOT_MAKE_PICKUP; find_backup_drivers tool + mock driver pool, roadside order, no-reply scripts, G4 guard in ask tools; simulated directed offer / tow effects; gate vehicle-warning context + paused-clock grace; playbook:run/reset aliases; all 3 green on Trigger (EDITED / APPROVED / REJECTED) + S2 and P4 via watchman; 8 tests |
| 4 | U2 | done | /playbooks (dagre + React Flow system overview, catalog from the registry, guardrails, escape hatch), /playbooks/[id] (block diagram, plain-language side panels, rules, triggers, settings), lib/meta + trigger `meta-learn` (proposer, side-effect-free replay backtest judged by Jev + gate, keep-if-better with one revision, PARAMETER whitelist + backtest + routing resolver), /meta (approve/reject); S5 proven on CD-420154; 8 tests; screenshots in public/brand/screens |
| 5 | T1 | done (rehearsed after X1) | honesty rule + check (re-ask once, then strip) and tool-call-only "what the agent did"; sim-time decided_at; specific titles; sim-time card expiry (`card-expiry` task) + 24 h token backstop; clock-following waits; pg pool 3; portable Claude binary; devIndicators off; mobile nav; backtest REPLACE_DRIVER; `demo:reset` / `demo:prime` / `facts:sync:local`; README.md, DEMO.md, .env.example; fresh-clone copy: install + typecheck + test green (122 passed). Rehearsal: all S1–S5 + re-plan, reject → hand-over, expiry, `/playbooks#proven`, CD-420442 shortened-wait clip; fixed S1 (booked ferry + driver report closed the run), duplicate runs (runtime guard, one playbook per signal, monitor dedupe kept on reset), amendment sources kept on reset, decide-by reasons, re-plan call listing; 22 `demo-*.png`; final checks: test 149/14 skipped, test:local 163, lint, typecheck, fresh clone green |
| 5 | X1 | done | R1 #1 run only what was approved (execute plan, server + runtime refusal, re-plan edges, no plan text after a failed booking, no departed bookings); #2 hand-over card on fail/reject/expiry/refusal/Jev error, honest home; #3 per-signal dispatch key + live-run dedupe, ESCALATED not active; #4 first-draft catches on cards, live Bahn replay panel on /playbooks, held-out gate tests (16/16, blind 9/12 → 12/12, benign 0/6); triage threshold 0.8 + quiet rules (59 → 48 triage messages, recall 85.7 %); 27 new tests |

## Morning checklist (T1, for Damir)

The stack is running in the primed demo state, with the clock paused at Wed 21 Oct 12:00 EEST: Next on :3001, `trigger dev`
(shared, log `…/scratchpad/shared-trigger-dev.log`), local Supabase. Nothing is committed.

1. **Look first** (10 min):
   - `http://localhost:3001/`: 6 decisions, CD-420593 waiting, "Decided recently" with 2 handled items;
   - `/cards/<CD-420299>`, `/cards/<CD-420322>`;
   - `/meta`: 1 approved, 1 proposed;
   - `/playbooks#proven`.
   - Then skim `public/brand/screens/demo-*.png` in order. That is the whole demo.
2. **Read** `DEMO.md`: the video script (2:45), the live runbook with rehearsal times, and the backup plan. Then
   `README.md`, which judges will follow from a fresh clone.
3. **Commit and push yourself.** No agent staged anything. The repo must be **public** for the submission. Check with
   `git status` that no `.env*` file except `.env.example` is included; `.gitignore` already excludes them. Every
   untracked directory (`lib/`, `playbooks/`, `trigger/`, `mcp/`, `scripts/`, `app/…`, `components/`, `data/`,
   `public/bahn`, `public/brand`, `research/…`) belongs in the commit. `research/research_notes/*/data_samples` stays
   ignored on purpose.
4. **Before recording or the live demo**, after any code change or after playing around:
   ```bash
   pnpm demo:reset && pnpm demo:prime     # 5 s + ~2 min, ~$0.70–0.90
   ```
   Keep the clock paused until the S3 step, and decide CD-420322 and CD-420449 before you speed it up.
5. **If something is off:**
   - `pnpm trigger:dev` must show "Local worker ready" (or `pnpm dev:stack`);
   - `curl -s localhost:3001 > /dev/null`;
   - green checks: `pnpm test`, `pnpm test:local`, `pnpm lint`, `pnpm typecheck`.
6. **Prod DB is untouched** by T1; `demo:reset:prod` exists but was never run.

Known rough edges (none block the demo):
- An Edit that only picks another option is refused: write a change, edit a message or drop a step.
  "Approve B instead" is the plain alternative.
- The model is not deterministic: the primed cards' wording and options differ slightly on every prime.
- Step times on a card are approximate after the clock ran fast. (UTC/ISO times, "(INSTRUCT_HOLD …)" and fact ids in
  card text are cleaned at render since P2.)
- S3 at 120× moves sim time about 2 h; undecided cards whose decide-by passes expire and hand over (by design).
- The gate matches keys and phrases, not meaning. Say "blocks the 4 operator-corrected Bahn proposals in replay; 9 of
  12 blind rewordings the first time", nothing broader.
- `/meta` and `/playbooks` no longer print real dates (P2). Only the old demo-13 screenshot still shows one.

Decisions for you:
- **S3 in the live demo:** live, CD-420593 shows the normal wait (120 min, next deadline days away). The "75 min
  instead of 120" shortened wait is CD-420442 and needs a clock jump that disturbs other cards, so it is a recorded
  clip (demo-17/18). Keep it that way, or record a fresh clip after the live part.
- **Claude binary:** the native `~/.local/bin/claude` is tried before PATH, because cmux's wrapper is first on your
  PATH. Set `CLAUDE_BIN` if you prefer another.

## [V1] Product trailer (25 Oct, 08:45–09:40 EET)

A silent product trailer recorded from the running app, frame by frame: Playwright 1.62.0 (devDependency, matches the
cached chromium-1234), headless Chromium at 1440×810 × 4/3 = 1920×1080. Per frame, an in-page runtime sets a camera
transform on `<body>`, an animated cursor with click ripples, captions in the app's fonts and a highlight ring; then
one CDP screenshot goes into ffmpeg. Clicks on fact chips, "After yes", a playbook step and Approve A on CD-420360 are
real; the Approve on `/meta` is visual only (the proposed amendment stays for the live demo).

- Files in `public/brand/trailer/`: `trailer.mp4` (1080p master, 86 s), `trailer-720p.mp4` (README, < 10 MB),
  `trailer-teaser.gif` (11 s, 800 px, top of README), `poster.png`, and three 18–22 s stories at 720×406
  (`control-room-story`, `playbooks-story`, `meta-story`).
- Scenes, in order: title → driver message + watchman reading (S1's real signal) → queue ("37 s after the message")
  → CD-420299 facts (provider answer, quote) and option slack → CD-420360 "after yes" plan, limits, Approve A, what
  happened next → agents on it (CD-420593 wait) → missed-ferry diagram and step panel → live Bahn replay → `/meta`
  correction and backtest → CD-420360 follows the approved rule → five parts + repo.
- Re-record: on a primed stack, `pnpm sim:scenario S1` (the message scene and the queue use its signal and card; without
  it the 25 Oct values are used), then `pnpm trailer:record --assemble`. Read-only scenes only:
  `pnpm trailer:record --scene title,message,queue,card-facts,agents,playbook,proven,meta,next-run,outro --no-writes`;
  `approve` needs an open CD-420360 card (`pnpm playbook:reset CD-420360 && pnpm playbook:run --playbook missed-ferry
  --order CD-420360`). `pnpm trailer:assemble` re-cuts from the clips in `node_modules/.cache/trailer/`.
- Afterwards run `pnpm demo:reset && pnpm demo:prime`: recording approves CD-420360 and S1 adds a card on CD-420075.
- Code: `scripts/trailer/` (`director.ts` frame engine, `runtime.ts` in-page overlay, `scenes.ts`, `stage.ts` overlay
  HTML, `data.ts` real rows, `assemble.ts` ffmpeg cuts, `record.ts` entry).

## [R1] Refactor: one card, one decision; option templates (25 Oct, from 12:15 EET)

Phase 1, re-plan and the honesty check removed:

- **One card = one decision.** Edit = approve the chosen option with reworded messages and/or skipped steps, plus an
  optional reason labelled "for the record; nothing written here is carried out". Anything else is a Reject with a
  note (hand-over card + `meta-learn`, which already fires on REJECTED). No `replan` block, no `needsReplan` edge, no
  "What should change" field, no `canReplan` on the card page.
- **The rule, one function on both sides.** `approvalProblem({ option, decision })` in `lib/playbooks/decision.ts`
  runs on the option *as offered*: blocked-step rule, then `editProblem` (an edit must reword or skip something; only
  steps of that option; only steps that send a message can be reworded; not reworded and skipped at once; not every
  step skipped). The server (`decisionRefusal`) and the execute block call it with the same inputs; the human block
  now outputs `offered` (as on the card) next to `option` (edits applied) so the runtime check sees what the server
  saw. `applyDecision` split into `chosenOption` + `applyEdits`.
- **The contract refuses free text in edits.** `decisionPayloadSchema.edits` is `.strict()` with only `messages` and
  `removeActionIds`: a payload still carrying `edits.note` fails to parse (the run hands over: "the decision it
  received could not be read") instead of silently dropping it. Side effect: cards decided under the old contract
  (with `edits.note`) no longer parse in `lib/meta` (`/meta` shows their amendment without the source note;
  `meta-learn` skips them).
- `refusedStep`/`REFUSED_BLOCK_ID` moved to `lib/playbooks/blocks/executePlan.ts` next to `executeRefused`; the
  playbooks route to `REFUSED_BLOCK_ID`.
- Honesty check deleted (`lib/playbooks/honesty.ts`, the re-ask/strip in the agent block, `honesty` in the block-run
  input): the card's "what the agent already did" comes only from recorded tool calls.

Phase 2, option templates (closed options):

- **A template is code.** `defineTemplate` (`lib/playbooks/templates/index.ts`, types in `types.ts`): id, title,
  description, when to offer it, a zod `slots` schema, ordered steps with fixed action classes (each step builds zero,
  one or one-per-list-item actions from the slots), and deterministic label, plan change and reversibility. `expand`
  parses the slots and builds the option; fact ids cited in slots join the option's facts. Playbooks declare their
  set in `playbooks/<id>/templates.ts`; `BACKUP_OFFER` is shared (`lib/playbooks/templates/shared.ts`).
- **The agent fills slots only.** `optionsAnswerSchema(templates)` is a union over the playbook's templates
  (`id` A–C, `template` literal, `slots`, `detail`, `factIds`) plus `situation`, `recommendation`, `agentWillNot`
  (vehicle-warning adds `callNotes`). `z.union` (anyOf), not `discriminatedUnion` (oneOf), for structured output.
  Option letters stay agent-chosen so `describeCatches` can follow an option across the gate's re-ask.
- **One pipeline.** The options block carries `templates`; the prompt renders them after the instructions
  (`renderTemplatesForAgents`), the gate step reads them from the `optionsFrom` block and expands each answered
  option into the existing card option shape before chain + guardrails. Execute is unchanged (per action class).
  Gate feedback names the slots behind a failing step ("A2 (from driverMessage)"); `CardAction.slot` records them.
- **Cost** comes only from booked quotes now (`costCents` left the agent's answer).
- **Shared backup offer uses `ASK_DRIVER`** for the current driver's message in both playbooks. driver-unavailable
  used `INSTRUCT_CHANGE`, which `planExecution` defers until the new driver accepts, so the "hold off travelling"
  message would never have been sent on a yes.
- **Meta.** `compactOutput`, the judges and `gateOnOutput` expand answers by the block's templates. Recorded runs
  whose `--json-schema` differs from the block's current one (every run before this change) are not replayed:
  `loadLearningCase` skips such a card with a reason, and regression replays skip such runs. A replay of an old run
  would answer in the old shape and test nothing of today's block.
- Catalog: an options agent's panel on `/playbooks/[id]` lists its templates (title, description, when, steps with
  who must agree, from the action-class authority table).

## [R1] Phase 3: one playbook for any lost travel leg (25 Oct, 12:45–14:15 EET)

- **`missed-ferry` → `missed-connection`.** Folder, id, task id (`missedConnection`), `PLAYBOOK_IDS.missedConnection`,
  registry, catalog labels, demo/sim/run/trailer scripts, tests and `ARCHITECTURE.md`. Triggers: `CROSSING_CAPACITY`
  and the new `TRAVEL_LEG_LOST` (a booked train, flight, bus or hotel the driver can no longer use; the taxonomy is
  now 22). `DRIVER_CANNOT_MAKE_PICKUP` no longer lists "missed a train or flight": it is "cannot or will not do the
  job", and points a lost leg that new travel solves to `TRAVEL_LEG_LOST`. Precondition `ferry-route` became
  `has-travel` (a ferry route or any live reservation). DB rows still say `missed-ferry` (SQL in the phase report).
- **Gather owns the baseline.** `checkItinerary` on the records alone: `baseline` (legs with verdicts, where it places
  the driver), `mustAddress` (booked legs missed, unreachable or redundant), `lostLeg` (first broken one, the card
  title). `nothingToDo` also needs the baseline feasible.
- **Where the driver is now is a typed slot, not derived.** No record says "the driver is still in Munich"; only the
  message does. The options answer carries `driverAt: { city, at, factId } | null` (the cited statement must be on
  file, else it is ignored), and the gate's itinerary starts there. Without it the checker infers the start from
  scans, which cannot know a leg was missed. This is the one interpretation the agent still makes; everything else
  (which legs break, what each option leaves broken) is the checker's.
- **Templates.** `KEEP_EXISTING_BOOKING`, `REBOOK_REST_OF_TRIP`, `REBOOK_ASK_EARLY_DELIVERY`. Slots: `newSailing`
  (`{ quoteFactId, replaces } | null`, so the plan change stays `NEW_SAILING`/`NO_CHANGE` without reading facts),
  `bookings` (trains and hotels, each with `replaces`), `cancellations` (booked-leg refs), `driverMessage`
  (+ `customerMessage`). Steps: BOOK_TRAVEL sailing → BOOK_TRAVEL others → CANCEL_TRAVEL each → INSTRUCT_CHANGE
  (→ CUSTOMER_MESSAGE). `StepAction`/`ExpandedAction`/`CardAction` gained `target` (CANCEL_TRAVEL) and `replaces`
  (BOOK_TRAVEL). The change set is derived from the expanded actions, not from template-specific code
  (`itineraryChangeSet` in `lib/playbooks/itinerary.ts`): bookings → `{ source: 'fact', factId, replaces }`,
  cancellations → `cancel`.
- **Gate.** `gateStep({ itinerary: { start } })` opts a playbook in. Per option two pure checker runs: without its
  cancellations (which booked legs are broken or redundant → G7's `brokenLegs`) and with them (G12 + the card's leg
  list, `CardOption.itinerary`). G12 "No booked leg left broken" (new in `GUARDRAILS`) blocks an infeasible
  itinerary, one message per checker `violations` line, so the re-ask and "Caught before you saw it" name the leg.
  The CHAIN rule still runs (slack, cost, decide-by come from it).
- **G7 with the new semantics** (`lib/gate/check.ts`, pure): a cancel is allowed when the target is dead
  (MISSED_CHECK_IN/CANCELLED), in `context.brokenLegs`, replaced by a BOOK_TRAVEL of the same proposal
  (`payload.replaces`, matched across reservation id and booking fact id), or by a cited confirmed replacement. A
  CANCEL_TRAVEL naming no booking on record is blocked; a healthy leg with no replacement stays blocked.
- **CANCEL_TRAVEL is executable (simulated).** `TravelProvider.cancel` (+ mock), `TRAVEL_CANCELLED` fact
  (`cancelledFact`, level BOOKED, new FactKind in `lib/evidence/ladder.ts`), `buildCtx` drops a reservation with a
  visible TRAVEL_CANCELLED (chain + itinerary), and our own BOOKED facts now load as kept itinerary legs. Execute
  order: bookings → cancellations → messages; a cancellation is skipped with a plain reason unless every booking
  succeeded; the driver message gets "Booking references: …" and "Cancelled: … (cancellation CXL-…)". A failed
  cancellation also holds back the plan messages. The facts projection itself is untouched (it projects bahn rows;
  the cancellation is its own fact that buildCtx and execute read).
- **Card.** Under each option, "The rest of the trip": one line per leg with Keep/New/Cancel, the verdict reason
  when not ok, "Replaced by …", cancelled legs struck through (`parseItinerary` in `lib/control-room/options.ts`).
- **S6** (`scripts/simulate/scenario.ts`): CD-420439, inserts `res-sim-…` hotel (delivery city, night after the
  arrival) and return train (after the promise window), moves the sim clock to 20 min after the check-in cutoff,
  then the driver message. Every ferry order's promise is days after arrival, so the next sailing breaks the hotel,
  not the return train. `demo:reset` deletes `res-sim-` rows in the same transaction as simulated messages.
- Test fixture: the Munich → Tallinn bundle moved from the itinerary test into `lib/chain/itinerary/testing.ts`
  (`munichTallinnBundle`), reused by `playbooks/missed-connection/steps.test.ts` (G12 blocks the forgotten Tallinn
  hotel, the complete plan passes, G7 both ways, gather baseline).
- Not done: no Jev eval for `TRAVEL_LEG_LOST` (needs OpenRouter); next duty is not passed to the itinerary in the gate
  (duties are not loaded in the run context); old approved `missed-ferry` amendments may name the removed templates.
