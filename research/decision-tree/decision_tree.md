# Exception playbooks: representation and full specification

Machine-readable twin: `decision_tree.yaml`. Every step is typed:
- **D**: deterministic, computable from records
- **L**: LLM, reading or judging text, or drafting
- **X**: external tool, mockable (ferry, rail, hotel, provider, driver market, roadside)
- **H**: a human decision

## 1. Which representation, and why not a tree

### Options considered
| Representation | Fits the data? | Verdict |
|---|---|---|
| One decision tree (root = trigger, leaves = actions) | No. 15 of 19 alerts and 24 of 28 operator exception actions start from free text, so the root split is an LLM judgement, not a branch. Most cases are combinations (299 = capacity + unknown booking outcome + unconfirmed receiver; 154 = capacity + positioning + shared-site release). Leaves are mostly "ask X and wait", not actions. And the observed agent failures were not wrong branches. | Rejected as the main structure |
| Order state machine | The data already has lifecycle statuses. Exceptions are overlays on any state. | Used only for the playbook lifecycle (`DETECTED → GATHERING → OPTIONS_READY → AWAITING_DECISION → EXECUTING → VERIFYING → CLOSED`) |
| Rule table (condition → action) | Good for detection monitors and for authority. Cannot prepare options. | Used for detection (§4) and for the gate (§3) |
| **Per-trigger playbook** (ordered checklist plus option templates) | Matches how Bahn's operators write their own `next_action` fields, e.g. `work-x4cb7fd705c117b64`: "Check replacement drivers … If none can take it, obtain buyer approval before changing the slot and only then adjust the assignment". | **Main structure** |
| Free LLM agent with tools and guardrails | Flexible. But all 4 operator corrections were assertions the evidence did not support, so guardrails must sit outside the model. Without an ordered checklist, agents skipped cheap prerequisites (e.g. reconcile before retry in 299). | Used as the executor inside each playbook |

### Recommended: "checklists + calculator + gate"
1. **Detect** (D rule table plus an L classifier, multi-label). This produces triggers with evidence references.
2. **Route** (D table). Each trigger maps to a playbook. Several playbooks can run in parallel, and their output merges into one card.
3. **Playbook** (an L agent with tools works through an ordered checklist). Facts come before options. Required facts block the options until they are known or marked unknown.
4. **Chain calculator** (D, shared by all playbooks). It turns each candidate option into deltas:
   - promise
   - the driver's next duty
   - bookings to create or cancel
   - cost
   - who must agree
   - who must be told
5. **Gate** (D). The action class determines the approver. It also runs evidence-level, freshness and forbidden-class checks. It never lives inside the LLM.
6. **Card** (fixed schema). One decision, the options with chain deltas, sources and times, what the agent already did, and what happens after "yes".

The "tree" survives only as two small deterministic tables: routing (§5) and authority (§3). Everything between them is a checklist the LLM follows, plus a calculator it must call.

```
  inbound text ──L classify──┐                      ┌──► card (one decision)
  records ──D monitors───────┼─► triggers ─D route─► playbooks ─L+X facts─► D chain calc ─► D gate ┤
                              │                     (parallel)                                     └──► free actions run now
  agent tasks (ask/lookup) ◄──┘  (most monitor hits go here, not to a person)
```

## 2. Global guardrails (deterministic, apply to every playbook)

Each rule cites the record that motivates it.

| ID | Rule | Evidence in data |
|---|---|---|
| G1 | **No customer contact without a yes.** Customer-facing text is a draft until approved. | Brief rule. Every customer message in the packet is operator-authored. |
| G2 | **Commitments need a yes**: buying or cancelling travel, changing a pickup slot, delivery window or promise, adding cost, changing an assignment, publishing, withdrawing or repricing an offer. | Brief rule. 404 `market.fee_decided`. 702 cancellation and reposting by an operator. |
| G3 | **Evidence level.** A payload field or sentence that asserts a state needs a cited record of at least that level: BOOKED (reservation), GATE_CONFIRMED (terminal event), PHYSICAL_EVENT (pickup or delivery event), SITE_CONFIRMED (site message), HUMAN_VERIFIED. A quote, driver report, ETA or photo never upgrades a claim. | 020 `mark_boarding_confirmed` true→false. 449 "Do not represent the replacement as booked". 194 billing "Do not tell the customer an invoice exists until the record is found". 123 prepared CMR ≠ signed. |
| G4 | **Forbidden for the agent**: mechanical or driving advice in a warning or accident case; liability attribution; naming another customer's job to a buyer; substituting a "similar" car. | 322 "Remove restart advice". 055 attribution REJECTED. 399 "without naming the driver's earlier customer's trip". 593 "please do not substitute a different car". |
| G5 | **Quote freshness.** A quote older than 90 min cannot be booked or presented as capacity; re-check first. Between 60 and 90 min the card shows a warning. | 194 "Do not select a crossing from an unrefreshed list". Backtest of the 8 quote-sourced bookings (ages 8–62 min, none failed) sets the threshold (meta_loop.md §4.2). |
| G6 | **Promise invariance.** Do not change or present a new promise until the replacement is booked and the customer has approved. | 299 "retain the customer promise until a booking is confirmed". 154 and 603 `change_promise: false`. 702 `customer_delivery_promise_changed: false`. |
| G7 | **No cancel before replacement.** Keep the current booking or assignment until the replacement is confirmed. | 449 `cancel_current: false`. 603 "Keep the original booking active". 399 "keep_current_assignment_until_decision". |
| G8 | **Recheck before write.** Re-read the dependency state at execution. | `dependency.execution_policy = RECHECK_CURRENT_STATE_BEFORE_WRITE` on all 14 proposals. |
| G9 | **Unknown-outcome lock.** No retry or alternative purchase while an earlier attempt's outcome is unknown. | 299 `agent-x4ac988b20000595f` FAILED (timeout). Ack: "Reconcile the timed-out booking before offering a replacement sailing." |
| G10 | **Third-party custody.** Car or keys go to a third party (hotel, other branch) only with the owner's approval. A bundle does not release the second car early. | 324 operator reply. 384 `custody-x96b53a7c6cc48555` EARLY_COLLECTION_DECLINED. |
| G11 | **Show the source.** Every fact on a card shows its source table or record, its time, and its evidence level. | Brief judging: "Can you see where every fact came from?" |

## 3. Action classes and the authority gate

| Class | Examples | Today (start with approvals) | Can earn autonomy? |
|---|---|---|---|
| READ | look up records, compute the chain, read the inbox | auto | — |
| ASK_DRIVER | "are you safe?", "gate ETA?", "confirm by 10:00 whether you board" | auto (brief: drivers are fine to contact) | — |
| ASK_SITE | "is VIN … in your release queue?", "who holds the keys?" | auto (brief: pickup places are fine) | — |
| ASK_PROVIDER | reconcile a booking reference, refresh capacity, rollover terms | auto (no purchase) | — |
| INSTRUCT_HOLD | "keep the car stopped", "keep the keys", "do not hand over without a named receiver" | auto + notify (safety-preserving, reversible) | — |
| INSTRUCT_CHANGE | "go to the other yard", "start later", "take the car" | yes required | later, for low-cost same-day changes |
| CUSTOMER_MESSAGE | status, ETA, approval requests | draft → yes | first candidate (factual status replies, see meta_loop.md) |
| BOOK_TRAVEL / CANCEL_TRAVEL | ferry, train, hotel | yes | per-cost threshold after track record |
| CHANGE_WINDOW | pickup slot, delivery window, promise | yes (plus the customer's approval for promises) | pickup-slot moves agreed by site and customer |
| CHANGE_ASSIGNMENT | cancel, reassign, payout decision | yes | no (payout) |
| MARKET | publish, withdraw, reprice, directed offer | yes | withdraw or pause on a site "do not send a driver" |
| RECORD_ASSERTION | resolve an alert, verify an endpoint, approve proof, set a milestone | evidence gate (G3) then yes | resolve-only actions with a matching evidence type |
| MONEY | approve an expense, payout, compensation | human only | no |
| FORBIDDEN | G4 list | blocked | never |

## 4. Detection layer

### 4.1 Deterministic monitors (backtested on the snapshot; `scratchpad/scripts/monitors.py`)
| ID | Rule (D) | Hits (case / quiet) | Route to |
|---|---|---|---|
| M1 | Booked ferry, cutoff within 6 h, no gate check-in | 4 (603 / 075, 324, 439) | agent ASK_DRIVER. A human only if the answer is at risk. |
| M2 | Pickup slot started (or starts within 60 min), assignment not started | 1 at snapshot (593). 702 would have fired at 06:00 (assignment cancelled since) | agent ASK_DRIVER, then P4 |
| M3 | Driver chain conflict: the positioning record's previous duty or release city ≠ the actual preceding assignment | 2 (089 / 311) | P4, human card (a booking is involved) |
| M4 | Positioning not evidenced: consecutive duties in different cities, nothing booked | 6 (399, 656 / 405, 719, 311, 579) | agent prepares quotes. Human only if the gap is under 24 h or cross-border. |
| M5a | Delivered, signed handover doc row MISSING | 1 (164). The broad "site requires signed release" version hits 6, with 4 quiet ones that have no doc row, so it is too noisy. | P12 |
| M5b | Proof SUBMITTED and unreviewed > 24 h | 21 (9 case / 12 quiet) | background evidence queue, not a person alert. Pull into P13 when a claim arrives. |
| M6 | Owned work item past due | 3 (449 21.6 h, 164 45.4 h, 437) | escalate to the owner's lead |
| M7 | Inbound customer/site/driver message without a public reply for > 4 h | 11 (9 / 2: 177 site confirmations that needed no reply) | L triage: needs a reply? |
| M8 | In progress with no or stale tracking (> 3 h) | 4 (322 / 735, 1013, 806) | agent ASK_DRIVER |
| M9 | Coarse tracking ETA after the promise end | 1 (439, quiet). ETA jitters 10:09–13:43 on a promise 5 days out, so this is noise. | do not alert. Use only inside P2/P11 as context. |
| M10 | Sold-out crossing: earliest quote vs promise | 3 (154, 299 / 360) | P1. 360 has 73 h slack: record and recheck, no human. |
| M11 | Live offer while the pickup endpoint is NEEDS_VERIFICATION per a site statement | 1 (347) | P8 |
| M12 | Pickup within 48 h, pickup contact or access unconfirmed | 12 (5 / 7) | agent ASK_SITE only. The README warns that missing contacts alone are not an incident. |

54 of 100 orders are hit by at least one monitor. If every hit paged a person, the noise would be worse than the starter's 43 "need a person". So the design rule is: **monitors create agent tasks; only playbook output with a decision creates a person card.**

### 4.2 LLM inbound classifier
- **Input:** every external message (conversations, inbox), in any language. The data has EN, DE, FR and FI.
- **Output:** a multi-label list of trigger IDs, with:
  - the quoted span
  - speaker role
  - a claim type (REPORT, REQUEST, INSTRUCTION, CORRECTION)
- **Must also detect:**
  - **Corrections of earlier statements.** 437 at 08:42: "Correction to my earlier message: … until 18:00".
  - **Conditional instructions.** 154: "If the route cannot make it, send the revised date … before contacting the recipient".
  - **Authority claims.** 014: a handoff contact speaks; the customer authorizes.

## 5. Routing table (D)
| Trigger | Playbook |
|---|---|
| sold out / no space / booking attempt failed | P1 Crossing capacity |
| booked crossing at risk / queue / late to terminal | P2 Crossing at risk |
| gate check-in rejected | P3 Gate rejected |
| driver unwell, unreachable, can't position, missed connection, slot not started, chain conflict | P4 Driver cannot make pickup |
| warning light, breakdown, accident, charging or fuel problem | P5 Vehicle warning |
| tracking stale or missing | P6 Signal gap |
| car not found or VIN mismatch at pickup | P7 Vehicle not at pickup |
| keys, access, release document, seller hold, car not ready, extra paper | P8 Release blocked |
| missing VIN, contact or street; address conflict | P9 Intake input |
| receiver unknown, changed or absent; delivery hours | P10 Receiver / delivery access |
| ETA beyond promise (any playbook) | P11 Promise revision (shared sub-playbook) |
| proof rejected; signed doc missing; document request | P12 Evidence defect |
| damage or mark reported | P13 Condition claim |
| overnight, key or third-party custody question | P14 Custody |
| customer cancels | P15 Cancellation |
| offer unbooked near cutoff; fee request | P16 Offer unfilled |
| invoice, expense, payout | P17 Money query |
| status, ETA, document state, "which job?" | P18 Info / instruction |

## 6. Shared chain calculator (D)
**Input:** an order, plus one candidate change: a new sailing, slot, driver, delivery time, or a cancellation.

**Output (all deterministic from records, except fields marked X):**
- `promise`:
  - original window (local + UTC) and source (CUSTOMER vs SYSTEM/OPS; G6 cares about the difference)
  - new ETA basis: sailing arrival + the travel option's `capacity_note` road time, or a road estimate as a planning range only
  - slack in hours, and the verdict: holds / early arrival (custody needed) / breaks (P11)
- `driver_chain`: all of the driver's non-cancelled assignments ordered by slot start.
  - For the changed one: the previous duty's end city and time, the next duty's start city and time, and the gap in hours.
  - Flags: `positioning_record_mismatch` (089, 311) and `next_duty_at_risk`.
- `bookings`:
  - existing reservations affected, with the first departure as the decision deadline (449: 10:25)
  - new reservations to create (with quote id and quote age, G5)
  - reservations to cancel, with refundability = unknown unless provider data says otherwise (X)
- `cost`: quote amounts + hotel nights (X) + fee changes (offer) − nothing assumed refunded.
- `site`: release rules for the new time (opening hours, `release_document_rule`, `requires_signed_release`, in-slot-only release such as site-042 or site-071).
- `approvals`: the union of gate classes triggered.
- `notify`: driver, site, customer (draft), other drivers whose duty changes.

## 7. Playbooks

Format: **Detection** → **Facts** (ordered; steps marked ★ block options until answered or explicitly marked unknown) → **Options** with chain effects → **Gate** → **Stop / escalate** → **Card**.

### P1 Crossing capacity (O1, O4)
**Detection**
- D: the next crossing for the assignment has a `travel_options.status = SOLD_OUT` and no BOOKED FERRY reservation.
- D: a `travel.book_*` proposal has `execution.status = FAILED`.
- L: driver or customer text such as "no ferry reference", "not booked".

**Facts**
1. ★ D: ferry reservations for the assignment (`travel_reservations` kind FERRY: status, cutoff, terminal).
2. ★ D: open booking attempts with unknown outcome (`agent_proposals` command `travel.book_*`, execution FAILED or no reference). If any exist, G9 locks purchases.
3. ★ X: reconcile with the provider (booking-reference lookup). ASK_PROVIDER, free.
4. D: quote list (`travel_options` FERRY: departure, arrival, cutoff, `quote_cents`, `checked_at`, age).
5. X: refresh capacity for candidate sailings when a quote is older than 90 min; warn above 60 min (G5).
6. D: pickup slot, road time to terminal (`road_time_to_terminal_hours` or `terminal_road_estimates` as a range), and whether an overnight stop is needed before the cutoff.
7. ★ D: promise window and source. Calculator gives slack per sailing.
8. D: driver chain (home city, next duty after arrival).
9. L: constraints from messages: driver rest or conditions ("overnight stop and return travel"); customer approval stance.
10. D: delivery receiver status (`order_endpoint_details`).
11. X: hotel near the origin terminal for the night before the cutoff. If arrival is more than 24 h before the promise, also a custody plan (driver keeps car + hotel, or early delivery).

**Options** (at most 3, with chain deltas from the calculator)
- **A. Cheapest sailing that keeps the promise.** Book the ferry and hotel nights. Custody plan if early. Promise unchanged, so the customer message is informational only (draft). Driver return travel.
- **B. A sailing that breaks the promise.** As A, plus P11 (draft approval request to the customer).
- **C. The original attempt turns out to exist** (reconciliation). Keep it; nothing new is bought.

**Gate:** BOOK_TRAVEL needs a yes. CUSTOMER_MESSAGE is a draft. A promise change needs a yes plus customer approval (G6).

**Stop / escalate**
- Purchases stay locked until reconciliation returns (G9).
- If no sailing keeps the promise, escalate with B.
- At execution, re-check the quote (G8).

**Card:** see §8, worked for CD-420299.

### P2 Crossing at risk (O2)
**Detection**
- D: M1 (cutoff within 6 h, no gate check-in). This creates an agent task first.
- L: driver text such as "queue", "may close", "late".

**Facts**
1. ★ D: booking, cutoff, departure, terminal.
2. ★ ASK_DRIVER (L): "How many minutes to the vehicle gate?" Treat the answer as a report, not a fix.
3. D: latest tracking with `observed_at` and `received_at`, as context only. The schema forbids converting progress into a terminal ETA.
4. X: carrier rollover or amendment terms; the next sailing with capacity.
5. D: calculator, promise impact if rolled.

**Options**
- **A. Wait for the gate result** (default, no action).
- **B. Ask the carrier** to pre-arrange a rollover (free). Confirming one with a cost is BOOK_TRAVEL.
- **C. If missed**, go to P3/P1 plus P11.

**Gate:** G7 (never cancel the booking first), and never tell the driver to turn away (603 note).

**Stop:** a gate event, or the cutoff passes.

**Card:** "No decision needed until 12:00. Fallback prepared: the next sailing, late by N h, with the customer draft ready."

### P3 Gate rejected (O3)
**Detection:** D: `ferry_terminal_events.kind = CHECK_IN_REJECTED`, or the events `travel.check_in_rejected` / `travel.gate_exception_recorded`.

**Branch** on `reason` (D; L if the text is free):
- **Manifest or registration mismatch:** ASK_PROVIDER to correct the manifest (no cost, auto + notify). Driver INSTRUCT_HOLD. Wait for the re-scan (342: fixed in 16 min).
- **After cutoff:** run P1 with fresh capacity (G5). Book only a verified replacement (194).

**Card (194 type):** "Rebook 18 Oct 03:00, freshly confirmed at 15:04, EUR 219. Promise 20 Oct holds. Old booking stays MISSED_CHECK_IN (refund unknown)."

### P4 Driver cannot make pickup (O5, O6, O7; S1, S11)
**Detection**
- D: M2 (slot started, not started), M3 (chain conflict), M4 (positioning not evidenced, tight gap), or `positioning.assessment = DRIVER_REPORTED_UNWORKABLE`.
- L: "unwell", "need rest", "cannot reach", "missed the train".

**Facts**
1. ★ D: assignment, slot (local + UTC), and site release rules for that slot (in-slot-only sites, opening hours).
2. ★ D: the driver's full duty chain. Compare it with the `positioning` record and flag mismatches (089 and 719; 311 release city).
3. ★ D: paid positioning reservations for this assignment. The first departure is the **decision deadline** (449: train 10:25, EUR 368.79 total booked).
4. ★ ASK_DRIVER (L): a definitive answer by the deadline; earliest availability; where they are (a report).
5. X: backup candidates (directed-offer shortlist, reach check). The data has `market_offer_exposures` and reach checks.
6. D + X: alternative slot feasibility. Site hours that day + driver's earliest arrival (rail search), then the calculator gives the promise impact.
7. L: constraints and confidentiality from messages (do not name another customer's job).

**Options**
- **A. Keep the driver** if they confirm by the deadline. No change.
- **B. Backup driver** via a directed offer (MARKET, yes). Keep the current one until the backup accepts (G7). Then CHANGE_ASSIGNMENT (yes, payout decision) and CANCEL_TRAVEL (yes).
- **C. Move the pickup slot** (ASK_SITE first; CHANGE_WINDOW yes; customer approval draft). Recompute the promise.
- **D. Buy positioning** when it is missing (BOOK_TRAVEL yes), using the true previous-duty end city.

**Stop / escalate:** driver silent at the deadline means escalate. A backup accepting leads to a cancellation card. Never double-book.

**Card:** see §8, CD-420449.

### P5 Vehicle warning, breakdown or accident (O8; S8, S9, S10)
**Detection:** L: "warning light", "noise", "smoke", "accident", "won't charge", "wrong fuel". D (context only): tracking stale or plateaued.

**Facts** (strict order)
1. ★ ASK_DRIVER via a fixed template (auto, safety class): safe? exact location (service-area name or pin)? photo of the warning or damage? engine off? "Do not drive further; nobody has cleared driving." No mechanical advice (G4).
2. ★ D: car (make, model, year, fuel, VIN), owner/customer and tier, promise, delivery site hours, the driver's next duty.
3. L: parse the driver's replies. Location stays REPORTED (not verified).
4. X: roadside or tow candidates near the reported location. Info for the owner only; nothing booked.

**Options** (the owner decides)
- **A.** Owner's own roadside or service contact.
- **B.** Bahn arranges a tow (cost, yes).
- **C.** Wait for diagnosis.
- Always paired with P11 (late-delivery draft) and the driver plan (waiting, hotel, return travel).

**Gate:** calling the owner is human (G1). Any booking needs a yes. Restart or continue advice is FORBIDDEN.

**Card:** the brief's example: "Car stopped, driver safe at <reported place>. Call <owner> to choose roadside vs tow. Today's delivery 10:00–14:00 will be missed. Driver has no next job; waiting cost from 08:04."

### P6 Signal gap (O9)
**Detection:** D: M8.

**Facts**
- D: last observation and upload lag; whether inside a booked ferry window; the driver's last message.
- ASK_DRIVER: "all OK, next ETA?"

**Options:** none (information only). Resolve the gap only from a fresh observation. Never upgrade other claims (020, G3).

**Escalate:** no reply in 60 min **and** the promise or cutoff within 6 h.

### P7 Vehicle not at pickup (O10; S6)
**Detection:** D: `pickup.attempted` / `site_visit.outcome = VEHICLE_NOT_FOUND`. L: "cannot find the car", "different VIN".

**Facts**
1. ★ INSTRUCT_HOLD (auto): take no car, no keys (G11 identity).
2. ★ ASK_SITE (free): is the VIN in the release list or yard? Who can confirm?
3. D: order VIN and plate; other open orders at the same site. Pattern: site-001 had both 593 and 516.
4. D: driver wait clock (from the driver's own limit, 593: "another 30 minutes"); the driver's next duty; return travel (X).
5. D: promise slack.
6. L: draft the customer question "which site physically holds VIN …" (G1).

**Options**
- **A.** Wait until the clock expires.
- **B.** Release the driver now (payout decision, return travel) and reschedule once the car is located.
- **C.** Redirect to a verified location (customer authority + site confirmation + new slot).
- **D.** Cancel (customer's decision; P15).

**Card:** "Driver can wait until 08:27 (her limit). Recommend B at 08:30. Car location unknown; customer checking stock."

### P8 Release blocked (O11, O12; S3, S4, S5, S7)
**Detection**
- L: customer or site text about keys, gates, release papers, a hold, or the car not being ready.
- D: endpoint `access_status = NEEDS_VERIFICATION` with `stated_by = SITE_CONTACT`; RELEASE_AUTHORITY MISSING at a site with `requires_signed_release`; M11.

**Facts**
1. ★ ASK_SITE about this order (not the site profile) within 1 h of the trigger: car present? key holder? release document? any hold? The data shows this took about 45 h on 516 and 458.
2. ★ D: live offers on the segment, assignments, and travel already booked for this pickup.
3. D: documents (RELEASE_AUTHORITY) and the site rules.
4. L: classify the site reply as clear / conditional / blocked, and note any promised callback time.

**Options**
- **A.** Pause or withdraw the live offer (MARKET yes).
- **B.** Keep the slot pending the callback, with a stop time.
- **C.** Move the slot (site + customer + driver).
- **D.** Ask the customer to clear the hold or provide a document (draft).

**Stop:** when the callback time passes, re-ask the site (auto).

**Card:** "Site: do not send a driver; stock control calls back by 12:00. Offer EUR 456 is still bookable. Pause it? (recommended)"

### P9 Intake input missing (O13; S13)
**Detection:** D: `order.readiness_assessed` decision codes. L: address conflict between address and notes.

**Facts:** which input is missing (D); whether any customer thread exists (D); a draft question (L).

**Options:** ask the customer (draft). No offer is published until resolved (G2).

### P10 Receiver / delivery access (O14; S12, S14)
**Detection**
- L: customer or handoff-contact texts about receiver or hours.
- D: delivery endpoint UNCONFIRMED within 24 h of the promise; calculator ETA vs access hours.

**Facts:** endpoint, claims and their sources; site delivery rules; ETA (COARSE) vs access window; the promise.

**Options**
- **A.** Customer names an authorized receiver (draft).
- **B.** INSTRUCT_HOLD: keep car and keys until a named receiver (auto).
- **C.** A new time (P11).

### P11 Promise revision (O15, shared)
**Detection:** the calculator verdict "breaks", or L: "will miss the slot".

**Steps**
- D: keep the original promise record.
- L: draft the reason and a proposed window.
- D: receiver availability at the new time.

**Gate:** customer approval before anything changes (G6). Record both promises (675 precedent).

### P12 Evidence defect (O16; S17)
**Detection:** D: proof REJECTED; M5a; M5b (queue only). L: customer asks for a document.

**Options**
- Ask the driver for current-condition photos only, labelled as such (071 "do not backdate").
- Signed-document follow-up (customer or receiver contact, draft).
- Answer without overclaiming (draft).

### P13 Condition claim (O17)
**Facts**
- D: preserve originals; list proofs with review states (flag unreviewed pickup photos: 055, 455); attachments.
- ASK_DRIVER: recollection.
- L: customer photo timing.

**Options:** comparison for a human. **No attribution or compensation by the agent** (G4).

### P14 Custody question (O18; S16, S23)
D rules: G10; overnight report means asking for location and resume ETA (004, 335).

**Options:** keep the car and keys with the driver (auto); third-party custody only with owner approval (draft).

### P15 Cancellation (O19; S20)
**Steps**
1. Confirm with the customer (human-sent).
2. Cancel order, assignment and plan (yes).
3. Tell the driver to stop (auto after the yes).
4. Payout decision (human).
5. Cancel travel (yes).
6. Cost review stays open (201 note).

### P16 Offer unfilled (O20; S18)
**Facts:** D: offer age, cutoff, views/passes, reach checks; L: driver fee requests.

**Options:** reprice (yes), a directed offer (yes), a slot move.

A driver's request is not acceptance (404).

### P17 Money query (O21; S15)
**Facts:** D: expense status, supersession, payer, linked reservation. X: billing system (not in the packet).

**Options:** a factual answer (draft for customers, auto for drivers) or routing to expenses or billing.

Never say "paid" or "issued" without a record (G3).

### P18 Info request / instruction ambiguity (O22, O23)
- D: answer from records using templates (window ≠ ETA; booked ≠ picked up; prepared CMR ≠ signed).
- Driver ambiguity (inbox 089/719): list the driver's own duties with local times. Ask for the reference.
- Customer replies are drafts (G1). This is the first trust-ladder candidate.

## 8. Decision card schema, with two worked cards

**Schema** (every fact shows source · time · level, G11):
1. **Header:** order, car, customer tier; triggers; **decide-by** clock and why.
2. **What happened:** at most 3 lines, each with a source chip.
3. **What the agent already did:** asks and lookups, with answers and times.
4. **Facts:** booked / quoted (age) / reported / verified.
5. **Options (≤ 3):** promise Δ · driver chain Δ · bookings ± · cost · who must agree · reversibility.
6. **Recommendation:** one line, with why.
7. **Buttons:** Approve A · Approve B · Edit · Reject · Ask agent to…
8. **After "yes":** the ordered actions the agent will execute, and the rechecks it will run first (G8).
9. **The agent will not:** the explicit blocked actions (G-rules triggered).

### Worked card: CD-420299 (inputs from records; agent actions and X steps are hypothetical)
- **Decide by:** before buying anything. The provider must first confirm the 07:10 request created no booking (G9). (Hypothetical playbook action, not in the data: the agent asks the provider at 09:01, ASK_PROVIDER.)
- **What happened:**
  - Overnight sailing 23 Oct sold out (quote check 07:00).
  - Approved booking of the 24 Oct 12:00 sailing timed out at 07:10 with no reference.
  - Driver asked for a ferry reference (07:20).
- **Facts:**
  - Pickup Leipzig 23 Oct 09:00–11:00 (OPS).
  - Promise Helsinki private address 27 Oct 11:00–13:00 (CUSTOMER).
  - Receiver UNCONFIRMED.
  - Driver drv-140 has no next duty.
  - Quote `travel-xf29ed1732d895f37` EUR 387 is 2 h old (above the 90 min limit), so it needs a refresh (G5).
- **Option A:**
  - Re-quote, then book the 24 Oct 12:00 sailing.
  - Hotel near the Hamburg terminal 23→24 Oct (driver: "can work if the overnight stop … arranged").
  - Arrives 25 Oct 16:00. **Promise holds (42 h slack)** but the car arrives 2 days early.
  - Custody: the driver keeps the car and keys, 2 hotel nights (X), or early delivery if the customer agrees (draft).
  - Cost ≈ EUR 387 + 1–3 hotel nights + driver return.
  - Needs: yes (purchase); customer draft (informational, plus receiver confirmation).
- **Option B:** wait for the next sold-out recheck. Not recommended.
- **The agent will not:** buy before reconciliation; tell the customer of a new date (none needed); present the quote as booked.

### Worked card: CD-420449
- **Decide by 10:25** (the first paid leg, train Aalborg→Copenhagen `res-x0320cdf029cd4c96`, departs).
- **What happened:**
  - Driver drv-434 unwell since 20 Oct 10:33.
  - Promised an update "before 18:00"; none came.
  - 08:03 today: "still unsure".
- **Already done** (hypothetical playbook actions, not in the data): agent asks the driver at 09:00 for a yes/no by 10:00 (ASK_DRIVER); backup search running (X).
- **Facts:**
  - Bahn-paid positioning EUR 368.79: train 76.06, flight 16:45 176.93, hotel 115.80 (BOOKED).
  - Pickup Hamburg 22 Oct 10:00–13:00 local, private garage, contact UNCONFIRMED.
  - Promise Odense 23 Oct (CUSTOMER).
- **Options:**
  - **A.** Driver confirms fit by 10:00: no change.
  - **B.** Backup accepts a directed offer: cancel current (payout?) and change or cancel the positioning bookings (refundability unknown).
  - **C.** No answer by 10:00: hold the train decision and move the pickup to the afternoon (site + customer).
- **The agent will not:** cancel the current assignment before a backup accepts (G7); describe a backup as booked (G3).
