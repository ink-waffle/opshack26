# Decision tree for order exceptions: verdict

**Question:** would a decision tree or playbook help an agent prepare exception packages for Bahn's control room, or is an LLM agent with guardrails enough?

**Method:**
- Every case order in the fictional snapshot (2026-10-21T09:00Z) was read by hand.
- Playbooks were built from those cases.
- 23 real and 12 synthetic cases were run through them.
- Candidate monitors were backtested on all 100 orders.

## Verdict
**Don't build a decision tree.** Build an LLM agent with tools that must call:
- a **deterministic chain calculator**, and
- a **deterministic gate** (authority, evidence level, freshness),

and that follows **per-trigger checklists** (playbooks).

No evaluated case improved because of branching logic. Every improvement came from:
- the calculator (5 cases)
- monitors (3)
- checklist ordering, i.e. asking fast (2)
- an extracted deadline (1)
- hard guardrails (4 of 4 against Bahn's own corrected proposals)

Tally over 23 real cases:

| Verdict | Count |
|---|---|
| better | 9 |
| same | 13 |
| n/a | 1 |
| observed worse | 0 |
| at risk of worse from text nuance | 2 |

Of the 12 synthetic cases, 5 fit cleanly, 2 fit by combining playbooks and 5 fit only partly.

**The builder's hypothesis ("not solvable, but preparable") mostly holds:**
- About 11 of 23 cases are fully preparable from records plus mock tools.
- About 10 are preparable conditional on one outside answer, which the agent can usually get itself (drivers and sites are free to ask).
- 2 are judgement calls (liability CD-420055, fee CD-420404).

## Recommended representation: checklists + calculator + gate
1. **Detect.** An LLM classifier on inbound text, plus deterministic monitors. Most monitor hits become agent tasks, not person alerts.
2. **Route** (small deterministic table). Several playbooks can run at once; 11 of 23 cases needed more than one.
3. **Playbook:**
   - ordered facts, with "must know before options" marked
   - up to 3 option templates
   - stop and escalate rules

   Each step is typed: by step count, 52% deterministic, 32% LLM, 15% external, 2% human.
4. **Chain calculator** (deterministic). For each option it reports:
   - promise slack
   - the first paid departure, which sets the decide-by time
   - the driver's real duty chain
   - bookings to create or cancel, and cost
   - who must agree
5. **Gate** (deterministic, outside the LLM). Guardrails G1–G11 and action classes.
6. **Card.** One decision, a decide-by clock, sources and evidence levels on every fact, and what happens after "yes".

Spec: `decision_tree.md` / `decision_tree.yaml`.

## Top 5 insights
1. **Bahn's operators corrected claims, not routes.**
   - All 4 edited or rejected proposals asserted more than the evidence or the agent's authority allowed: boarding confirmed (CD-420020), "first available" from a stale list (CD-420194), driver caused the damage (CD-420055), restart the car (CD-420322).
   - In two of them, the agent's own rationale contradicted its payload.
   - All 6 approvals came with a "don't overstate, come back first" note.
   - Deterministic guardrails G3, G4 and G5 would block 4 of 4 of those payloads with 0 of 6 false blocks.
2. **Triggers are text; the chains are records.**
   - 15 of 19 alerts and 24 of 28 operator exception actions follow a message (median 9.5 min later).
   - After that, the work is maths over windows, quotes vs bookings, cutoffs, site hours and driver chains.
   - So: an LLM at the door, a calculator behind it.
3. **The calculator finds what nobody wrote down:**
   - Both sold-out crossings still meet the promise (CD-420299: 42 h slack; CD-420154: 20 h). 154 also needs a positioning train bought today.
   - CD-420449's real deadline is the 10:25 train (EUR 368.79 already paid).
   - CD-420089's executed positioning train assumes the wrong prior duty: CD-420719 (Oulu→Helsinki) sits in between. Nobody in the record noticed.
4. **The cheapest action is the slowest today.**
   - First site contact took about 45 h on CD-420516 and CD-420458, and the first reply on CD-420015 took 25 h.
   - Work items on CD-420164 and CD-420449 are 45 h and 22 h overdue.
   - An agent that asks drivers, sites and providers within minutes collapses most conditional packages before a person looks.
   - The real bottleneck is **customer contact**, which needs a human yes. Factual status replies are the first place to grant autonomy (`meta_loop.md`).
5. **Monitors must feed the agent, not people.**
   - Deterministic monitors hit 54 of 100 orders, worse than the starter's 43 "need a person".
   - Only driver-chain conflicts, overdue owned work, a live offer against a site "do not send", and sold-out-vs-promise deserve a person card. The rest are "ask the driver/site" tasks.

**Data problems found along the way:**
- **Positioning records disagree with assignments:**
  - CD-420089 assumes CD-420576 is the driver's previous duty; CD-420719 sits in between.
  - CD-420311 names Helsinki as the release city; the previous segment actually ends in Lahti.
- **A site statement contradicts the records** (CD-420941 about CD-420177), and an operator note repeated it.
- **Tracking vs driver text:** CD-420603 tracking vs "queue at the terminal"; CD-420075 tracking moving after "stopping for rest".
- **Latent risks with no owner at the snapshot:** ferry cutoffs today with no fresh driver word on CD-420075, CD-420324 and CD-420439; CD-420735 and CD-421013 moving with no tracking at all.

## Files
| File | Contents |
|---|---|
| `cases.md` | Chronological chain for all 57 case orders, with IDs; cross-case facts |
| `failure_modes.md` | 23 observed trigger types with their chains; 24 SYNTHETIC modes |
| `decision_tree.md` | Representation choice, guardrails, action classes, monitors with backtest, chain calculator, 18 playbooks, card schema, 2 worked cards |
| `decision_tree.yaml` | Machine-readable spec (validated with PyYAML) |
| `evaluation.md` | 23 real + 12 synthetic runs, verdicts, coverage, where it breaks, D/L/X shares, overall verdict |
| `meta_loop.md` | What to record, how rules are induced, backtested and approved, the trust ladder; 6 worked examples from real reviews |
| `starter_audit.md` | What the starter does and lacks against the brief; keep vs replace |

The scripts used (dossier, triggers, proposals, monitors) are in the session scratchpad: `/private/tmp/claude-501/-Users-ink-waffle-Work-operationshackathon26/83f187d4-6609-442c-a891-67c1f3f9d5af/scratchpad/scripts/`.
