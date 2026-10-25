# Starter audit (`car-delivery-control-room/starter/`)

Read-only review of the code (`app/**`, `lib/**`, `scripts/**`) and screenshots (`mockups/*.jpg`). Nothing was run or modified. I checked the key claims in the code myself:
- lanes come from `display_lane` (`app/page.tsx:33,58`, `app/api/overview/route.ts:29-34`)
- `MAX_LINES = 2` (`lib/present/board.ts:12`)
- no LLM SDK in `app/`, `lib/` or `package.json`
- no POST/PUT/PATCH/DELETE handlers or server actions
- no reference to `proposed_payload` / `final_payload`
- "43 need a person" on `mockups/board.jpg`

**In short:** a careful, read-only viewer with a good presentation layer and honest evidence labels. It has no agent, no actions and no decision model. Its board is the lane view the brief calls "not the answer".

## 1. What exists

| Route | What it shows |
|---|---|
| `/` board (`app/page.tsx`) | 7 lanes from `orders.display_lane` (intake, ready, market, booked, moving, delivered, cancelled), scrolling sideways. Header: "100 orders · 24 moving · 43 need a person". A "Needs a person" filter and search. |
| `/orders/[id]` (`OrderPane` → `order-detail.tsx`, view built by `lib/present/record.ts`) | One long column, in order:<ul><li>hero car image</li><li>one-line story</li><li>"Needs a person" panel</li><li>four tiles</li><li>route strip</li><li>conversations</li><li>evidence chips and sample files</li><li>"Prior agent work" (proposal one-liners)</li><li>the 6 latest events</li><li>"Everything on this order" (9 collapsed record sections)</li></ul> |
| `/inbox` | The 5 `support_inbox_threads` with link-state chips. Candidate orders are labelled "hypotheses, not links" (shown only when there is no confirmed link). Messages. No actions. |
| `/customers`, `/drivers`, `/sites` (+ detail) | Entity lists with order counts; detail pages reuse the board cards. |
| API | GET only: overview, order, attachments (signed S3 links), inbox, entities, reference data. |

## 2. Board and triage
- **Lanes are stored `display_lane`, not derived from facts.** The dataset README says it is a convenience field and "should not be treated as a source of truth".
- **Sorting** is within a lane only: worst tone first (danger > warn > accent > neutral > ok), then a key date. No urgency ranking across lanes.
- **"Needs a person"** comes from `deriveAttention` (`lib/present/attention.ts`). It fires on any of:
  - an open or acknowledged alert
  - an unresolved incident or open work item
  - an open endpoint claim
  - a pending, approved-not-executed or failed proposal
  - **any open conversation**
  - a custody next action
  - a booked order with unconfirmed pickup contact or access
  - a moving order without a position
  - an inbox candidate
- **Result: 43 of 100 orders flagged.** "Someone is already on it" (acknowledged, owned), "an agent could do this" (ask the site) and "a person must decide now" (322 safety stop, 449 deadline 10:25) all look the same.
- The most urgent case, CD-420322 (critical safety stop), sits in the "moving" lane, off-screen to the right on the first view.
- **Cards** show car, reference, customer, cities, the key date, and at most 2 work lines. Text is cut mid-sentence (visible in `board.jpg`: "Release document unclear · Readiness desk · +").

## 3. Order page
**Sources and evidence: better than average.**
- Windows say who set them.
- Contact and access show "stated by / confirmed via".
- Claims show source and confidence.
- ETAs are marked unverified.
- Driver reports are "not an independent confirmation".
- **Quotes are folded under "A quote is not a booking"**, separate from reservations.
- "Acknowledged is not resolved" is spelled out.

**But:**
- `evidence_refs` are counted ("3 evidence links"), not linked.
- The fallback is a raw-API link, which is a developer escape hatch.

**Time:**
- Slots and promises are local with the zone shown.
- Several places show unlabelled UTC (attention panel, conversations, inbox, activity).

**Timeline:** none merged.
- Messages, alerts, proposals and events sit in separate sections.
- Activity shows 6 events; `loadOrder` caps events at 50.
- For chain-heavy cases (299, 702) the reader has to reassemble the order of events by hand.

**First screen:** on `open-case.jpg` (CD-420299), most of the viewport is a stock car photo plus a headline. The decision (incident awaiting decision, failed booking, pending proposal) starts below the fold.

## 4. Agent and proposal UI
- **No language model, no agent loop, no chat, no approve/edit/reject.**
- What is shown for a proposal:
  - one-liners: summary, status, agent, command, reviewer, execution status
  - a collapsed card: rationale, decision note, error, evidence count, dependency text
- **Never shown:** `proposed_payload`, `review.final_payload` (so not the diff, which is the most informative thing in those records), `target_*`, links behind `evidence_refs`.
- The empty state says: "Your agent's proposals and the human decision on them belong here."

## 5. Gaps against the brief and judging notes
| Brief / judging point | Starter | Gap |
|---|---|---|
| "Shows the orders that need a person, says why, keeps the rest out of the way" | All 100 orders in lanes; 43 flagged | No queue by urgency or decide-by. No split between waiting-on-agent, waiting-on-outside-party and needs-a-decision. Delivered and cancelled take space. |
| "Just enough to decide" | Hero image, then a long scroll | No decision card, no options, no chain deltas, no recommendation, no decide-by clock |
| "See where every fact came from" | Good labels; references only counted | Clickable source chips with time and evidence level on every fact (G11) |
| "Agent does the cheap work first, knows when to stop, hands over with what it found" | No agent | Everything: tools, trace of asks and lookups, stop conditions, handover card |
| "When a person decides, is it clear what happens next" | No actions | "After yes" execution plan, recheck-before-write, execution status, undo or cancel. The data already has `APPROVED_AWAITING_EXECUTION`, `execution.status` and `dependency.execution_policy` to drive this. |
| "Show how people and agents work together; who does what, hand-overs" | Proposal one-liners | An owner and "who's on it" model per case; agent task vs person card; a handover log |
| "Not a developer tool" | Mostly calm and readable | Raw-API links, record counts, unlabelled UTC |
| "High signal, low noise with hundreds of orders" | Sideways lanes; `loadBoardBundles` loads every order's records per request | A ranked queue does not scale either if monitors page people (54 of 100 orders hit at least one monitor). Needs agent-task routing (evaluation.md §3.4). |
| Empty and loading states | Decent: skeletons, per-lane empty text, "Nothing waiting" with what was checked | Fine to keep |

## 6. Keep vs replace (for the builder's Next.js 16 + Prisma stack)
**Keep or port:**
- `lib/present/*`. Pure functions over a `Bundle`; only `load.ts` and `entity.ts` touch Drizzle.
  - `attention.ts` (`deriveAttention`, `deriveKeyDates`, `chosenWindows`, `latestTracking`): a starting rule table. Tighten the triggers and split agent tasks from person cards.
  - `labels.ts`: plain-language codes.
  - `events.ts` (`describeEvent`): one sentence per event, useful for a merged timeline.
  - `actors.ts` (`Directory.resolve`).
  - `time.ts` (snapshot-relative and local-zone formatting).
  - `record.ts` view builders (`reservationViews` vs `optionViews` keeps the quote ≠ booking split).
- `scripts/seed.ts` logic (manifest count checks, one transaction) and `scripts/smoke.ts` as a regression check.
- UI atoms: `When` with UTC tooltip, `Chip`, `ActorName`, icons, the brand tokens in `globals.css`.

**Replace:**
- The lane board as home. Replace it with a decide-by queue of person cards, plus a quiet "agent is handling" strip.
- The hero image on the order page. Replace it with the decision card on top, and a merged source-chipped timeline below.
- Client-side `useEffect` fetching. Use server components and server actions for approve/edit/reject.
- Lanes keyed on `display_lane`. Derive state from facts if lanes are kept at all.
- Raw API links.

**Build new:**
- the agent loop and tools
- the chain calculator
- the gate
- the proposal diff view (proposed vs final, with the decision note)
- a trace of the agent's asks and lookups
- execution status
