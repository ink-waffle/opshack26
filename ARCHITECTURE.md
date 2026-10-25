# Architecture

How the Bahn Control Room works, for engineers. Setup and the trailer are in the [README](README.md); the build log,
decision by decision, is in [`NIGHT_SHIFT.md`](NIGHT_SHIFT.md).

## The five parts

```
 Bahn's system (bahn.* schema, seeded from the dataset)
   │  new message / record ──▶ POST /api/webhooks/bahn          sim clock tick (every minute)
   ▼                                   │                                 │
┌──────────────────────────────────────▼─────────────────────────────────▼──────────────────┐
│ 1  WATCHMAN  lib/watchman: compact order state → Jev typed questions (21 closed triggers,  │
│              needs-attention, contradictions) + deterministic monitors (slot ended, …)    │
└──────────────────────────────────────┬────────────────────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 2  ROUTER + PLAYBOOKS  trigger → playbook table; each playbook is a block graph run as a  │
│    Trigger.dev task: deterministic · agent (Claude Code CLI + our MCP tools) · wait       │
│    (deadline-aware) · human (decision card on a waitpoint token) · execute (simulated)    │
│    Nothing fits → escape hatch: a triage card with the gathered facts                     │
└───────────────┬───────────────────────────────────────────────┬──────────────────────────┘
                ▼                                               ▼
┌───────────────────────────────────────────┐   ┌──────────────────────────────────────────┐
│ 3  FACTS · GATE · CHAIN                   │   │ 4  CONTROL ROOM  app/                    │
│  facts written only by tools/projection,  │──▶│  only the orders that need a person,     │
│  with source, time and evidence level;    │   │  sorted by decide-by; card: what         │
│  gate G1–G12 checks every option;         │   │  happened, what the agent did, options   │
│  chain: promise slack, decide-by, driver  │   │  with slack and cost, approve/edit/      │
│                                           │   │  reject → the run resumes                │
└───────────────────────────────────────────┘   └───────────────────┬──────────────────────┘
                                                                    ▼  edits and rejections
                                     ┌──────────────────────────────────────────────────────┐
                                     │ 5  META + CATALOG  lib/meta, /meta, /playbooks       │
                                     │  amendment proposed → replay backtest → chief        │
                                     │  dispatcher approves → next run follows it           │
                                     └──────────────────────────────────────────────────────┘
```

| Part                 | Code                                                             | Shown at                                           | Tested by                                                                     |
| -------------------- | ---------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1 Watchman           | `lib/watchman`, `trigger/watchman.ts`, `app/api/webhooks/bahn`   | home "Watchman" line, order timeline, triage cards | `pnpm test lib/watchman`, `pnpm eval:watchman`                                |
| 2 Router + playbooks | `lib/playbooks`, `playbooks/*`, `trigger/agent-block.ts`, `mcp/` | cards, "Agents on it", `/playbooks`                | `pnpm test lib/playbooks playbooks`                                           |
| 3 Facts, gate, chain | `lib/evidence`, `lib/facts`, `lib/gate`, `lib/chain`             | evidence chips, option slack, blocked options      | `pnpm test lib/gate lib/chain lib/facts lib/evidence`, `/playbooks#proven`    |
| 4 Control room       | `app/`, `components/`, `lib/control-room`                        | `/`, `/cards/<id>`, `/orders/<ref>`                | the rehearsal in [`DEMO.md`](DEMO.md), screenshots in `public/brand/screens/` |
| 5 Meta + catalog     | `lib/meta`, `trigger/meta.ts`, `app/meta`, `app/playbooks`       | `/meta`, `/playbooks/<id>`                         | `pnpm test lib/meta`                                                          |

## Data: two Postgres schemas

- `bahn.*` stands in for Bahn's own database: 47 tables, one per dataset collection, typed columns plus the full record in
  `raw`. Our service only reads it, except for what the simulator writes as "Bahn" (inbound messages) and the simulated
  effects of approved decisions.
- `control.*` is ours: `facts`, `signals` (watchman outputs with raw Jev answers and the routing decision),
  `playbook_runs` (one run of one playbook on one order), `block_runs` (every execution of a block: input, output, cost,
  transcript), `cards`, `amendments`, `sim_clock`.

How a case flows through the tables:

```
message / record / clock tick → signals → playbook_runs (signal_id) → block_runs, cards, facts (run_id)
                                                     amendments.source_card_id → cards
```

## Facts

A fact is one statement about an order with a source, a time and an evidence level: `REQUESTED < STATED < QUOTED <
PLANNED < BOOKED < OBSERVED < VERIFIED`. A quote is never a booking; a booking is never a boarding.

- **Projection.** `syncOrderFacts` re-projects the order's `bahn.*` records into facts at the start of every run and
  after every step (idempotent upsert by a deterministic key): a quote → QUOTED, a reservation → BOOKED, a gate scan →
  OBSERVED, a driver message → STATED.
- **Written by code, never by the agent.** Tools write what they learn (`search_ferries` → QUOTED, `ask_driver` →
  STATED), execute writes simulated bookings (BOOKED), a decision writes `OPERATOR_DECISION` (VERIFIED). Agents only cite
  fact ids.
- Facts belong to the order (`order_id`), so every run on that order sees them; `run_id` only records which run wrote
  one. `observed_at` is sim time, `recorded_at` real time.
- The ladder lives once, as data, in `lib/evidence/ladder.ts`; it renders into the agents' rules and Jev's criteria.

## Playbooks

`playbooks/<id>/playbook.ts` declares a block graph with `definePlaybook` (validated at import). The same object drives
the interpreter, the router (`triggers`) and the catalog diagram, so what you see on `/playbooks/<id>` is exactly what
runs. Edge `when` functions are real branch logic; their `label` is the same branch in words.

```
playbooks/<id>/
  playbook.ts            the graph: blocks, edges, preconditions, params
  steps.ts               the work behind deterministic blocks and the card builder
  templates.ts           the closed list of options its options agent may offer (shared ones: lib/playbooks/templates/shared.ts)
  instructions/*.md      one per agent block
  rules.md               injected into every agent of this playbook
  index.ts               definePlaybookTask(definition): the Trigger.dev task, id = playbook id
playbooks/_shared/rules.md   injected into every agent
lib/playbooks/stepHelpers.ts small helpers all steps share; gateStep/refusedStep are whole shared blocks
```

Block kinds (`lib/playbooks/blocks/*`):

- **deterministic**: calls the block's `run(ctx)`.
- **agent**: builds the prompt (shared rules, evidence ladder, playbook rules, the block's instructions, approved
  amendments, JSON context with facts and earlier outputs) and runs `claude -p` headless as a child task `agent-block`
  (queue limit 2). The CLI is isolated: no built-in tools, only our `control` MCP server with the block's tools, output
  forced to the block's zod schema via `--json-schema`. The card's "what the agent already did" comes only from the
  recorded tool calls, never from the agent's prose.
- **option templates**: an options agent never assembles steps. Each playbook declares its closed list of templates
  (`defineTemplate`: id, title, description, when to offer it, a zod `slots` schema, and the deterministic label, plan
  change and ordered steps with fixed action classes). The agent's output schema is a union over those templates
  (`template` + `slots`), plus prose only where prose is unavoidable (`situation`, per-option `detail`, `why`,
  `agentWillNot`). The template list in the prompt and on `/playbooks/[id]` is rendered from the same code.
- **gate step**: expands every answered option by its template, then runs the chain calculator and the guardrails;
  violations go back to the agent once (naming the slot to fix), whatever still fails is marked blocked. A playbook
  that repairs a whole trip (`missed-connection`) also passes `itinerary`: the option's bookings and cancellations
  become an itinerary change set (`lib/playbooks/itinerary.ts`), `lib/chain/itinerary` simulates the whole remaining
  trip from where the driver is, G12 blocks an option that leaves a booked leg broken, and the card lists every leg
  (keep / new / cancel with the verdict).
- **wait**: sleeps min(default, next commitment − buffer) of sim time, re-reading the clock every 30 s.
- **human**: writes the card, creates a Trigger.dev waitpoint token, stores its id on the card and awaits it. The UI
  completes the token with `{ action, optionId, edits, note, decidedBy }`; the same run resumes at that line, records the
  decision as a VERIFIED fact and follows the edge: execute or hand over. One card is one decision: an edit only rewords
  messages or skips steps of the chosen option (its note is for the record, never carried out); anything else is a
  reject with a note.
- **execute**: runs only the approved option's steps that can run now (simulated bookings and cancellations,
  messages); steps waiting on a condition or needing Bahn's system are listed for a person. Bookings run first,
  cancellations only after every booking of the option succeeded, then the messages with the references. Re-checks
  the gate first.

Every run that ends without carrying out a decision (failure, rejection, expiry, refusal) opens a hand-over card.
`pnpm playbook:run --inline` runs the same runtime in-process without Trigger.dev.

## Watchman and routing

On every message or record (webhook) and every clock tick, `lib/watchman` builds a compact order state with evidence
levels spelled out and asks Jev typed questions: one yes/no per trigger in a closed list of 22, needs-attention, claim
type, contradicts-records. Deterministic monitors cover time (pickup slot passed without a pickup, ferry cutoff close,
tracking silent, sold-out crossing). Routing is a table: a trigger above its threshold → its playbook (one playbook per
signal, one live run per order and playbook); a message that needs a person but fits no playbook → a triage card; a
monitor hit with no playbook → recorded only. Thresholds live in `ROUTING_PARAMS` and can be tuned by approved
amendments.

## Guardrails (the gate)

`lib/gate` is deterministic code, not a model. It runs after the agent proposes, again in the approve server action,
and again before execution.

| Rule | Meaning                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------ |
| G1   | Customer contact only as a draft a person approves                                               |
| G2   | Commitments (book, cancel, change slot or promise, cost, assignment, offers) need a yes          |
| G3   | A claim needs a fact of the level it requires ("boarded" needs a gate scan)                      |
| G4   | Forbidden: mechanical or driving advice, blame, naming other customers' jobs, substituting a car |
| G5   | No booking from a quote older than 90 sim-minutes (60–90 warns) or a sold-out one                |
| G6   | The customer promise changes only with their approval and a booked replacement                   |
| G7   | Cancel only a booking the trip check marks broken or redundant, or one the same option replaces  |
| G8   | Recheck state before writing (warning only)                                                      |
| G9   | After a booking attempt with an unknown outcome, no new purchase until it is reconciled          |
| G10  | Third-party custody (not implemented)                                                            |
| G11  | Every cited fact must exist at decision time                                                     |
| G12  | No booked leg left broken: the whole remaining trip must work out under the option               |

Action classes decide who approves: asking drivers, sites and providers and "hold the car" run on their own; anything
that changes the world needs a yes; money is a person only. `/playbooks#proven` replays Bahn's 14 recorded agent
proposals through this gate on every page load: the 4 that operators corrected are blocked, none of the 6 approved ones.
It matches keys and phrases, not meaning (9 of 12 blind rewordings caught on the first try).

## Meta-system

An edited or rejected card triggers `meta-learn`: an agent proposes up to two amendments (an instruction for one block,
or a whitelisted parameter), the target step is replayed on its recorded input with the amendment, Jev judges whether
the replay follows the operator's correction, other recorded runs are replayed as a regression check, and only an
improvement is kept. The chief dispatcher approves it on `/meta`; the next run's prompt or parameters carry it.

## Simulated clock

The dataset is a snapshot at 21 Oct 2026 09:00 UTC, so "now" is simulated: one row in `control.sim_clock`,
`sim now = anchor_sim + (real now − anchor_real) × speed`. Everything operational (decide-by, waits, quote age, card
expiry, monitors) uses sim time; pages compute the same formula in the browser for countdowns. Pause, 1×, 30×, 120× and
+1 h are in the clock popover. In production the clock is real time (speed 1), and nothing else changes.

## Scenarios

| Scenario | Trigger                             | What happens                                                                                                                                                                        |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1       | `pnpm sim:scenario S1`              | A driver writes the sailing is full (CD-420075) → `missed-connection`: sailings, hotels, driver asked, chain, gate → card                                                           |
| S6       | `pnpm sim:scenario S6`              | Simulated hotel and return train after the ferry (CD-420439), then "missed the sailing" → `missed-connection` rebooks the rest of the trip; the card lists keep / new / cancel legs |
| S2       | `pnpm sim:scenario S2`              | Red warning light (CD-420145) → `vehicle-warning`: driver safe and where, tow quotes; the owner decides                                                                             |
| S3       | clock popover → 120×                | CD-420593's pickup slot passed → `pickup-unconfirmed` waits, re-checks, asks the driver, closes or brings a card                                                                    |
| S4       | `pnpm sim:scenario S4`              | A message no playbook covers (winter tyres, CD-420123) → triage card with the gathered facts                                                                                        |
| S5       | Reject (or edit) a card with a note | `meta-learn` proposes an amendment on `/meta`; approve it and the next run follows it                                                                                               |

## Where the agent traces are

- `/cards/<id>`: "What the agent did", built only from recorded tool calls.
- `/orders/<ref>`: one timeline of messages, signals, tool calls, decisions and bookings, plus each run block by block.
- `control.block_runs`: each block's full input (system prompt, prompt, tools, schema), output, model, cost and the
  Claude Code stream-json transcript. `control.signals`: raw Jev answers. `control.facts`: every fact with its source.
- Trigger.dev dev environment: every playbook run, `agent-block` and watchman call, with logs.

## Project layout

```
app/                        control room (/), cards, orders, /playbooks catalog, /meta, /api/webhooks/bahn, /design
components/ui|control|catalog   design system (Bahn's palette), control-room views, catalog diagrams
lib/bahn                    typed read access to Bahn's records (bahn.*)
lib/clock                   simulated clock
lib/watchman                state builder, Jev questions, trigger taxonomy, routing table, monitors, inspect, tick
lib/decisions, lib/agents   adapters: Jev decision model; Claude Code CLI agent runner
lib/evidence, lib/facts     the evidence ladder as data; projection of Bahn records into facts; writeFact
lib/gate, lib/chain         guardrails and action classes; promise slack, decide-by, driver duty chain
lib/playbooks               runtime: interpreter, block executors, Trigger/inline adapters, cards
lib/providers               mocks: ferries, trains, hotels, roadside, driver pool, simulated driver and site replies
lib/meta                    learn from edits, propose, replay backtest, judge, approve
lib/control-room            server queries and formatting for the pages
playbooks/<id>/             one folder per playbook (see above)
mcp/                        the `control` MCP server the agents call
trigger/                    watchman-inspect, watchman-tick, card-expiry, agent-block, meta-learn
scripts/                    seed, simulate, playbooks, meta, demo, eval, trailer
data/bahn/                  the challenge packet (dataset, attachments, docs), vendored
research/                   decision tree study, watchman eval, independent review
```

## All scripts

| Script                                            | What it does                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm dev:stack`                                  | Local Supabase + Next.js on :3001 + `trigger dev`; Ctrl+C stops all three                                     |
| `pnpm dev:local` / `pnpm trigger:dev`             | The same two processes one at a time                                                                          |
| `pnpm prisma:migrate:deploy:local`                | Creates the `bahn` and `control` schemas from `prisma/migrations`                                             |
| `pnpm seed:bahn:local`                            | Replaces every `bahn.*` table with `data/bahn/dataset` (checked against the manifest), creates the clock      |
| `pnpm facts:sync:local`                           | Projects every order's Bahn records into `control.facts`                                                      |
| `pnpm demo:reset`                                 | Cancels live runs, wipes our runs/cards/signals/tool facts and simulated Bahn writes, clock → 09:00 paused    |
| `pnpm demo:prime`                                 | Runs the real pipeline (tick → backfill → playbooks) until the demo decision cards are open (~2 min)          |
| `pnpm sim:scenario S1…S4`                         | Plays a demo scenario as Bahn would (inserts a message, calls the webhook, or moves the clock)                |
| `pnpm sim:inject --order … --from … --text …`     | Any inbound message, as Bahn's system would send it                                                           |
| `pnpm sim:backfill`                               | Lets the watchman read the latest inbound message of every order with an open issue                           |
| `pnpm playbook:run --playbook <id> --order <ref>` | One playbook on one order, followed to its card (`--inline` runs it without Trigger.dev)                      |
| `pnpm playbook:reset <ref>`                       | Removes what runs and the simulator added to one order                                                        |
| `pnpm clock:local [--at <ISO>] [--speed <n>]`     | Shows or sets the simulated clock                                                                             |
| `pnpm spike:complete <tokenId> '<json>'`          | Completes a waitpoint token by hand (decide a card from the terminal)                                         |
| `pnpm eval:watchman`                              | Jev on every inbound dataset message → `research/eval/watchman-eval.md`                                       |
| `pnpm trailer:record --assemble`                  | Re-records the product trailer from the running app (run `pnpm sim:scenario S1` first)                        |
| `pnpm test` / `pnpm test:local`                   | Unit tests / plus DB integration tests and one live Jev call                                                  |
| `pnpm seed:generate`, `pnpm full-local-reset`     | Our internal workflow: snapshot our prod Supabase into the gitignored `supabase/` dump; not for a fresh clone |
