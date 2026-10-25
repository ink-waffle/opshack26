# Demo

Two things: the 2–3 minute video for the submission, and the 5–10 minute live demo with Bahn. Both run on the local
stack, primed with `pnpm demo:reset && pnpm demo:prime`. Every time below was measured in the T1 rehearsal (25 Oct,
02:00–02:40 EEST), and every step has a screenshot in `public/brand/screens/demo-*.png`.

## Before you start (every time)

```bash
pnpm dev:stack        # or three terminals: pnpm exec supabase start · pnpm dev:local · pnpm trigger:dev
pnpm demo:reset       # 5 s: no runs, cards or signals; clock Wed 21 Oct 09:00 UTC (12:00 EEST), paused
pnpm demo:prime       # 2 min, about $0.70–0.90: 6 decision cards, CD-420593 waiting, ~9 triage cards
```

- Prime **after the last code change**: `trigger dev` rebuilds on every save. Don't edit code between prime and demo.
- Leave the clock **paused** until S3. Cards expire on sim time at their decide-by, so a paused clock never expires
  one. The waitpoint token behind a card has a 24 h real-time backstop.
- `demo:reset` keeps one approved missed-connection amendment and one proposed driver-unavailable amendment, each with the
  card it was learned from, so `/meta` has a "before" and something to approve live.
- To redo one scenario: `pnpm playbook:reset CD-…`. It clears that order's runs, cards, message signals and simulated
  messages; amendment source cards stay.
- Browser: one window at 1440 × 900, zoom 100 %. Tabs: `/`, `/playbooks`, `/meta`. Terminal in the repo with a large
  font, for the `pnpm sim:*` commands.

## Video script (2:45)

| Time      | Screen                                              | Say                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15 | `/` (demo-01)                                       | "This is Bahn's control room. Of 79 active orders, six need a person now, sorted by when the decision is due, never by a priority label. The agents work on the rest, or nothing is wrong."                                                                                                                                                                                                                      |
| 0:15–0:40 | CD-420322 card (demo-07)                            | "Bahn's own example: a red warning light. Before anyone looked, the agent asked the driver if he is safe and where exactly he is. It found two tow services nearby and checked the delivery promise. It brings one decision: call the owner, roadside or tow. Every line has a chip." Click a chip: "a driver statement, a quote, a booking: never confused."                                                    |
| 0:40–1:05 | CD-420299 card (demo-02, demo-03)                   | "Here the ferry is sold out and an earlier booking attempt timed out. A deterministic rule locked buying until the ferry company confirmed that attempt made no booking. Then the agent found the next sailing, a hotel and a train home. The promise still holds with 42 hours to spare." Click **Approve A**.                                                                                                  |
| 1:05–1:15 | CD-420299 after approve (demo-04)                   | "The paused run resumes in about three seconds. It books, simulated, and texts the driver the plan with the references. Facts are written by tools, never by the model."                                                                                                                                                                                                                                         |
| 1:15–1:35 | terminal → `/` (demo-06)                            | `pnpm sim:scenario S1`. "A driver writes from the terminal: the sailing is full. Bahn's system calls our webhook. The watchman, a cheap typed decision model, classifies the message in half a second and starts the missed-connection playbook. Fifty seconds later there is a card."                                                                                                                           |
| 1:35–2:05 | CD-420154: Reject with a note → hand-over → `/meta` | "The operator disagrees: no hotel nights in Lahti, ask the customer first. One card is one decision, so they reject it with that note and a person takes the order. The system turns the correction into a rule, replays the recorded runs with it, and keeps it only if it follows the correction and breaks nothing. The chief dispatcher approves it, and the next run follows it." (demo-21)                 |
| 2:05–2:20 | `/playbooks#proven` (demo-16)                       | "The rules are checked against Bahn's own history. Replayed on Bahn's 14 recorded agent proposals, they block the 4 that operators corrected and let the 6 approved ones through. On 12 rewordings written blind they caught 9 the first time."                                                                                                                                                                  |
| 2:20–2:45 | `NIGHT_SHIFT.md`, `research/review/R1.md`           | "How we built it: one orchestrator agent and a dozen specialised coding agents overnight, coordinated through one contract file with a decisions log. We checked instead of trusting. An independent reviewer agent found that approval wasn't always what got executed, and we fixed it before recording. We threw away our first idea, an auto-generated decision tree, after testing it on every case order." |

Cut-ins recorded separately:

- the deadline-aware wait: CD-420442 "Waiting until 17:00 EEST… 75 min instead of 120", then its card (demo-17,
  demo-18);
- a hand-over after a reject (demo-15).

## Live demo runbook (about 9 min)

| #   | Step                   | What you do                                                                                                                                                                                                                                                                                                                                                     | Rehearsal time                                 |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | The queue              | `/` (demo-01). Read the header (6 decisions, 1 agent working, worth a look, quiet). Read the first row's countdown and its reason.                                                                                                                                                                                                                              | talk, 45 s                                     |
| 2   | Bahn's example         | Open CD-420322 (demo-07): driver safe, location, two tow services, "the agent will not…". **Approve A** (owner's own service; Bahn books nothing).                                                                                                                                                                                                              | 1 min; run resumes in < 5 s                    |
| 3   | Evidence               | Open CD-420299 (demo-02). "What happened" → "What the agent already did" (provider answer, 5 searches, each with its facts). Click the green **Provider answer** chip → **Show the record** (demo-03). Read the G9 line: buying was locked until the ferry company answered.                                                                                    | 1 min 30 s                                     |
| 4   | Approve                | **Approve A**. "What happens next" fills with 3 booked facts and the driver message (demo-04). **Full timeline and facts** → `/orders/CD-420299` (demo-05).                                                                                                                                                                                                     | run resumed and closed in 3 s                  |
| 5   | S1 live                | Terminal: `pnpm sim:scenario S1` (prints the watchman's verdict: `CROSSING_CAPACITY 0.98 → missed-connection`). While it works, open CD-420449 and **Approve B** (directed offer). Back on `/`: CD-420075 "Driver may miss the booked ferry" is first in the queue (demo-06).                                                                                   | script 5 s; card after 54 s                    |
| 6   | S4 escape hatch        | `pnpm sim:scenario S4` → "Worth a look" gets "Status or information request" on CD-420123 (demo-08): no playbook fits, so a person gets the message, the facts and the next deadline.                                                                                                                                                                           | 6 s                                            |
| 7   | S5 reject → rule       | CD-420154 → **Reject** with the note _No Lahti hotel nights. Ask the customer about an earlier delivery first; book hotels only if they decline._ The order shows up in "Worth a look" as a hand-over. Talk over `/meta` until the proposed rule shows up with its backtest (judge score before → after on the corrected run, other runs replayed).             | hand-over at once; amendment after ~100 s      |
| 8   | Approve the rule       | `/meta` → **Approve for every future run**. `/playbooks/missed-connection` → click "Rebook the rest of the trip": the approved change is listed (demo-14). If step 7 is still running, approve the pre-made driver-unavailable proposal instead.                                                                                                                | 6 s                                            |
| 9   | Reject → hand-over     | Open CD-420399 → **Reject** with a note, e.g. _Don't offer the job to a backup while the driver hasn't said no; ask him for a final yes or no first._ The order shows up in "Worth a look" as "Options rejected, a person takes it", with what the agent found (demo-15).                                                                                       | hand-over at once; a proposed rule ~60 s later |
| 10  | Proven                 | `/playbooks#proven` (demo-16): 4 of 4 corrected blocked, 0 of 6 approved blocked, the blind-rewording line.                                                                                                                                                                                                                                                     | 30 s                                           |
| 11  | S3 deadline-aware wait | On `/`, "Agents on it": CD-420593 "Waiting until 14:00 EEST…" (demo-09). Clock popover → **120×**. After about a minute the run wakes. Press **Pause** as soon as the row changes. A card follows (demo-10). Then show the recorded CD-420442 clip: "waiting 75 min instead of 120: the driver must leave Stockholm for the ferry check-in" (demo-17, demo-18). | wait ends after 62 s at 120×; card after 108 s |

Order matters: S3 moves sim time about 2 hours, so decide CD-420322 and CD-420449 (decide-by 12:00 and 12:25 CEST)
first, or they expire and hand over (demo-19 shows an expired card).

### Backup plan

| If                            | Then                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| An agent run is slow or fails | Show the primed cards and the screenshots: every step has a `demo-*.png`. A failed run opens a hand-over card by itself.      |
| `trigger dev` dies            | `pnpm trigger:dev` in its own terminal; cards that already exist keep their tokens.                                           |
| Jev / OpenRouter is down      | Skip S1/S4 live. `pnpm playbook:run --playbook missed-connection --order CD-420075` starts the playbook without the watchman. |
| Claude rate limit             | Put `ANTHROPIC_API_KEY` in `.env.local`, restart `trigger dev`.                                                               |
| meta-learn is slow            | `/meta` already has a proposed amendment to approve.                                                                          |
| The state got messy           | `pnpm demo:reset && pnpm demo:prime` (2 min) and continue from the queue.                                                     |

## The five parts: where they are shown, how they are tested

| Part                 | Shown in the demo                                                                                              | Tested                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Watchman           | S1 and S4 terminal output; the "Watchman" line on `/`; signals on order timelines; "Worth a look"              | `pnpm test lib/watchman` (monitors reproduce the backtest hits; routing), `pnpm eval:watchman` (97 messages; needs-attention recall 85.7 % at 0.8)                                 |
| 2 Router + playbooks | every card; "Agents on it"; S3 waits; hand-over; `/playbooks` diagrams                                         | `pnpm test lib/playbooks playbooks` (interpreter, waits, decisions, execute plan, honesty check, expiry)                                                                           |
| 3 Facts, gate, chain | fact chips and the source view; the G9 line; "Caught before you saw it"; slack per option; `/playbooks#proven` | `pnpm test lib/gate lib/chain lib/facts lib/evidence` (gate: the 4 corrected Bahn proposals blocked in replay, 0/6 approved; held-out rewordings 16/16, blind 9/12 the first time) |
| 4 Control room       | `/`, cards, order timeline, approve / edit / reject                                                            | this rehearsal, `public/brand/screens/demo-*.png`                                                                                                                                  |
| 5 Meta + catalog     | S5 on `/meta` and `/playbooks/<id>`; the next CD-420154 card follows the approved rule (demo-21)               | `pnpm test lib/meta` (replay prompt, whitelist, routing overrides, correction text)                                                                                                |

## Rehearsal log (T1, 25 Oct 02:00–02:40 EEST)

- `demo:reset` 5 s → `demo:prime` 140 s ($0.89). Final re-prime: 112 s, about $0.70.
- CD-420299 **Approve A** → run resumed, 4 bookings + driver message, CLOSED in 3 s.
- S1 → `CROSSING_CAPACITY 0.98` → missed-connection → card "Driver may miss the booked ferry" in 54 s.
  - Fixed during the rehearsal: with a booked ferry, the playbook used to close at once, ignoring the driver's report.
- CD-420322 Approve A, CD-420449 Approve B: both CLOSED.
- S4 → triage card in 6 s.
- S3: 120× for 62 s; CD-420593 woke at sim 11:04; card in 108 s; no card expired.
- S5 (before option templates): a written change re-planned the card; since then an Edit can only reword a message or
  skip a step, and the demo uses Reject with a note. Amendment timing to re-measure.
- Reject on CD-420399 → hand-over card at once; driver-unavailable amendment proposed after 59 s.
- `/playbooks#proven` loads in 2.6 s.
- CD-420442 clip: clock jumped to 22 Oct 12:45Z, "waiting 75 min (sim) instead of 120"; 60× for 78 s; card after 110 s.
- After a final `demo:reset` + `demo:prime`: CD-420154's new card follows the approved rule (A = ask the customer
  first; C = Lahti hotel nights only if the customer declines).
