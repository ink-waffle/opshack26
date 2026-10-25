# Bahn Control Room: agents prepare the decision, people make it

> Write-up for the hub (Bahn · The Car Delivery Control Room). Numbers come from runs logged in
> `NIGHT_SHIFT.md` and `research/`.

## The problem

Every hiccup in a car delivery starts a chain: a missed ferry becomes a new sailing, a hotel night, a
later delivery and a decision about cost. Today a person in operations loads that whole chain into
their head, for every exception. Adding an AI that "helps" usually makes it worse: it produces
confident text the operator has to re-verify line by line, because they can't tell a quote from a
booking or a driver's word from a gate scan. Bahn's own recorded agent proposals show exactly this:
all 4 that operators corrected claimed more than the evidence allowed (boarding "confirmed" from
tracking, "first available" from a stale quote list, damage blamed on the driver from customer
photos, restart advice for a car showing a red warning light).

## What we built

A control room where agents do the legwork in the background and bring a person only the
decisions, each already prepared and checkable at a glance:

- **Only what needs you, sorted by time left.** No priority labels: every card has a countdown with
  its reason ("until 12:25: departure of the already-paid train"), computed from the order's real
  commitments.
- **Every fact shows where it came from and how strong it is**: requested, stated, quoted, planned,
  booked, observed, verified. A quote never looks like a booking.
- **A real agent per exception type**, which asks the driver and the site, searches sailings, hotels
  and trains, and returns at most three options, each with its effect on the delivery promise, cost
  and who must agree. Nothing that touches a booking, date, cost or the customer happens without a yes.
- **Fixed branches, not free-form options.** Every playbook has a closed set of option templates that
  operators know by heart (e.g. the owner's own roadside service, a tow ordered by Bahn, or wait). The
  agent only fills them in: which quote, which tow company, the exact messages. Steps, approvals and
  checks come from code, and a person can always reject and take over.
- **A meta-system that learns from operators.** When a dispatcher edits or rejects a proposal, the
  system proposes an instruction or parameter change, backtests it on recorded runs, and the chief
  dispatcher approves it before it applies. A read-only catalog shows every playbook as a block diagram
  that a non-engineer can read.

## How it works (and what's AI about it)

1. **Watchman** (Jev, TypeSafe's System One decision model, via OpenRouter, ~0.5 s and ~$0.00002 per
   call). Every new message or record is turned into a compact state and asked typed questions:
   which of a closed list of 22 triggers apply, does it contradict the records, does it need
   attention. Deterministic monitors run on a clock (e.g. pickup slot started, no pickup event).
   On Bahn's 97 historical inbound messages, `needs_attention` at the live threshold of 0.8 flags 24
   of the 28 messages operators acted on within an hour (86%). Precision is a floor at about 40%,
   because many "false alarms" are real requests that simply didn't produce an exception event.
2. **Router + a closed set of playbooks.** A trigger maps to a playbook; nothing fits → a triage card
   with the gathered facts. Four playbooks today: missed connection (any lost ferry, train or hotel; the whole rest of the
   trip is re-checked), vehicle warning, driver unavailable, pickup not confirmed.
3. **Playbooks are block diagrams** run as durable Trigger.dev tasks. Blocks are deterministic
   (gather, calculate, check), agent (Claude Code CLI, isolated, with only our MCP tools, structured
   output), wait (deadline-aware: "wait 75 min instead of 120, the driver must leave for the ferry
   check-in"), human (a decision card on a waitpoint token) and execute (simulated bookings and
   messages).
4. **Facts are written only by tools**, never by the agent's prose. The agent cites fact ids. A
   deterministic **chain calculator** turns each option into promise slack, decide-by, the driver's
   real duty chain, bookings and cost. A deterministic **gate** checks every proposal (evidence level,
   quote freshness, forbidden advice, promise invariance, unknown-outcome lock, and no booked leg left
   broken: a missed leg moves everything after it, so code re-checks the driver's whole remaining trip
   and blocks an option that forgets to replace or cancel a train or hotel). Replayed on Bahn's
   14 recorded proposals (live, on the `/playbooks` page), it blocks all 4 that operators corrected and
   none of the 6 they approved; on 12 blind rewordings of those corrections it caught 9 the first time.
   When it sends an agent's first draft back, the card says which rule did it and why. Only the
   approved option runs, and a blocked option can't be approved. An edit can only change a message
   text or drop a step; anything else is a rejection with a note. Any rejection, failure or expiry
   opens a hand-over card for a person, and the note goes to the meta-loop.
5. **Meta-loop.** An operator's edit or rejection note → an agent proposes an instruction or
   parameter change → the corrected run is replayed with it (same prompt and recorded tool results,
   tools off) → Jev judges whether the new answer does what the operator asked, and other recorded
   runs of the same step are replayed to check that nothing else breaks → kept only if the judge's
   score rises by at least 0.15 with no new rule problems → the chief dispatcher approves → every
   later run gets it. On `/meta` now: the approved missed-connection rule moved the judge's score on the
   corrected run from 0.09 to 0.70 (2 other replays still pass the rules); a proposed
   driver-unavailable rule from 0.10 to 0.94 (1 other replay). Each is one replay, not a success
   rate. After that rule was approved, the next live run on that order recommended asking
   the customer about an earlier delivery first, as the operator had asked.

Examples on Bahn's data: CD-420299's sold-out crossing still keeps the promise with 42 h to spare
(but buying is locked until the timed-out booking is reconciled); CD-420449 must be decided by
10:25, when the already-paid train leaves; CD-420089's executed positioning train assumes the wrong
previous job, a mismatch nobody in the record noticed.

## How we worked with AI

- **Research first, with agents.** Seven parallel research agents (X, Reddit, Hacker News via API,
  blogs and papers, partner dossiers) and a report writer produced a meta-analysis before the briefs
  were out.
- **We tested our own idea and threw it away.** The first plan was "let an autoresearch loop write a
  decision tree from the order history". One agent hand-built that tree from every case order in the data
  and ran 23 real and 12 synthetic cases through it. Verdict: no case got better because of a branch.
  The gains came from a deterministic calculator, hard guardrails and asking the driver or site fast.
  We kept checklists + calculator + gate and dropped the tree. We also dropped "autoresearch for the
  prompt" (too trivial) and a dispatch-optimization lab (off-brief).
- **Human decisions that shaped it**: facts only from tools; a cheap decision model as the watchman;
  a closed list of playbooks; waits that check the next commitment before waiting (a correction the
  builder made mid-design, now a block policy and a tunable parameter).
- **An overnight build run by an orchestrator agent** with 11 specialised subagents in phases
  (data, runtime spike, design system, facts/chain/gate, watchman, playbook runtime, more playbooks,
  control room, catalog + meta, integration, independent review), coordinated through one contract
  document with a decisions log (`NIGHT_SHIFT.md`).
- **What we checked instead of trusting**: the gate against Bahn's real operator corrections; the
  calculator against hand-computed cases; the watchman with precision/recall; meta amendments with a
  keep-if-better backtest; agent isolation (an agent saw 84 tools and both CLAUDE.md files by default;
  locked down to our own tools only). Agents caught each other's mistakes: the UI agent found an
  options agent claiming lookups it never made; now the card shows what an agent did only from its
  recorded tool calls, never from its own prose. An
  independent review agent then audited the whole build against Bahn's rules and found that approving
  one option could execute steps it didn't promise; we fixed that before the demo rather than hide it.

## What's next

- Connect to Bahn's real event stream and booking tools; the providers are already adapters.
- Trust earned per branch: an option template approved unchanged N times in a row becomes a
  candidate to run without a yes, with the chief dispatcher's approval.
- New branches and new playbooks proposed by the meta-system on the chief dispatcher's request; today
  it amends instructions and parameters. The research mapped 18 playbooks (release blocked, receiver
  access, condition claims).

## Links

- Repo: https://github.com/ink-waffle/opshack26
- Demo video · Slides (to add)
