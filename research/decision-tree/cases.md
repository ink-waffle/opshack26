# Case walk-through (data-observed)

Source: `car-delivery-control-room/dataset/data/*.jsonl`, snapshot 2026-10-21T09:00Z. All times are UTC unless marked "local". IDs are record IDs from the packet. "Ext msg" means a message authored by a driver, customer, site contact or handoff contact. Everything here is fictional data.

Coverage: every order with an alert, incident, work item, proposal, endpoint claim, open or meaningful conversation, replaced or cancelled plan, cancelled assignment, failed or rejected travel, rejected proof, custody record, support-inbox link or non-routine event. That is 57 orders. The 11 orders whose only signal is expense review (338, 666, 694, 145, 452, 710, 917, 958, 366, 619, 725) are in the table at the end. That table also repeats expense rows for some orders covered above.

How the chains were built: one dossier per order from every table, plus a merged timeline of `operational_events` and `messages` (including conversations that list the order in `related_order_ids`). The scripts are `scratchpad/scripts/dossier.py`, `triggers.py`, `monitors.py` and `proposals.py`.

---

## A. Crossings and travel

### CD-420299 — BMW M4, Leipzig → Helsinki private address. Sold-out sailing, then a booking attempt that timed out
**Chain**
- 19 Oct 16:20: drv-140 (home Pori) accepts `asg-x91ed83adb716ef5d`.
  - Pickup slot: 23 Oct 09:00–11:00 (`win-x78c64fe493374cf4`, OPS).
  - Promise: 27 Oct 11:00–13:00 (`win-xd989292fd4c1ccb9`, CUSTOMER).
  - Delivery receiver `ep-xe49935506a7c2bc3` is UNCONFIRMED.
- 21 Oct 07:00:
  - Capacity check finds the overnight sailing (23 Oct 22:00, cutoff 20:00) SOLD_OUT (`travel-xc1d8163d5443a606`).
  - A later sailing is quoted: 24 Oct 12:00, arrives 25 Oct 16:00, EUR 387, quote only (`travel-xf29ed1732d895f37`).
  - ops-travel opens `incident-x33db4a88b8994b7b` (TRAVEL_CAPACITY) the same minute.
- 07:02: travel-agent proposes booking the later sailing (`agent-x4ac988b20000595f`).
  - 07:06 APPROVED by ops-travel with the note "retain the customer promise until a booking is confirmed".
  - 07:10 execution FAILED: "Provider request timed out without a confirmation reference … no reservation is recorded".
- 07:20 driver: "I do not have a ferry reference. Is the overnight vehicle crossing booked?"
- 07:26 alert `alert-x91c0e327c701d1e7` (FERRY_SOLD_OUT) is raised from the conversation.
- 07:29 operator → driver: "It is not booked."
- 07:38 internal note: "check driver rest and customer promise before purchase".
- 07:56 customer: "We need to approve a later delivery date before it is promised to the receiving contact."
- 08:05 driver: the later sailing works "if the overnight stop and return travel are arranged".
- 08:14 internal note (`msg-x77a59a639105e016`): "No ferry booking, hotel booking or changed customer promise exists yet. Prepare a reviewable plan with the cost and ETA difference."
- 08:16 travel-agent proposes `agent-xde17f642729c5339`: verify the provider outcome, refresh capacity, do not change the promise. It is PENDING_REVIEW.
- 08:36 alert ACKNOWLEDGED: "Reconcile the timed-out booking before offering a replacement sailing."

**What went wrong:** sold-out capacity, then an approved purchase whose outcome is unknown (a possible phantom booking).

**Chain effects:**
- A new sailing means the driver stays overnight near the terminal (hotel), and the car may need two days of custody in Finland.
- The driver needs return travel. The customer's approval stance is stated, and the receiver is still unconfirmed.

**What nobody computed in the record:** the quoted later sailing still lands 42 h before the promise ends (arrives 25 Oct 16:00; promise ends 27 Oct 13:00). The promise is not at risk. The open questions are cost, a hotel night, custody until the 27th, and the unreconciled request.

**Review pattern:** approval with an added constraint, then execution failure, then a reconcile-first follow-up that is still pending.

### CD-420154 — Audi Q8 e-tron, Marseille → Lahti private address. Sold out, plus positioning, plus a shared-site release
**Chain**
- Driver and assignment:
  - drv-464 (home Bordeaux) holds `asg-xd87b6367b854ef57`.
  - Pickup: 22 Oct 08:00–11:00 (`win-xeec56e74191a6668`).
  - Promise: 27 Oct 10:00–14:00 (`win-x498043a3a8a7a55e`). Its source is SYSTEM, which is not evidence of customer approval.
- 21 Oct 07:00 checks:
  - Sailing 23 Oct 22:00 is SOLD_OUT (`travel-x8e03315ae77a632b`).
  - Quote: 25 Oct 10:00, arrives 26 Oct 15:00, EUR 570 (`travel-xfdc7bc8969cfb3d0`).
  - Quote: 26 Oct 22:00, arrives 28 Oct 03:00, EUR 650 (`travel-xae55f19d2d6ecd88`).
  - Positioning trains Bordeaux→Marseille: 21 Oct 21:00 (EUR 113, `travel-x857e37e888660bca`) and 22 Oct 00:00 (EUR 151, `travel-x747a011a8cd671c4`). Neither is bought.
- 07:25 internal note on sold-out and positioning. 07:27 alert `alert-xe7b44c310860f4c5` (FR_IMPORT_TRAVEL_DECISION).
- 07:38 driver: "Please send the actual travel booking, not just a suggested route."
- 07:54 operator → customer: slot and promise unchanged.
- 08:08 site-065 (in `conv-xd3c8d7eb8e2f5b3f`, filed on CD-420689): separate driver and document set per vehicle for 154 and 689; do not roll Thursday's instruction to Friday's 656/692.
- 08:13 customer: "If the route cannot make it, send the revised date and reason for approval before contacting the recipient at the home address."
- 08:32 travel-agent proposal `agent-x68cbbd7e6e58691c` (refresh quote, verify rest, do not change promise).
  - 08:42 APPROVED: "Recheck only. Return with capacity and route feasibility before purchase."
  - APPROVED_AWAITING_EXECUTION at the snapshot.

**What went wrong:** sold out, with the driver positioning from Bordeaux and still unbooked.

**Chain effects:** positioning purchase, ferry choice, 2–3 driver nights on a ~22 h road leg (`road_time_to_terminal_hours: 22`), the promise, the private receiver, and the site's per-vehicle release.

**Computed but not recorded anywhere:**
- The 25 Oct sailing still lands about 20 h before the promise ends (26 Oct 15:00 + ~3 h road). The 26 Oct sailing misses the promise.
- The cheaper positioning train leaves today at 21:00, so a purchase decision is due today. Nothing in the record says so.

### CD-420603 — VW Golf, Munich → Lahti. Booked crossing at risk at the gate
**Chain**
- Booking `res-x1082202e8d139d61`: sailing 21 Oct 14:00, cutoff 12:00, arrives 22 Oct 20:00. Promise 23 Oct 10:00–12:00 (`win-xd8ea7b8e35089ee5`).
- 06:58 driver: "The queue before the terminal has barely moved … may close before I reach check-in."
- 07:00 alert `alert-x5259ff7f2e03f0e6` (FERRY_CONNECTION_RISK).
- 07:10 operator asks for ETA. 07:14 internal note: do not cancel or promise another crossing.
- 07:31 driver: "I am still in the queue … have not turned toward another terminal."
- 07:57 travel-agent `agent-x1c721af5508e707a` (refresh capacity, buy_ticket false).
  - 07:59 APPROVED: "Check capacity and driver rest first. Return for a separate booking decision."
  - Awaiting execution.
- 08:43 `travel.amendment_requested` (`evt-x37f77d400ce2de16`): the carrier took a request to move to a later crossing, unconfirmed. Keep the original booking.

**Data tension:** tracking at 08:06 (`track-x3fe486c5847cfc53`, COARSE) shows 1772 km to the delivery point, and only 40 km of progress since 01:55. That cannot be turned into a terminal ETA (`terminal_road_estimates` say so explicitly), and it does not match "queue before the terminal" without more evidence. The driver's text and the tracking disagree, and neither is a gate record.

**What is open:** whether the 12:00 cutoff is made. The fallback costs probably a day against a promise with about 14 h of slack.

### CD-420194 — Volvo V60, Lyon → Vantaa. Missed check-in, rebooked, delivered on time; now an invoice query
**Chain**
- 16 Oct 13:12 gate `terminal-xd5e9a1b6bcdea9e3` CHECK_IN_REJECTED: "presented after the booked check-in cutoff". `res-xa4188748fa8fcceb` becomes MISSED_CHECK_IN.
- 14:00 travel-agent `agent-x3151927d69c76a10` proposes `use_first_available: true`.
  - 15:00 EDITED by ops-travel: "Do not select a crossing from an unrefreshed list. Book only the verified replacement."
  - The edit added `require_fresh_capacity_check: true`.
- 15:04 fresh check `travel-x3a693d3d7aebc4da`: "Carrier confirmed vehicle space". 15:12 the operator books `res-x302dbf32e2daa21f` (18 Oct 03:00).
- 20 Oct 11:00 delivered, inside the 09:00–13:00 promise.
- 21 Oct 06:10 customer: which PO reference was on the invoice. 06:12 alert `alert-x5e2a521421e447cb`.
- 08:27 ops-copilot `agent-xf874ddfecf02bb68` (check invoice record, do not tell the customer it was issued).
  - 08:33 APPROVED: "Do not tell the customer an invoice exists until the record is found."

**What went wrong:** a structured gate rejection. The chain was absorbed (the promise was kept) because there was enough slack.

**Review pattern:** the operator corrected "first available from a stale list".

### CD-420342 — Ferrari Roma, Cologne → Helsinki. Gate manifest mismatch, fixed in 16 minutes
- 15 Oct 10:48 driver: "twenty minutes to the vehicle gate".
- 11:36 gate CHECK_IN_REJECTED (`terminal-xbe749754c1774c48`): "registration did not match … carrier manifest".
- 11:41 ops-travel tells the driver they are correcting it with the carrier.
- 11:52 gate CHECK_IN_ACCEPTED (`terminal-x63a4a843f76c35d5`). 12:04 "not a boarding confirmation".
- 17 Oct 10:00 driver holds the car over the weekend: "receiving contact is unavailable … keys with me … no parking location sent".
- Delivered 19 Oct 09:00 within the promise.
- Expenses: train positioning REJECTED (`expense-xae4854e8e1dada42`); bus SUBMITTED with receipt MISSING.

**Pattern:** a structured trigger with a known fix (correct the manifest), then a custody hold.

### CD-420020 — Porsche 911, Gothenburg → Espoo. Tracking gap during the ferry; "boarding confirmed" was overclaimed
- 17 Oct 15:00 alert `alert-xd8643c3a05d3794c` (FERRY_TRACKING_GAP_CONTEXT), based on inferred `track-xe954f27b4880df1a`.
- 18 Oct 16:00 post-ferry app sync `track-x0fe69bf9925c4660`.
- 16:04 monitor-agent `agent-x40ab609877909161` proposes resolving with `mark_boarding_confirmed: true`. Its own rationale says the position "does not confirm boarding".
- 16:10 EDITED by ops-shift: "Resolve only the connectivity gap. Keep boarding unconfirmed." The executed effect `evt-x911e79b81b1736d6` was by an operator.
- 19 Oct 11:00 delivered.
- 20 Oct 06:00 customer asks for the handover file. Reply: the CMR covers collection only; delivery photos are unreviewed. The conversation is OPEN, owned by ops-evidence, next check 21 Oct 13:00.
- `proof-xfcd76b434eb14c61` (pickup) and `proof-xa7d26e6427a010ab` (delivery) are both still SUBMITTED.

### CD-420089 — BMW M4, Espoo → Turku. Executed positioning booking built on the wrong prior duty
- 21 Oct 07:46 travel-agent `agent-x44051005c0c18aaf`: book Lahti→Espoo train `travel-x9f257e384701f386` (26 Oct 05:00, EUR 44.90). Rationale: it "fits … if the previous duty releases on its current ETA".
- 08:00 APPROVED by ops-travel: "Book the train, then still verify completion of the prior duty and station arrival." 08:05 booked `res-xac6651462ee0355a`.
- 08:15 ops-shift note: check the station-to-branch transfer.
- The assignment's `positioning` record names CD-420576 (ends Lahti 21 Oct) as the previous duty.

**Missed by everyone in the record:**
- drv-055 also holds CD-420719 (`asg-xb8ad81e2d1e793a9`): Oulu 22 Oct 08:00–10:00 → Helsinki promise 23 Oct 10:00–12:00.
- So the driver's real last duty before 089 ends in Helsinki on 23 Oct, not Lahti on 21 Oct.
- The Lahti→Espoo train assumes a start city the driver will probably not be in.

**Related:**
- Inbox `inbox-x41075bca6588a2d7` (PENDING_MATCH, candidates 089 and 719). Driver 06:48: "I got a text about my next pickup at 10, but the app shows a later start. Which one do I follow?"
- The operator asked for the job reference and a screenshot.
- 089's slot is 10:00–13:00 local on 26 Oct; 719's is 11:00–13:00 local on 22 Oct. Both are computable from the records.
- Also on 089: a site question on 20 Oct ("Does a delivery target mean the vehicle has left?" — "No").
- Driver expense claims: bus with receipt MISSING; taxi needing authorization.

### CD-420075 — EV, Frankfurt → Turku. Latent: ferry cutoff today with no confirmation since last night
- Booked `res-xb44d75df6f852ca3`: West Baltic, 21 Oct 14:00, cutoff 12:00.
- 20 Oct 19:00 driver: stopping for rest, "have not reached check-in". 19:12 operator: update before continuing.
- No later message by the 09:00 snapshot, 3 h before the cutoff. No alert.
- Tracking `track-x9d8ce2299c7484b3` 08:11: 1773 km to Turku. Coarse fixes after 19:53 kept decreasing overnight (1923 → 1797 km), which does not obviously match "stopping for rest". This is not reconciled.
- A charging expense was REJECTED (`expense-xa815f05ebba94942`, "cannot be matched to the assigned vehicle leg").

### CD-420360 — market import. Latent, quiet: sold-out sailing with the promise still safe
- 21 Oct 07:00: 27 Oct 17:00 sailing SOLD_OUT (`travel-xc573423f78772827`). Next quote 29 Oct 05:00, arriving 30 Oct 10:00 (EUR 675).
- Promise ends 2 Nov 14:00, about 73 h of slack. No offer taken yet, no alert.

### CD-420311 — Munich → Turku, booked. Latent: positioning not evidenced, and a release-city inconsistency
- drv-232's previous duty is CD-420455's trade-in return (`asg-x368b4547f26c85f5`), which ends at Auvelloria Lahti (`point-x63a40befa701c1a9`) on 23 Oct.
- The `positioning` record on `asg-x7fd46f1afa73cdef` says `planned_release_city: Helsinki` and POSITIONING_NOT_EVIDENCED.
- The only quotes start from the driver's home city, Pori (`travel-xf2bdef20786d3ba8`, `travel-xd67df51ec95450b8`). The second arrives after the slot opens.
- Pickup 26 Oct 10:00–12:00. No alert or work item.

### CD-420123 and CD-420442 — positioning bought, with reassuring info replies
- 123: train + flight + train + hotel booked 20 Oct.
  - Customer asked whether a prepared CMR counts as signed. "No." `support.no_change_recorded` (`evt-x648b55ab1a675934`).
- 442: flight Helsinki→Stockholm + hotel + ferry 22 Oct 17:00 booked.
  - The promise window was selected by OPS with `customer_approval_recorded: false` (`evt-x419d710d770ffcac`).
  - Customer ETA question answered with the window, "not a live ETA".

---

## B. Driver availability, positioning, missed slots

### CD-420449 — Toyota Corolla, Hamburg → Odense. Driver may be ill; paid positioning leaves today
**Chain**
- 20 Oct 08:20 Bahn books positioning for drv-434 (home Aalborg) (all BOOKED):
  - train Aalborg→Copenhagen 21 Oct 10:25 (`res-x0320cdf029cd4c96`, EUR 76.06)
  - flight Copenhagen→Hamburg 16:45 (`res-xe71985ace48030a6`, EUR 176.93)
  - hotel Hamburg 21→22 Oct (`res-xbdba16c24ca9005e`, EUR 115.80)
- 10:33 driver: "I am unwell … may not be fit … can confirm by early evening."
- 10:35 alert `alert-xd6b460da263340c0`. 10:36 system work item `work-x886e3f205f976c90` (BACKUP_DRIVER_DECISION), due 11:21, still OPEN at the snapshot (21.6 h overdue).
- 11:06 driver: "I will update you before 18:00. Do not cancel the gig yet." No update arrived by 18:00.
- 21 Oct 02:37 room post. 07:54 ops-copilot `agent-xf4800bb1b907cf89` (look for backup, do not cancel current).
- 08:00 APPROVED: "Prepare a named backup and recheck the driver's fitness at the agreed check-in. Do not represent the replacement as booked."
- 08:03 driver: "still unsure". 08:10 ops-shift note: "check any paid positioning travel before deciding what to change".

**Chain effects:** the decision has a hard clock. The first paid leg departs at 10:25, 85 min after the snapshot. The approved proposal does not mention that clock.

### CD-420399 — Ferrari 296 GTB, Leipzig → Cologne. Driver cannot reach the next pickup after the prior duty
- drv-331 is on CD-420326 (Cologne→Hamburg, ETA 21 Oct 13:24).
- Next pickup: Leipzig 22 Oct 09:00–10:00 (`win-x5e711ebe9e66f3ed`). Promise: 23 Oct 11:00–13:00 (SYSTEM source).
- 08:14 driver (`msg-x3bdbe64dcd0bd46e`): needs rest after Hamburg; "first time to travel is after 12:00 tomorrow local"; no travel booking; "check a replacement or ask the customer".
- 08:21 internal note. 08:25 alert `alert-x6ef8fbd869be9ac5` (POSITIONING_AT_RISK).
- 08:27 ops-copilot `agent-xb914e837479457b7`: check replacements, keep the assignment, ask the customer if the window changes. PENDING_REVIEW.
- 08:32 ops-travel note. 08:54 ops-dispatch: prepare a buyer update "without naming the driver's earlier customer's trip".
- 08:56 work item `work-x4cb7fd705c117b64`. 08:58 alert acknowledged.

**Nuance:**
- The structured `positioning` projection (prior ETA 13:24 + 90 min buffer) would have said "feasible". Only the driver's text (rest) makes it infeasible.
- Computable option: Leipzig site-043 is open until 17:00 local (15:00Z). Driver free at 10:00Z; Hamburg→Leipzig is roughly 3–4 h. So an afternoon pickup on 22 Oct still reaches Cologne (475 km) for the 23 Oct promise. That needs site agreement and buyer approval of the pickup change.

### CD-420992 / CD-420735 / CD-420579 — one driver, three duties; release unrecorded
- drv-260 is on CD-420735 (Düsseldorf→Frankfurt, promise 21 Oct 11:00–13:00). The assignment has no tracking observations at all.
- Next: CD-420992 pickup in Frankfurt 22 Oct 07:00–10:00. Then CD-420579 pickup in Cologne 26 Oct.
- 08:22 ops-dispatch → driver: confirm where today's handover ends and when the next keys can be taken.
- 08:37 internal: "proximity is a route plan, not a verified driver position".
- 08:49: no reply yet. Work item `work-x15f6ebbff418e44c` (DRIVER_START_CHECK), due 09:20.

### CD-420702 — Toyota Corolla relay via a staffed yard. Second driver misses the yard release; promise unachievable
- Leg 1 completed: drv-00563 checked into Merivanto Transfer Espoo yard on 20 Oct 17:30, keys received (`evt-xd23ce7298d05547a`).
- Leg 2: drv-00564's `asg-x1b7b1c7c1a46a1e9`, yard slot 21 Oct 06:00–08:00 (09:00–11:00 local). The assignment is never started.
- 07:47 driver: "I cannot get there before its 11:00 local staffed release cutoff." That is 13 minutes before the slot ends.
- 08:11 site-071: the release window ended, the car and keys are still on the yard register.
- 08:15 assignment CANCELLED (NO_PAYOUT). 08:16 offer withdrawn.
- 08:19 site offers 22 Oct 09:00–11:00 local. 08:23 new slot selected (`evt-xe03ba1c8477204ca`, `customer_delivery_promise_changed: false`).
- 08:25 new offer at EUR 125, up from 95 (`offer-xdc59e6de0f7fb4a9`). 08:26 YARD_RELEASE_PHOTOS required.
- 08:28 alert `alert-x9cd05869f6be7f09` (DELIVERY_PROMISE_UNACHIEVABLE, computed from the window).
- 08:32 operator → customer: "Your current delivery window cannot be met. Please confirm a new acceptable delivery target."

**Structured precursor:** at 06:00 the slot had opened with the assignment still not started. That is detectable 1 h 47 min before the driver's message.

---

## C. On the road

### CD-420322 — Bentley Continental GT, Munich → Hamburg. Red warning light (the brief's example, in data)
**Chain**
- 20 Oct 08:30 pickup. Promise 21 Oct 10:00–14:00 (`win-x7c8722a53360a2ad`).
- 21 Oct 05:00 tracking STALE (`track-x4ec652df41547497`). 05:16 alert `alert-x105238e92e7f3ba6` (TRACKING_GAP), still OPEN, never linked to the later incident.
- 08:04 driver: "I have stopped … A red warning came on and the car felt different when accelerating."
- 08:07 alert `alert-x539dcfdd5a51d9ab` (SAFETY_STOP, critical), and the operator opens `incident-x589908b2ed24936a`:
  - `location_verified: false`
  - `warning_photo_status: REQUESTED`
  - `recovery_decision: PENDING_CUSTOMER`
- 08:13 operator → driver: "Are you and the vehicle in a safe place? Please do not drive it further."
- 08:22 driver: safe at a service-area car park, engine off, can send a photo, has not diagnosed.
- 08:23 monitor-agent `agent-x95169653143f1607` proposes "Try restarting the vehicle once and send a location", with `authorize_restart: true`. Its own summary says "without giving mechanical advice".
- 08:31 internal: human owner required; call the customer; no recovery booking or promise yet.
- 08:35 EDITED: "Remove restart advice." 08:37 the edited message is sent by the agent (`evt-xfa790563b92c0eb6`).
- 08:35 work item `work-xbfed2fad876cbd13`: "Do not authorize driving from the warning report alone."
- 08:40 customer: "keep the vehicle stopped. I will ask our service contact whether it needs roadside assistance or collection."
- 08:49 operator: journey paused; estimate after recovery.
- 08:58 driver: "Please tell me who is collecting the car before anyone moves it."

**Open:**
- Owner's recovery choice, the location pin, and the photo (`doc-condition-request-01` is REQUESTED with 0 files).
- Today's promise is effectively lost.
- Driver drv-319 has no further assignment, so no knock-on job, but waiting time and return travel apply.
- A fuel claim was REJECTED the day before (`expense-x414f2a0bc9a24012`).

### CD-420004, CD-420335 — overnight custody reports (closed)
- `custody-xd6ae880019d6f854` / `msg-x62ba2946bcc349a5` and `custody-x1e0092e3cdbf9e64` / `msg-xd42aea3e0a2aba9c`.
- Both drivers said "locked, keys with me". The operator asked for location and an ETA on resume. Status: UNVERIFIED_DRIVER_REPORT, location NOT_PROVIDED.
- Both were delivered the next day. 004 has a parking claim awaiting authorization.

### CD-420324 — EV/import Malmö → Espoo. Hotel offers to keep the key
- 20 Oct 18:00 driver asks if the hotel can keep the key. 18:12 operator: keep the key; third-party custody needs the owner's approval.
- Ferry cutoff today at 13:00 (`res-x0c658361818f4c47`). No driver message since 18:12 yesterday.

### CD-420384 / CD-420413 — two-car bundle; driver asks to take the second car's keys a day early
- 15 Oct 21:32: 384's plan replaced ("pickup window moved", `evt-xa6788ea68ac800d0`). The solo offer was withdrawn and reposted.
- 21 Oct 08:00: both solo offers withdrawn. 08:10 bundle `offer-x5f58c5031df26104`:
  - lines EUR 70 + 135
  - `execution_assumptions`: overnight driver position unknown; second-leg custody "NEEDS_DRIVER_AND_SITE_PLAN"
- 08:35 drv-002 accepts both legs.
- 08:44 driver: collect the second keys Monday and keep the car overnight?
- 08:51 operator: no overnight custody agreed. 08:57 driver: will only collect the first car; who confirms Tuesday's keys?
- Custody asset `custody-x96b53a7c6cc48555`: RELEASE_CONTACT_UNKNOWN, follow-up due 27 Oct 06:00.

---

## D. Pickup readiness, release, access

### CD-420593 — BMW M4 at Velantora Helsinki (site-001). Empty pickup
- 21 Oct 07:00 `pickup.attempted` (`visit-x445b98caff86871d`, VEHICLE_NOT_FOUND, not site-verified).
- 07:03 driver: reception cannot find the car in the handover list.
- 07:12 incident `incident-xa3273de530f17fd8`. 07:14 alert.
- 07:21 site: "not in our release queue. I can see a similar stock reference, but I cannot hand it over."
- 07:30 internal: a similar stock reference is not identity; ask the customer which site holds the VIN.
- 07:39 customer: "please do not substitute a different car". 07:48 operator: collection paused.
- 07:57 driver: "I can wait another 30 minutes. After that I need a new plan for my travel back."
- 08:01 ops-copilot `agent-x6ad46f8e74398f5e` (contact site and customer, hold collection, do not mark picked up). PENDING_REVIEW for 59 min at the snapshot, past the driver's 30-minute limit.
- 08:28 alert acknowledged.

**Open:** driver release and return-travel cost. The promise is 26 Oct, so there is plenty of slack.

### CD-420201 — Ferrari 296 GTB at Vellendor Munich. Pickup pulled forward on the customer's word; car not found; order cancelled
- 21 Oct 05:40 customer: collect this morning instead of next week; "The source branch told us the car is ready now."
- 05:55 operator → driver: can you do both? "Do not take the keys until the exact vehicle is identified."
- 06:05 driver yes. 06:08 customer confirms.
- 06:10/06:11 pickup and delivery windows revised (`evt-xe1e81a312504856d`, `evt-xa7dd0aca69ef184e`). No site confirmation was sought.
- 07:08 driver arrives. 07:10 "Staff cannot find the car." 07:34 site: cannot locate it (`evt-xc23c680bbdeb04c0`, site-verified).
- 07:43 operator asks the customer: wait or cancel? 08:25 customer: cancel.
- 08:31 cancelled. Assignment cancelled PAYOUT_DUE. Plan cancelled.
- 08:48 driver: EUR 12 parking. `note-x31c62345a7b168ce`: keep the cost review open.

**Root cause in the chain:** "customer says the site says ready" was treated as readiness. The cheap check (ask the site) was skipped before the slot was moved.

### CD-420347 — Mercedes EQE, Hamburg → Aarhus. Showroom vs yard conflict while the driver offer is live
- 06:25 customer: the handover sheet names a yard, the booking says showroom. 06:26 alert.
- 06:30 operator → site: verify where the car and keys are, order-specific.
- 06:42 site: cannot confirm; stock control will call back by 14:00 local; "do not send a driver". `endpoint.verification_pending`.
- 06:50 customer told. 06:53 follow-up scheduled for 12:00Z.
- 06:58 work item `work-xe272ce380e9dd375` (MARKET_VISIBILITY_CHECK, due 09:10): decide whether to withdraw the live offer `offer-xd48500b8f7b43193` (EUR 456, PUBLISHED). Not decided at the snapshot.

**Note:** fast and correct site check. The remaining risk is a driver booking the live offer.

### CD-420516 — Volvo V60 at Velantora Helsinki (site-001). Key desk unclear for two days
- 19 Oct 10:44 customer: the pickup contact says reception has the keys, but the note says side gate. `note-x7b4b75e5977108cd` (customer, 18 Oct): "Use the side gate."
- 10:45 `endpoint.access_reopened`. 10:46 alert. 11:00 operator: "I will reconcile those instructions with the site before the offer goes live."
- 21 Oct 07:54 customer chases. 08:05 "Not yet."
- 08:24: the first recorded site contact (`conv-x53b0830c80a6336b`). Site: reception has no keys, the side gate is entry only, the stock screen lists a warehouse transfer with no named releaser.
- 08:27 alert assessed (KEEP_ACCESS_UNCONFIRMED). 08:29 work item `work-x2174da059fcd89e8`.

**Delay:** about 45.6 h from the customer's question to the first site contact. That contact was a free action.

**Pattern:** the same site as CD-420593's empty pickup. Both involve site-001's stock records.

### CD-420458 — Ferrari Roma at Calverona Hamburg (site-042). Missing signed release, then a seller hold
- 19 Oct 10:59 customer (German): the car is at the branch, the seller has not returned the signed release. 11:01 alert. 11:04 collection unconfirmed.
- 11:32 customer: maybe this afternoon.
- 21 Oct 07:57 customer follow-up.
- 08:38 first site call: "seller has withdrawn permission … invoice remains unsettled … Do not send a driver even if the old collection note is still visible."
- 08:42 alert assessed BLOCK_DISPATCH_SELLER_HOLD. 08:44 work item `work-x034712fe38184350`.
- 08:51 operator explains the hold to the customer.
- `doc-0262` RELEASE_AUTHORITY is MISSING. Intake stage, no offer.

**Delay:** about 45.5 h from the customer's message to the first site call. The site call surfaced a new blocker (the seller hold).

### CD-420015 — Espoo pickup. Release contact unconfirmed; first reply 25 h late
- 19 Oct 10:00 customer (WhatsApp): the branch has not confirmed the named contact.
- 20 Oct 11:05 first reply: "Sorry this took until today."
- 21 Oct 07:52 customer chases. 08:21 readiness takes over "and will call the branch".
- Pickup 22 Oct 08:00–10:00.

### CD-420656 — Marseille → Lyon. Car will not be released on time (workshop part)
- 21 Oct 07:34 customer (French): the car will not be released on the planned date; can pickup move two days?
- 07:42 operator: the driver is assigned; will check availability, the site slot and linked bookings.
- 07:50 customer: the workshop is waiting for a part, no firm date.
- 07:58 operator: flag the risk but keep the confirmed slot. 08:00 internal: keep the slot; planning searches for replacement capacity.
- Driver drv-449 comes off CD-420666 (Lyon, 21 Oct). Positioning to Marseille is not evidenced. Pickup 23 Oct 07:00–10:00.

### CD-420689 / CD-420941 — site asks for per-vehicle releases across orders
- 689: site-065 Marseille; see CD-420154. Live offer, 30 recorded views and 5 passes on the background sample. Work item `work-x7956a83380dc9cba`.
- 941: site-020 Tampere (`msg-x87b3e65c2d8124f9`): "We received the returned trade-in for CD-420177 yesterday … send the vehicle references and key contacts separately". Work item `work-xf5532facef1d865b`.

**Record contradiction:**
- CD-420177's trade-in was collected from site-020 (`evt-x5abd723495f7e09e`, point-x3199281829bd7d2e).
- It was delivered to site-028 Calverin Espoo (`evt-x4e26861492d23d27`). site-028 confirmed receipt at 13:50 local (`msg-xf77d14b4398ac2b0`).
- So site-020's "received the returned trade-in" contradicts the records. The operator's internal note (08:43) repeats it ("has a recorded delivery to this site"). The conclusion (no release authority) is still correct.

### CD-420009, CD-420010, CD-420023 — intake missing inputs (deterministic detection)
- 21 Oct 08:09–08:14 `order.readiness_assessed` by `planning_monitor`, then system work items:
  - 009 IDENTITY_INPUT_REQUIRED: no VIN or plate.
  - 010 PICKUP_CONTACT_HANDLE_REQUIRED.
  - 023 PICKUP_ACCESS_CHECK_REQUIRED: pickup is "Berlin" with no street.
- 009 also has a customer thread from 20 Oct asking to "reserve a collector". Reply: send the identity first.
- The structured detector fired 25 h after that customer message.
- 023's pickup endpoint contact handle is `site-038@example.test` on an unmanaged address. A raw address must not inherit a site's rules (README).

### CD-420222 — intake; inbox thread linked
- `inbox-x0c469506e2c5b685` (CONFIRMED_SINGLE). Customer asks for the handover document. Reply: "not ready yet; we will not describe it as signed". Waiting on DOCUMENT_READY.

---

## E. Delivery, receiver, promise

### CD-420437 — Bentley Flying Spur, Berlin → Munich third party. Access hours changed, receiver authority unknown
- 20 Oct 09:44 customer: the receiver is available "only until early afternoon". 09:46 alert. 10:05 internal: treat as a proposed constraint.
- 10:17 customer: "We can discuss another slot".
- 21 Oct 07:59 customer: "still cannot take … after early afternoon. Is the driver on course?"
- 08:42 correction: access until 18:00 local, "I still cannot confirm who is authorized to inspect and sign".
- 08:50 operator: will not hand over keys without an authorized receiver. 08:52 work item `work-x6c27e55269d19e01`, due 08:58.
- Tracking ETA 13:58 (`track-x0e9acf00fc4d6673`, COARSE). Promise ends 14:00. The 18:00 local (16:00Z) access fits.

### CD-420014 — S-Class, receiver change resolved by direct check
- Claims on `ep-xb9a44b52b0a31e55`:
  - intake names Wilfred (`eclaim-x0b55f3b1d2f0c1b3`)
  - Wilfred says a receiving lead may cover, but the buyer must authorize (`msg-xb09148d229b5d279`, 18 Oct)
- 21 Oct 06:19 operator asks the customer. 06:26 customer authorizes Lena. 06:31 Lena confirms.
- 06:40: three claims resolved (REJECTED_BY_DIRECT_CHECK / SUPERSEDED / VERIFIED), `endpoint.instruction_verified`.
- The handoff contact's 18 Oct message waited about 69 h for the operator's question to the customer. Delivery is 26 Oct, so there was slack.

### CD-420675 — late delivery handled correctly (closed)
- 16 Oct 09:00 driver (French): will miss the slot, needs a new handover time.
- 09:09 operator → customer: approve a later slot, and confirm the receiver separately.
- 09:38 customer approves (`delivery.promise_revised`, `customer_approved: true`). 09:45 driver told.
- 12:00 delivered within the revised window. `delivery.late_outcome_recorded`: both promises retained.

### CD-420702 — see B. Promise revision is pending the customer.

---

## F. Evidence, documents, condition

### CD-420071 — Audi Q8 e-tron. Pickup photos show another car
- 20 Oct 09:52 photos submitted. 10:13 REJECTED: "Two files show another registration" (`proof-x0af29b33dadf634a`). 10:15 the driver is asked to retake. 10:18 alert.
- 12:41 site: checked the VIN against the release list; the driver photographed the neighbouring car first; no condition photos from the site.
- 12:53 driver: already away; new photos "would not show its pickup condition".
- 13:10 alert acknowledged: proof stays REJECTED. 13:13 work item `work-xbe01b6d42115ad62`: safe-stop photos as current condition only, "do not backdate".

### CD-420612 — delivery photos show only the forecourt
- 16 Oct 07:24 `proof-x1a6c51d3a362f8e8` REJECTED. 07:26 driver asked to add photos.
- The driver conversation has had no reply for 5 days.
- Fuel and parking expenses were both REJECTED for missing trip linkage.

### CD-420164 — signed handover missing (found 7 days late, then overdue)
- 12 Oct 10:00 delivered to site-035, which `requires_signed_release: true`. `doc-0264` SIGNED_HANDOVER is MISSING. Delivery photos SUBMITTED and never reviewed.
- 19 Oct 09:46 customer asks for the signed proof. 09:48 alert. 09:49 system work item `work-xaccd8ed37a28afc8`, due 11:39, still OPEN at the snapshot (45.4 h overdue).
- 10:19 customer: "accounting specifically needs the signed handover record."
- 21 Oct 08:08 customer asks again. 08:19 "still missing".

**Structured precursor:** the site rule plus the missing document were knowable at delivery on 12 Oct.

### CD-420055 — Bentley delivered to a third party; condition claim; attribution proposal rejected
- 16 Oct 11:30 delivered. Pickup photos `proof-x68d75425bfd74ca1` are still SUBMITTED (never reviewed).
- 21 Oct 07:42 customer: the receiving contact found a mark. 07:44 alert.
- 07:58 operator asks for a photo and when it was first noticed. 08:09 customer: two photos of the left rear mark; "cannot confirm when they first noticed it".
- 08:17 ops-copilot `agent-xaa0af5ec9f775363` proposes `attribution: DRIVER_CAUSED`. 08:20 REJECTED by ops-shift: "Photos establish a reported condition, not when or by whom it happened."
- 08:28 ops-copilot `agent-x67ebc5bd109d4ac1`: compare evidence, no liability. PENDING_REVIEW.
- The trade-in leg (drv-037) is moving at the same time; its return slot is requested, not confirmed.

### CD-420455 — Audi RS 6, condition claim (human-led)
- 21 Oct 07:09 customer: rear-panel mark; was it there at collection?
- 07:21 operator: will compare; cannot assign responsibility.
- 07:32 incident `incident-x9aeabfc672bd296d`. 07:38 driver asked. 07:54 driver: no concern was raised, cannot tell from memory.
- 07:55 alert. This is an alert raised after the human had already acted.
- 08:10 internal: preserve photos, no attribution or compensation. 08:24 customer: wait for the branch's close photo.
- Pickup photos `proof-x59026d43291be404` are still SUBMITTED, never reviewed. The attachments include one pickup and one delivery view.

### CD-420020, CD-420123, CD-420222 — see above. These are document-state questions answered without overclaiming.

---

## G. Commercial, cancellation, money

### CD-420419 — sale withdrawn, clean cancellation
- 07:12 customer: stop tomorrow's collection. 07:16 operator asks for confirmation. 07:24 confirmed.
- 07:35 order cancelled. 07:36 assignment cancelled NO_PAYOUT. 07:37 plan cancelled. 07:39 driver told.
- 07:44 driver: no cost. 08:03 `order.cancellation_cost_reviewed`.

### CD-420404 — Tesla Model 3. Offer unfilled; one driver asks for a higher fee
- 17 Oct 18:19 plan replaced ("pickup window moved"). The EUR 101 offer was withdrawn and EUR 161 posted.
- 21 Oct 04:47 drv-021: "I could take CD-420404 if the fee were EUR 190."
- 05:00 booking cutoff passed. 05:01 withdrawn. 05:28 `market.fee_decided`: EUR 179. 05:40 reposted. 05:49 driver told.
- 08:58 `market.offer_assessed`: the fee stands; "the driver's request is neither an acceptance nor evidence that every driver requires EUR 190".
- Reach checks: 12 screened, 7 feed-accessible.

### CD-420326, CD-420291, CD-420201 — expense and payout questions
- 326: corrected charging claim (`expense-x02fd61edb20f7f13` SUPERSEDED by the new one) plus a parking claim. The driver asks whether both are paid; expenses takes both.
- 291 (inbox `inbox-xa3da181b78fb1235`, German): parking EUR 35.50 not reimbursed. The approved expense is found; approval is not payout; waiting on payout reconciliation.
- 201: EUR 12 parking after cancellation.

### CD-420194 — invoice reference query. See A.

---

## H. Information requests (closed, no exception)
- CD-420111: "reached the receiving address?" → "marked delivered".
- CD-420118: "tell the buyer a driver is confirmed?" → "No driver is booked".
- CD-420537: same question → "Yes … pickup record, not a delivery confirmation."
- CD-420585: pickup time selected? → full slot, "not a confirmed arrival minute".
- CD-420240: ETA → window, "not a live ETA".
- CD-420442: ETA → window.
- CD-420806: time zone → local range, `support.answer_recorded`.
- CD-421010 (Finnish): "already the driver's responsibility?" → "Not yet … not published to drivers".
- CD-420177: trade-in return moved earlier with site-028's written agreement (`trade_in.return_window_revised`, `evt-xb1d723e7e6107ddb`), executed 20 Oct.

These are answerable from records with one sentence each. They need no human, only claim discipline: window ≠ ETA, booked ≠ picked up.

---

## Expense-review signals (11 orders with nothing else, plus some covered above)
| Order | Record | State | Note |
|---|---|---|---|
| CD-420338 | fuel expense | REJECTED | unmatched to leg |
| CD-420666 | charging expense | REJECTED | unmatched |
| CD-420694 | fuel REJECTED, parking SUBMITTED | — | — |
| CD-420145, 452, 710, 806, 917, 958 | fuel SUBMITTED | — | routine review |
| CD-420366, 619 | parking SUBMITTED | — | routine review |
| CD-420240, 725 | charging SUBMITTED | — | — |
| CD-420111, 675 | parking/fuel SUBMITTED | — | — |

---

## Cross-case facts used later

**1. Proposals.** 14 on 11 orders (`proposals.py`):
- 3 EDITED (020, 194 rebook, 322) and 1 REJECTED (055 attribution).
- 6 APPROVED, each with a constraining note: 089, 154, 194 billing, 299 book, 449, 603.
- 4 PENDING: 055 compare, 299 verify, 399, 593.
- Executed: 3 by an operator (020, 089, 194) and 1 by an agent (322 message).

**2. Corrections target assertions, not routes.**
- All four corrections removed a payload field that claimed more than the evidence or the agent's authority allowed: `mark_boarding_confirmed`, `use_first_available`, `attribution: DRIVER_CAUSED`, `authorize_restart`.
- In 020 and 322, the agent's own rationale or summary contradicts its payload.

**3. Alert sources.** 15 of 19 alerts are text-derived (14 conversation-linked, 1 driver report). 4 are structured: 2 tracking gaps, 1 proof rejection, 1 window calculation.
- Caveat: in CD-420154 the linked conversation entry was an operator's internal note about a SOLD_OUT quote, so its root cause is structured.
- The same holds for CD-420299, where the incident was opened at 07:00, the minute of the capacity check, before the driver's 07:20 message.

**4. Operator exception actions.** 28 in total (incident/work item/cancel/plan replace/window revise/rebook/alert ack or assess, actor = operator):
- 24 follow an external message within 45 min (median 9.5 min, range 2–44).
- 4 do not: 194 rebook after a gate scan; 299 incident after a capacity check; 384 and 404 plan replacements.
- 3 more work items were opened by the deterministic readiness monitor (009/010/023).

**5. Missed structured precursors:**
- 322: tracking gap 2 h 48 min earlier.
- 702: slot open, assignment not started, 1 h 47 min earlier.
- 164: signed handover missing since delivery, 7 days earlier.
- 089: driver-chain conflict, never caught.
- 075: ferry cutoff in 3 h with no driver confirmation.
- 311: positioning not evidenced.

**6. Slow cheap actions:**
- First contact with the site took about 45 h on 516 and 458, and about 46 h on 015.
- 15 waited 25 h for a first reply. 449 and 164 work items are 21.6 h and 45.4 h overdue.
