# Evaluation: do the playbooks help?

**Method**
- Each case was run by hand through `decision_tree.yaml`: monitors and classifier, routing, playbook facts, options, chain calculator, gate, card.
- The resulting package was compared with what Bahn's operators and agents actually did, and how proposals were reviewed (`cases.md`).
- X (external) steps are assumed mockable. Where a number depends on an X result, it is marked "(X)".

**Verdict scale:**
- **same**: the package matches the operators' actions.
- **better**: it adds a decision-relevant fact, an earlier action or a deadline the record lacks.
- **worse**: it would do or say something the operators avoided.
- **n/a**: the playbook adds nothing beyond showing facts.

## 1. Real cases (23)

| Case | Triggers → playbooks | Package the playbooks produce | What actually happened | Verdict | Where the gain comes from | Decisive fact type |
|---|---|---|---|---|---|---|
| **CD-420299** | sold out + timed-out booking + receiver unconfirmed → P1+P10 | <ul><li>Purchase lock until the provider reconciles the 07:10 attempt (G9).</li><li>24 Oct 12:00 sailing keeps the promise: arrives 25 Oct 16:00, promise ends 27 Oct 13:00, **42 h slack**.</li><li>Hotel night near the terminal on 23→24 Oct (driver's condition, `msg-xb315bf2f67bbfb61`).</li><li>Custody 25→27 Oct or early delivery (draft).</li><li>No date change, so no approval request needed.</li><li>Receiver confirmation draft.</li><li>Cost ≈ EUR 387 + hotel nights (X).</li></ul> | <ul><li>Booking approved and failed.</li><li>Verify-outcome proposal pending 44 min.</li><li>Operator at 08:14 asks for "a reviewable plan with the cost and ETA difference".</li></ul> | **better** | Calculator (slack, custody) + G9 + checklist completeness | X (provider reconcile, fresh quote) |
| **CD-420154** | sold out + positioning + shared-site release + receiver → P1+P4+P8+P10 | <ul><li>25 Oct 10:00 sailing keeps the promise (**20 h slack**). The 26 Oct sailing breaks it.</li><li>Positioning train Bordeaux→Marseille 21 Oct 21:00 (EUR 113) must be bought **today**.</li><li>Per-vehicle release instruction for site-065.</li><li>Customer's conditional ("before contacting the recipient") parsed (L), so no recipient contact is drafted.</li></ul> | "Recheck only" approved 08:42, awaiting execution. No mention of the positioning purchase deadline. | **better** (at risk of **worse** if L misses the conditional) | Calculator (slack + first-departure deadline) | X (fresh capacity) + L (driver accepts plan) |
| **CD-420603** | booked crossing at risk → P2 | <ul><li>Wait to the 12:00 cutoff.</li><li>Ask the driver for a gate ETA (free).</li><li>Carrier rollover asked.</li><li>Fallback promise impact cannot be computed: no next-sailing quote on record (X).</li><li>Tracking (1772 km to go, coarse) vs "queue before the terminal" shown side by side, unresolved.</li></ul> | Amendment requested; original kept; refresh approved, awaiting execution. | **same** | — | External event (gate scan) |
| **CD-420194** | gate rejection (after cutoff) → P3/P1 | <ul><li>G5 forces a fresh capacity check (the only quote is from 15:04, after the 14:00 proposal).</li><li>Book the verified 18 Oct 03:00 sailing. Promise held.</li></ul> | Agent proposed "first available"; operator EDITED it. Outcome identical. | **same** as operator; **better** than agent | Guardrail G5 | X (fresh capacity) |
| **CD-420342** | gate manifest mismatch → P3 | Ask the carrier to correct the manifest; driver holds. | Fixed in 16 min by ops-travel. | **same** | — | X (carrier) |
| **CD-420020** | ferry tracking gap → P6 | Resolve on a fresh observation; `boarding_confirmed` stays false (G3). | Agent proposed `mark_boarding_confirmed: true`; EDITED. | **same** as operator; **better** than agent | Guardrail G3 | D |
| **CD-420449** | driver ill → P4 | <ul><li>**Decide by 10:25** (first paid leg, `res-x0320cdf029cd4c96`).</li><li>EUR 368.79 of paid positioning at stake.</li><li>Options: keep / directed-offer backup (keep current until accepted) / afternoon slot (customer).</li><li>M6 escalates the work item, 21.6 h overdue.</li></ul> | Approved "prepare a named backup and recheck … at the agreed check-in". The 10:25 departure is never mentioned. | **better** | Calculator (first departure = deadline) + M6 | L (driver's yes/no) |
| **CD-420399** | positioning infeasible (driver rest) → P4+P11 | <ul><li>A: replacement driver (X).</li><li>C: move pickup to the 22 Oct afternoon. Driver free 10:00Z, rail ~3–4 h (X), site-043 open until 15:00Z, still meets the 23 Oct promise. Needs site agreement + buyer approval.</li><li>G4 keeps the other customer's trip out of the buyer draft.</li></ul> | Pending proposal (same three ideas, no timing), work item with ordered next action, internal confidentiality note. | **same** (slightly more concrete) | Calculator (slot option) | X (backup availability) / H (buyer) |
| **CD-420702** | missed yard slot → P4+P11 | <ul><li>M2 fires at 06:00, when the slot opens with the assignment not started, **1 h 47 min** before the driver's message. Ask the driver at once, and seek a replacement for a 25 km leg inside the 09:00–11:00 local window.</li><li>After the miss: same actions as the operators.</li></ul> | All handled within 13 min of the site's 08:19 message; promise revision sent to the customer. | **better** (earlier detection; whether a replacement could have made it is unknowable) | Monitor M2 | L (driver) |
| **CD-420322** | warning light → P5+P6+P11 | <ul><li>Safety template (no mechanical advice, G4).</li><li>One decision: call the owner, roadside vs tow; today's delivery will be late.</li><li>Driver has no next duty; waiting cost runs from 08:04.</li><li>P6 would have pinged the driver at 05:16 (tracking gap). Unknown whether that changes anything.</li></ul> | Operator safety message at 08:13. Agent's restart advice EDITED out. Customer: "keep the vehicle stopped". | **same** as operator; **better** than agent | Guardrail G4 | H (owner's choice) |
| **CD-420593** | vehicle not at pickup → P7 | <ul><li>Hold.</li><li>Site VIN check.</li><li>Customer question draft.</li><li>**Driver's own limit 08:27** (`msg-xdfc0efc421f38068`).</li><li>Release-driver option with payout decision.</li></ul> | Proposal pending 59 min (past the driver's limit); alert acknowledged 08:28. | **better** | L-extracted deadline on the card | L (site/customer stock check) |
| **CD-420201** | customer pull-forward, then car not found → P7+P15+P17 | The customer's request is CHANGE_WINDOW (needs a yes). **No playbook step forces a site check before a pull-forward**, so the failure would repeat. | Window moved on customer + driver agreement; car not found; cancelled; PAYOUT_DUE + EUR 12 parking. | **same** (would not have prevented it). With the induced rule from meta_loop.md §4.3: better. | — | L (site) |
| **CD-420089** | M3 driver-chain conflict → P4+P18 | <ul><li>Flag: the executed Lahti→Espoo train (`res-xac6651462ee0355a`) assumes drv-055 starts from CD-420576's endpoint.</li><li>But CD-420719 (Oulu→Helsinki, 22–23 Oct) comes in between.</li><li>Ask the driver for their 26 Oct start city (free); rebook if needed (yes).</li></ul> | Booking approved and executed; nobody noticed. | **better** | Calculator (driver chain) | D |
| **CD-420347** | site location conflict + live offer → P8 | Pause or withdraw offer EUR 456 (MARKET yes); stop time = 12:00 callback. | Same reasoning; work item due 09:10 still open. | **same** | — | L (stock control reply) |
| **CD-420516** | key holder unclear → P8 | ASK_SITE within 1 h of the 19 Oct 10:44 message. | First site contact 21 Oct 08:24 (**45.6 h**). | **better** (timing) | Checklist ordering / SLA | L (site) |
| **CD-420458** | release missing, then seller hold → P8 | ASK_SITE within 1 h of 19 Oct 10:59. The seller hold would have surfaced ~45 h earlier. | First site call 21 Oct 08:34–08:38 (~45.5 h). | **better** (timing) | Checklist ordering / SLA | L (site) |
| **CD-420437** | receiver authority + changed hours → P10 | <ul><li>ETA 13:58 (coarse) vs access until 16:00Z vs promise end 14:00.</li><li>Receiver-name draft. Driver keeps keys (auto).</li></ul> | Same. Work item opened 08:52. | **same** (at risk of **worse** if L misses the 08:42 correction) | — | H/L (customer names receiver) |
| **CD-420164** | signed handover missing → P12 (+M6) | <ul><li>Escalate the 45.4 h overdue item.</li><li>At delivery on 12 Oct, flag the missing signature (site-035 `requires_signed_release`).</li></ul> | Customer discovered it after 7 days; asked again on 21 Oct. | **better, conditional**: the 12 Oct flag needs the broad M5a rule, which also fires on 4 quiet orders with no doc row (`doc-0264` itself was written on 19 Oct). | Monitor M6; M5a | External party (receiver's signature) |
| **CD-420055** | condition claim → P13 | Preserve; compare; flag the pickup photos that were never reviewed (`proof-x68d75425bfd74ca1`); G4 blocks attribution. | Attribution proposal REJECTED; compare proposal pending. | **same** as operator; **better** than agent | Guardrail G4 | H |
| **CD-420675** | late delivery → P11 | Customer approval draft; keep both promises. | Done in 9 min; delivered in the revised window. | **same** | — | H (customer) |
| **CD-420419** | cancellation → P15 | Confirm, cancel, stop driver, payout, cost review. | Identical sequence in 51 min. | **same** | — | H |
| **CD-420404** | fee request → P16 | Shows offer history, reach checks, the request ≠ acceptance. No fee logic. | Ops decided EUR 179, not 190. | **n/a** | — | H (fee judgement) |
| **CD-420656** | car not ready + driver positioning → P8+P4 | <ul><li>Keep slot, ask the site for a release estimate.</li><li>Flag that drv-449's positioning Lyon→Marseille is not booked (M4).</li></ul> | Kept slot; planning searching for capacity. | **same** | — | L (workshop date) |

Two smaller items, not counted above:
- **better**: the inbox ambiguity for drv-055. The calculator lists the next duty as CD-420719, 22 Oct 11:00–13:00 local, Oulu.
- **better**: the CD-420177 / CD-420941 cross-check. site-020's claim that it "received the returned trade-in" contradicts `evt-x4e26861492d23d27` (delivered to site-028), and the operator note repeated the claim.

### Tally (23 cases)
| Verdict | Count |
|---|---|
| better | 9 (299, 154, 449, 702, 593, 089, 516, 458, 164-conditional) |
| same as operators | 13 |
| n/a | 1 |
| observed worse | 0 |
| at risk of worse (text nuance) | 2 (154, 437) |
| better than Bahn's own agent proposals | 4 of 4 corrected proposals (020, 194, 322, 055) |

**Guardrail test on all 14 proposals:**
- G3, G4 and G5 would have blocked the 4 corrected payloads: 020 boarding, 194 unrefreshed "first available", 055 attribution, 322 restart.
- They block none of the 6 approved ones (089: quote 20 min old; 299: 10 min; the others are recheck or prepare actions).
- That is 4/4 caught and 0/6 false blocks on this small sample.

### Where the gains come from
| Source | Number of "better" verdicts | Notes |
|---|---|---|
| Deterministic chain calculator (slack, first-departure deadline, driver chain) | 5 (299, 154, 449, 089, inbox) | Most valuable component |
| Monitors creating agent tasks earlier | 3 (702, 164, plus M6 on 449) | — |
| Checklist ordering ("ask the site within 1 h") | 2 (516, 458), plus 015 | This is a service-level rule, not a branch |
| L-extracted deadline from a driver's message | 1 (593) | — |
| Hard guardrails | 4 (vs the agent proposals) | — |
| **Branching logic** | **0** | No case improved because of a branch choice |

## 2. Synthetic cases (12, all SYNTHETIC)

| Scenario (SYNTHETIC) | Playbooks | Prepared package | Fit | Where it breaks |
|---|---|---|---|---|
| S1: driver misses the 06:10 train to a Frankfurt pickup slot 09:00–11:00 local at site-042-type in-slot-only release | P4 (D/C) | <ul><li>Next train (X), arrival vs slot.</li><li>Site's in-slot-only rule means a slot move is needed: ASK_SITE, then customer draft.</li><li>Missed fare + new fare (yes).</li><li>Driver's next duty checked.</li></ul> | clean | Refund of the missed fare is unknown (X) |
| S2: carrier cancels Hamburg→Helsinki sailing with 4 Bahn cars booked | P1 ×4 | One card per order, each with slack and next-sailing options | **partial** | No cross-order allocation of scarce space (which car gets the 2 remaining slots: tightest promise first?). Needs a fleet-level step the per-order playbooks lack. |
| S3: driver at the dealer, car still in the workshop "two hours" | P8 + P7's driver-wait clock | Site ETA; driver limit; wait vs release; slot | combination | P8 has no driver-wait clock; it must borrow P7's. Cross-playbook composition is manual in the spec. |
| S6: VIN on the car ≠ VIN on the order/CMR | P7 | Hard stop (G4 substitution); site and customer reconcile; corrected CMR template | clean | — |
| S8: minor collision on the motorway, car drivable | P5 | Safety template; photos; owner call (human); promise; driver | **partial** | Police report, insurer notification and liability steps are absent. "Drivable" is a judgement the agent must not make (G4). |
| S9: EV cannot charge at the planned charger, 3 h before a ferry cutoff | P5 + P2 | Charger search (X); ferry cutoff check; rollover | **partial** | P5's options (roadside/tow) are wrong for charging. The real options are an alternative charger, a different route or rolling the ferry. Needs its own option set. |
| S11: driver silent, slot opened 30 min ago | P4 via M2 | Call or ask the driver; backup shortlist; site informed; slot move | clean | — |
| S12: receiver absent, driver at the private address at 17:00 | P10 + P14 + P11 | Wait clock; customer draft (human); driver keeps car and keys; overnight custody option + hotel; next-day delivery = promise change | combination | Needs a person fast (customer contact). Every option needs a yes. The card is quick to prepare, but no part is automatic. |
| S13: order says Tampere, note says Helsinki | P9 | Customer question draft; no offer until resolved | clean at intake | If found mid-transit, P9 (intake-only) does not apply. Needs P10 + P11. |
| S14: car arrives at a dealer after closing on a Friday | P10 + P14 | Driver keeps car and keys; Monday appointment; hotel nights; promise | clean | Weekend custody cost (X) |
| S15: speeding fine arrives 3 weeks after delivery | P17 | Match time, plate and vehicle to assignment and driver | **partial** | The matching rule is not specified (D, easy to add). No urgency, so it should not be a card at all. |
| S20: customer cancels while the car is mid-route | P15 | Stop safely; driver holds | **partial** | Where the car goes (back to seller? hold?), custody duration, ferry booking changes, cost recovery: none of these are templated. |

**Synthetic fit:** 5 clean (S1, S6, S11, S13 at intake, S14), 2 combinations (S3, S12), 5 partial (S2, S8, S9, S15, S20). The playbooks generalize when the option space is the same as an observed case. They break when the options are new (charging, accident liability, mid-route cancellation) or cross-order (S2).

## 3. Measures

### 3.1 Coverage
- **Observed episodes:** 71 (order × trigger pairs listed in failure_modes.md). All 71 map to a playbook, but **that is circular**: the playbooks were derived from these same episodes, so 100% coverage is not evidence.
  - Episodes needing two or more playbooks at once: 299, 154, 194, 342, 020, 399, 702, 322, 201, 089, 656. That is 11 of the 23 evaluated cases (48%).
- **Generalization (synthetic):** 5 of 12 clean, 2 of 12 by composition, 5 of 12 partial.
- **Cases per playbook:**
  - Built from a single observed case: P5 (322), P15 (419), P16 (404).
  - Built from 2: P3 (194, 342), P13 (055, 455).
  - These playbooks are guesses about a class from one or two examples.

### 3.2 Where the structure breaks
1. **Combinations.**
   - Half the real cases need 2–4 playbooks merged into one card.
   - Conflicts between them need judgement: P10 wants to contact the receiver, but the customer said not to before approving a date (154).
2. **Text-only nuance.**
   - Conditional instructions (154 `msg-xc9c0de8086ad8c68`).
   - Corrections (437 `msg-x0049fe6fc2fd0b0e`).
   - Authority claims (014).
   - Confidentiality (399).
   - Self-imposed deadlines (593).
   - Four languages (de 458/291, fr 656/675, fi 177/1010).
3. **Contradictory sources.**
   - Tracking vs driver text (603; 075's overnight movement vs "stopping for rest").
   - Site claim vs records (941/177).
   - Positioning projections vs assignments (089, 311).
   - A tree assumes consistent inputs. The playbook can only show the conflict and ask.
4. **External availability decides most outcomes.**
   - Capacity, hotels, backup drivers and refunds are X.
   - With quotes older than 90 min (G5), the playbook can prepare but not conclude.
5. **Judgement calls:** fees (404), liability (055, 455), recovery (322), payouts (201, 702).
6. **Cross-order effects:**
   - Site-065 queue (154/689/656/692).
   - Site-020 (941/413/177).
   - Site-001 stock problems on two orders (593, 516).
   - Driver chains (089/719/576; 992/735/579).
   - Bundle keys (384/413).
   - Per-order playbooks see none of these unless the calculator looks across orders (it does for driver chains, not for sites).
7. **Noise.**
   - Monitors fire on 54 of 100 orders.
   - Routed to people, that is worse than the starter's 43. Routed to agent tasks with person cards only on decisions, it is manageable.

### 3.3 Deterministic vs LLM vs external share
| Measure | D | L | X | H |
|---|---|---|---|---|
| All playbook steps (YAML, 123 steps) | 52% | 32% | 15% | 2% |
| Blocking facts only (33) | 70% | 24% | 6% | — |
| Weighted over the 23 evaluated cases (steps of invoked playbooks) | 55% | 29% | 16% | 1% |
| **Trigger** (alerts; operator exception actions) | 4 of 19 alerts; 4 of 28 actions | 15 of 19; 24 of 28 | — | — |
| **Decisive fact** (the one that settles the decision; 23 cases) | 2 (020, 089) | 8 (449, 702, 593, 201, 516, 458, 347, 656) | 6 (299, 154, 194, 342, 399, 603 as an external event) | 7 (322, 437, 055, 675, 419, 404, 164-receiver) |

**Reading:**
- By step count, half the work is deterministic, and that half is the scaffolding: windows, slack, deadlines, bookings vs quotes, driver chains, authority.
- But the trigger is usually text.
- And the fact that decides the outcome is deterministic in only 2 of 23 cases. In the rest it is an outside party's answer (read by L), an external availability check (X), or a human judgement.
- So the agent's job is to compute the scaffolding and to **go and get the decisive answer itself** (drivers, sites and providers are free to contact) before a person sees the card.

### 3.4 Monitor backtest (snapshot)
Full table in decision_tree.md §4.1.
- **Useful as person alerts:** M3 (2 hits, both real problems), M6 (3 overdue items), M11 (1), M10 (3, one correctly classed "record only").
- **Useful as agent tasks only:** M1 (4, 3 quiet), M4 (6), M7 (11), M8 (4), M12 (12).
- **Noise:** M9 (coarse ETA vs promise), M5b (21 unreviewed proofs) and the broad M5a.

## 4. Overall verdict

**A decision tree, in the sense of branching logic that picks an action, is not useful here.**
- No observed case improved because of a branch.
- Triggers are text-first.
- Half the cases are combinations.
- The decisive fact usually comes from outside the records.
- The observed agent failures were claim inflation, not wrong turns.

**What is useful, in order of value:**
1. **A deterministic chain calculator the agent must call.**
   - Promise slack per option, the first-departure deadline, the driver's true duty chain, bookings to create or cancel, and who must agree.
   - It produced most of the "better" packages (299, 154, 449, 089).
2. **Hard deterministic guardrails** (evidence level, freshness, forbidden classes, promise invariance, unknown-outcome lock).
   - They catch 4 of 4 observed corrections with 0 of 6 false blocks.
   - They must sit outside the LLM.
3. **Per-trigger checklists** (ordered facts, required-before-options items, option templates, stop conditions).
   - They make the agent do the free asks first and fast, which would have saved ~45 h on 516 and 458.
   - They give operators a predictable card.
   - This is the useful core of the builder's "tree" idea.
4. **Monitors routed to agent tasks, not to people.**
   - They catch latent risks (089, 311, 075, 702 at 06:00) without flooding the queue.
5. **A fixed card schema** with a decide-by clock, sources and evidence levels.

**So the answer to the question:** use an LLM agent with tools, constrained by a small set of hard guardrails and per-trigger checklists. Give it a mandatory deterministic chain calculator and a routing table. Do not build or demo a decision tree.

**On the builder's hypothesis ("not solvable, but preparable"):**
- Fully preparable from records plus mock tools: about 11 of 23 cases (299, 154, 194, 342, 020, 449, 702, 089, 675, 419, 603 as a prepared fallback).
- Conditionally preparable: about 10 of 23 (593, 516, 458, 347, 437, 399, 322, 656, 164, 201). The package is "here is what each answer implies", and the missing answer belongs to a site, driver, customer or owner.
  - The agent can collapse most of these itself, because asking drivers and sites is free.
  - The real bottleneck is the **customer**: every customer question needs a human yes under the rules. That is where earned autonomy should start (meta_loop.md §5).
- Not preparable beyond evidence: 2 (055 liability, 404 fee). CD-420455, outside the 23, is the same kind of case as 055. These are judgement calls.
