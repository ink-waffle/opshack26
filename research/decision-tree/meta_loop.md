# Meta-level learning loop: from human resolutions to rules (design sketch)

**The idea.** Every time a person approves, edits or rejects an agent proposal, or resolves an exception by hand, that is a labelled example. An offline "autoresearch" agent mines these examples for:
- new guardrails
- new checklist steps
- new monitors
- autonomy changes

None of them is deployed without a backtest and a human yes.

The packet already has the right core structure: `agent_proposals` with `proposed_payload`, `review.final_payload`, `review.decision_note`, `evidence_refs`, `dependency` and `execution.effect_event_ids`. The loop reuses that same structure one level up, so **a rule change is itself a proposal that a person reviews**.

## 1. What must be recorded

| Record | Already in the packet | Missing (must add) |
|---|---|---|
| Trigger and playbook(s) used | alert `signal`, `conversation_id`, `triage_basis_message_id` | Playbook ID and version that ran; classifier labels with quoted span |
| Facts the agent gathered | `evidence_refs` (IDs only) | Each fact with its evidence level and age at decision time (the card snapshot) |
| Options prepared | — | All options shown, with their chain deltas (not just the chosen one) |
| Proposal vs final | `proposed_payload`, `review.final_payload`, `decision`, `decision_note`, `reviewer_id`, `reviewed_at` | Field-level diff with a severity class (assertion field vs wording vs parameter) |
| Execution | `execution.status/error/effect_event_ids`; effect event `actor_type` | Recheck result (G8) at execution |
| Manual resolution (no proposal) | `operational_events` with `source_message_ids` (e.g. 702 `evt-x8305c9562cdb3889`), alert `acknowledgement_reason` / `next_action`, `work_items.next_action`, internal notes | The ordered list of what the operator looked at and asked; **call recordings and transcripts** (the builder's idea), linked to the order and time |
| Outcome | Some: `delivery.late_outcome_recorded` (675), the delivered event vs promise window | Outcome labels per episode: promise kept? cost vs prepared? reversed later? complaint? |
| Time | Message and event timestamps | Time-to-first-cheap-action; time a human spent on the card |

The biggest gap is **outcome labels**. Without them the loop can only learn "what humans changed", not "what worked". Outcomes can be computed for most episodes from later records: delivered inside the promise, payout decisions, expenses. Add an explicit `episode.outcome` written at close.

## 2. What the loop can induce

| Artifact | Learned from | Direction | Minimum evidence |
|---|---|---|---|
| **Guardrail** (field or evidence constraint) | EDITED or REJECTED proposals where an assertion field changed | Adds a block | 1 severe episode plus a backtest with 0 false blocks on approved history |
| **"Agent will not" constraint** on cards | Approval notes that add conditions | Adds a stated limit | 1 note; merge duplicates |
| **Checklist step** (required fact before an option) | Manual resolution sequences: the operator did S before A; failures where S was skipped | Adds a check | ≥ 3 episodes, or 1 failure where the check was free |
| **Monitor** | Text-discovered cases with an earlier structured precursor | Adds detection | Backtest precision on history; must route to an agent task unless precision is high |
| **New playbook or option template** | Clusters of episodes the classifier labelled "other", or that needed ad-hoc options | Adds coverage | ≥ 3 similar episodes |
| **Autonomy change** | Per action-class track record | Removes a human gate | High bar (§5) |

**Asymmetry by design:**
- Rules that add a check or a block are cheap and can be adopted on thin evidence. The worst case is an extra question or a blocked proposal.
- Rules that remove a human step need volume and outcome evidence.

## 3. How a rule is induced and validated

1. **Collect.** Nightly: newly closed episodes, with diffs, notes, manual sequences and outcomes.
2. **Propose.** An LLM drafts a candidate in a small rule language over the records. Examples:
   - `block if proposal.payload.mark_boarding_confirmed == true and not exists(ferry_terminal_events where kind in BOARDING_KINDS)`
   - `require ASK_SITE before CHANGE_WINDOW(pickup earlier) when basis.source_type == CUSTOMER`

   Each candidate carries its rationale and the episode IDs it came from.
3. **Backtest (D).** Replay all historical episodes at their decision times.
   - **True positives:** episodes where a human made the same correction.
   - **False positives:** approved and successful actions the rule would block, or quiet orders it would alert on.
   - **Sensitivity:** a sweep over thresholds.
4. **Review.** The rule becomes a `rule_proposal` with the same fields as `agent_proposals`:
   - `proposed_payload` = rule
   - `evidence_refs` = episodes plus backtest report
   - `review.decision` / `decision_note` / `final_payload`

   A named rule owner (e.g. ops-travel for travel rules) approves, edits or rejects it.
5. **Shadow.** Run live for N days, logging "would have fired" against what humans did.
6. **Enforce, with expiry.** Each rule has a version, owner, review date, and fire and override counts. A rule that is often overridden comes back for review.

## 4. Worked examples from the packet's real reviews

### 4.1 Boarding is not something a tracking signal can confirm (CD-420020)
- **Episode:** `agent-x40ab609877909161`, monitor-agent, `alert.resolve`.
  - The diff sets `mark_boarding_confirmed` from true to false and adds `resolution_evidence_id: track-x0fe69bf9925c4660`.
  - Note: "Resolve only the connectivity gap. Keep boarding unconfirmed."
  - Severity: an assertion field. The agent's own rationale said the observation "does not confirm boarding".
- **Induced rule R1 (guardrail, extends G3):**
  - Journey milestone fields (`boarding`, `check_in`, `destination_arrival`) can be set only from a `ferry_terminal_events` record of the matching kind, or a carrier scan.
  - `alert.resolve` on a tracking gap may cite only a fresh `tracking_observations` ID.
- **Backtest:**
  - Proposals touching milestone fields: 1 (020). True positive 1, false positive 0.
  - Reservations: none of the 12 ferry bookings has `boarding_confirmation` other than UNCONFIRMED. Even 342, with CHECK_IN_ACCEPTED, keeps boarding UNCONFIRMED. So the rule matches how the records are already kept.
- **Card change:** the tracking-gap card says "connectivity restored; boarding still unconfirmed (no gate or carrier record)".
- **Trust effect:**
  - "Resolve tracking gap on fresh observation, no other field" becomes a candidate for L1 (auto-execute + notify) after a track record.
  - Milestone fields stay gated forever.

### 4.2 A quote list is not capacity (CD-420194)
- **Episode:** `agent-x3151927d69c76a10`, travel-agent, `travel.rebook`.
  - The diff sets `use_first_available` from true to false and adds `require_fresh_capacity_check: true`.
  - Note: "Do not select a crossing from an unrefreshed list. Book only the verified replacement."
  - At proposal time (16 Oct 14:00) no quote for this order existed. The fresh check `travel-x3a693d3d7aebc4da` is from 15:04, and the booking was made at 15:12.
- **Induced rule R2 (guardrail G5):** a booking may only reference a `travel_options` row whose `checked_at` is within T minutes of execution.
- **Backtest and threshold sweep** over the 8 quote-sourced bookings (all succeeded) plus the 194 proposal:

  | Threshold T | Historic bookings flagged (all actually fine) | 194 proposal caught |
  |---|---|---|
  | 30 min | 6 (123 ×3 at 38 min, 449 ×2 at 57, 442 at 62) | yes |
  | 60 min | 1 (442 flight `res-xa3d84f5d5f6f168e`, 62 min) | yes |
  | 90 min | 0 | yes |
  | 120 min | 0 | yes |

  Choice: **block at 90 min, warn at 60**. Supporting evidence:
  - 154's quotes were 2 h old at the snapshot, and the operator said "Recheck only".
  - 603's travel-agent rationale: "a historical quoted crossing is not confirmed capacity".
- **Trust effect:**
  - BOOK_TRAVEL stays approval-gated.
  - Narrow candidate for later autonomy: rebooking a missed crossing onto a freshly confirmed sailing that keeps the promise and costs under a ceiling (the 194 pattern).
  - It needs ≥ 30 such episodes with no reversals before L1.

### 4.3 Never give mechanical advice; the safety message becomes a template (CD-420322)
- **Episode:** `agent-x95169653143f1607`, monitor-agent, `driver.request_safe_stop_details`.
  - The diff sets `authorize_restart` from true to false, and replaces the message "Try restarting the vehicle once and send a location" with the operator's wording.
  - Note: "Remove restart advice. Ask only for a safe location detail and keep the owner recovery decision open."
  - The agent's own summary had said "without giving mechanical advice".
- **Induced artefacts:**
  - **R3 (forbidden class):** driver-facing text in a P5 context must not contain operating instructions (restart, continue, drive slowly, check fluid). An L classifier plus a field flag (`authorize_restart`, `cleared_to_drive`) enforce it.
  - **Template T1:** the reviewed final message becomes the fixed P5 step-1 template, so the human's wording is reused verbatim.
- **Backtest:**
  - The only agent-authored driver message (`msg-x55106231dda04051`) passes.
  - The operator's "Please do not drive it further" (`msg-x5a8dd1267b854b79`) must also pass. So the classifier has to tell **stop** instructions (allowed) from **operate** instructions (forbidden). That is a real test case for the classifier, not a keyword list.
- **Trust effect:** sending T1 can be L1 (auto-send), since it is human-approved text with no commitment. Everything else in P5 stays gated.

### 4.4 A checklist step learned from a manual failure (CD-420201, no proposal involved)
- **Episode:**
  - The pickup was pulled forward on the customer's message "The source branch told us the car is ready now".
  - Windows were revised at 06:10–06:11 with no site contact.
  - Then the car was not found, the order cancelled, the payout PAYOUT_DUE, and EUR 12 parking.
- **Induced step S1 (P8/P4):** before CHANGE_WINDOW that moves a pickup earlier on a customer or third-party readiness claim, ASK_SITE for this VIN's release status.
- **Backtest** over the 3 recorded window revisions:
  - 201: no site check, failed.
  - 177 (`evt-xb1d723e7e6107ddb`): site agreed in writing, succeeded.
  - 702 (`evt-xe03ba1c8477204ca`): site offered the slot, succeeded.
- **Support is thin (n = 3).** It is adopted anyway, because it only adds a free question (§2 asymmetry). It is labelled low-support and reviewed after 20 more revisions.

### 4.5 A monitor learned from a late discovery, and rejected in its noisy form (CD-420164)
- **Episode:** the signed handover was missing from delivery (12 Oct). The customer found it 7 days later, and the work item is 45.4 h overdue.
- **Candidate M5a (broad):** "delivered at a `requires_signed_release` site and no signed handover document". Backtest: 6 hits (004, 164, 194, 342, 725, 904). 4 are quiet orders with no document row at all, so it is unknown whether a signature exists.
- **Candidate M5a (narrow):** "SIGNED_HANDOVER document row MISSING". 1 hit (164), but that row was only written on 19 Oct (`doc-0264` updated 09:46). It would not have fired on 12 Oct.
- **Decision:**
  - Neither monitor alone is good.
  - The induced change is to the **data model**: create a SIGNED_HANDOVER requirement at delivery for sites with `requires_signed_release`. The narrow monitor then fires on day 0.
  - Good outcome for the loop: it found that the fix belongs upstream, not in more alerts.

### 4.6 Approval notes are constraints the agent should have written itself
All 6 approvals carry a note that adds a limit:
- 299: "retain the customer promise until a booking is confirmed".
- 449: "Do not represent the replacement as booked".
- 603: "Return for a separate booking decision".
- 154: "Recheck only. Return with capacity and route feasibility before purchase."
- 089: "then still verify completion of the prior duty and station arrival".
- 194 billing: "Do not tell the customer an invoice exists until the record is found".

**Metric: constraint-note rate on approvals = 6 of 6.** The loop turns each note into a card "agent will not …" line, attached by default to the matching playbook and action class. Success means this rate falls: approvals become plain "yes".

## 5. Trust per action class ("more freedom as it earns trust")

**Levels**
- **L0:** propose only.
- **L1:** auto-execute reversible, no-cost actions, and notify.
- **L2:** auto-execute within a cost or impact ceiling, with sampled post-review.
- **L3:** autonomous within budget, with exception-only review.

**Today, from the packet** (10 reviewed proposals):

| Grouping | Reviewed | Unchanged approvals | Severe edits or rejections | Reading |
|---|---|---|---|---|
| By agent: monitor-agent | 2 (020, 322) | 0 | 2 | worst record; it is also the one writing to drivers |
| By agent: travel-agent | 5 (194 rebook, 299 book, 089, 603, 154) | 4 (each with a constraint note) | 1 (194) | — |
| By agent: ops-copilot | 3 (449, 194 billing, 055) | 2 | 1 (055) | — |
| By class: check / prepare / recheck (154, 603, 449, 194 billing) | 4 | 4 | 0 | — |
| By class: purchase (089, 299) | 2 | 2 | 0 | 299 failed in execution |
| By class: assert state or advise (020 boarding, 194 first-available, 055 attribution, 322 restart) | 4 | 0 | 4 | — |

**Reading:**
- Trust must be granted per action class and per field, not per agent.
- "Check and prepare" work is already free under the rules (ASK_* and READ), and every such proposal was approved. Those proposals should not exist. The agent should just do the work and show results.
- Assertions are where every correction happened. They stay behind the evidence gate permanently.

**Promotion rule (per action class × playbook × context):**
- ≥ 30 reviewed executions in a rolling 30 days
- ≥ 95% approved unchanged
- 0 severe edits (assertion field changed)
- 0 outcome reversals
- 0 guardrail violations caught after execution

**Demotion:** immediately, on one severe edit or one incident.

**First candidates, in order:**
1. P18 factual status replies to customers (window ≠ ETA style). These are the biggest human-yes bottleneck (G1). Run in shadow mode first; no agent-sent customer messages exist in the packet to learn from.
2. Template T1 safety messages.
3. Pausing a live offer when the site says "do not send a driver" (347).
4. Rebooking on a freshly confirmed sailing that keeps the promise, under a cost ceiling (194 pattern).

**Never promoted:**
- MONEY
- CHANGE_ASSIGNMENT (payout)
- promise changes without customer approval
- liability
- anything in FORBIDDEN
