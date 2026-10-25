# Failure-mode taxonomy

Part 1 groups what the data shows (observed, with case references). Part 2 adds plausible modes the data does not contain, each marked **SYNTHETIC** with a one-line rationale. For every mode, "chain" means the downstream work it starts.

Detection source:
- **Text**: the first signal is a message from a driver, customer or site.
- **Structured**: the first signal is a record (gate scan, quote status, tracking, window maths, readiness monitor).
- **Latent**: the data shows the risk, but nobody has acted on it at the snapshot.

## Part 1: Observed trigger types

| # | Trigger type | Orders | First signal | Downstream chain |
|---|---|---|---|---|
| O1 | **Crossing capacity**: sold out before a booking exists | 299, 154; latent 360 | Structured (quote `SOLD_OUT` at 07:00), surfaced via driver text in 299 | Next sailing (fresh capacity check), then a driver night near the terminal (hotel), then a shifted arrival. Early arrival means car custody until the promise; late arrival means a promise change needing customer approval. Then driver return travel and the receiver check. The quoted later sailing still met the promise in all three orders (slack 42 h, 20 h, 73 h). |
| O2 | **Crossing at risk**: booked, may miss the cutoff | 603; latent 075, 324, 439 (cutoffs today, no fresh driver word) | Text (603); latent structured (cutoff in less than 6 h) | Ask the driver for a gate ETA. Keep the booking. Ask the carrier about rollover terms. Prepare a fallback sailing, its promise impact and a hotel. Do not tell the driver to turn away. |
| O3 | **Gate exception**: check-in rejected | 194 (after cutoff), 342 (manifest mismatch) | Structured (`ferry_terminal_events`) | 194: rebook only a freshly verified sailing, then recompute the promise (it held). 342: correct the manifest with the carrier in minutes, then re-scan. A different fix from the same trigger. |
| O4 | **Booking outcome unknown**: provider timeout | 299 (`agent-x4ac988b20000595f` FAILED) | Structured (execution error) | Reconcile with the provider before any retry (double-booking risk). Keep the promise. Keep the incident open. |
| O5 | **Driver cannot make the next pickup**: positioning or chain | 399 (rest, text); 089 (chain conflict via 719, latent); 311, 719 (positioning not evidenced, latent); 992 (prior release unrecorded) | Mostly text (399). The rest is structured but unnoticed. | Options: a replacement driver, a pickup slot move (site and customer), or paid positioning. Recompute the promise. Handle the driver's already-paid travel. Do not reveal another customer's trip (399 note). |
| O6 | **Driver unavailable**: illness | 449 | Text | A backup is prepared but not booked. The hard deadline is the first paid positioning departure (10:25 on 21 Oct). Then refund or change the bookings, and keep the current assignment until replaced. |
| O7 | **Driver missed slot / leg not started** | 702 (relay yard) | Text, though the structured "slot open, not started" signal was available 1 h 47 min earlier | Cancel the assignment (payout decision). Get a new slot from the site. Repost the offer (fee decision). Revise the promise with the customer. Migrate proof requirements. |
| O8 | **Vehicle warning / breakdown** | 322 | Text (a tracking gap 2 h 48 min earlier was unlinked) | Safety, location and photo. The owner decides roadside or tow. The promise is lost. Driver waiting time and return travel. Custody of car and keys. Later, a replan of driver and promise. |
| O9 | **Signal gap**: tracking stale or missing | 322, 020; latent 735, 1013 (no tracking), 806 (stale 7 h) | Structured | Usually nothing. Ask the driver. Never treat an ETA as a location. Resolve the gap without upgrading any other claim (020). |
| O10 | **Vehicle not at pickup** | 593, 201 | Structured (`pickup.attempted`, `site_visit`) plus driver text within minutes | Hold. Verify VIN and holding site (site, then customer). Driver wait clock, then release, payout and return travel. Relocate (needs customer authority) or cancel. |
| O11 | **Release blocked**: access, key holder, release authority, seller hold | 516, 347, 458, 015; 689/941 (site wants per-vehicle releases) | Text (customer or site) | Freeze dispatch. Withdraw or hold the live offer (347). The site's stock control and the customer clear the block. The slot holds or moves. The assigned driver's chain is affected. |
| O12 | **Car not ready**: release date slips | 656 | Text (customer) | Keep the confirmed slot (no uncertain replacement date). Flag the risk. Driver chain (comes off 666). Slot move with site, customer and driver. Promise check. |
| O13 | **Intake input missing**: VIN, contact handle, street | 009, 010, 023 | Structured (`order.readiness_assessed`) | Block readiness. Ask the customer (approval needed). No offer. |
| O14 | **Receiver unconfirmed or changed** | 437, 014; also open on 154, 299, 449, 593, 603 (private receivers UNCONFIRMED) | Text | Never hand over without an authorized receiver. Get customer authority. Check access hours against ETA. Instruct the driver to keep the keys. |
| O15 | **Promise breach** | 702, 322 (pending); 675 (resolved) | Structured (702 window maths) or text (675, 322) | Draft a customer message (approval). Record both promises. Brief the driver. Confirm the receiver for the new time. |
| O16 | **Evidence defect** | 071 (wrong car in photos), 612 (forecourt only), 164 (signed handover missing), 020 (handover file) | Structured (proof review) for 071/612; text (customer) for 164/020 | Pickup condition cannot be re-photographed after departure, so take current-condition photos only. Signed document follow-up. Accounting is waiting. Overdue items (164: 45 h). |
| O17 | **Condition claim** | 055, 455 | Text (customer) | Preserve originals. Compare pickup, delivery and customer photos. No attribution or compensation. Pickup photos were never reviewed in either order. A trade-in leg is still moving. |
| O18 | **Custody question** | 004, 335, 342, 324, 384/413 | Text (driver) | Overnight plan. No third-party key custody without the owner. Bundle keys are not released early. |
| O19 | **Cancellation** | 419; 201 (after vehicle-not-found) | Text (customer) | Confirm. Cancel order, assignment and plan. Tell the driver to stop. Payout decision (NO_PAYOUT vs PAYOUT_DUE). Cost review stays open. |
| O20 | **Offer unfilled / fee** | 404 (driver asks EUR 190; ops approves 179); `fee_review` withdrawals on 449, 347, 123, 442 | Text (driver) plus structured (cutoff passed) | Withdraw after the cutoff. Repost at the approved fee. A driver's request is not acceptance. |
| O21 | **Money query**: invoice, expense, payout | 194, 326, 291, 201 | Text | Billing record ≠ order reference. Approval ≠ payout. A superseded claim is not paid twice. |
| O22 | **Information request** | 111, 118, 537, 585, 240, 442, 806, 1010, 123, 222, 089 (site) | Text | None. Window ≠ ETA. Booked ≠ picked up. Prepared CMR ≠ signed. |
| O23 | **Instruction ambiguity** | inbox `inbox-x41075bca6588a2d7` (driver with 089 and 719) | Text | The driver may travel to the wrong pickup or at the wrong time. Answer from the assignments and ask for the reference or screenshot. |

### What the observed taxonomy says
- **Triggers are mostly text, but the chains are mostly structured.**
  - 15 of 19 alerts come from conversations or driver reports. 24 of 28 operator exception actions follow an external message by a median 9.5 min.
  - Once triggered, though, the work is computing over records: windows, quotes vs bookings, the driver's next duty, site hours, cutoffs.
- **Most cases are combinations.**
  - 299 = O1 + O4 + O14. 154 = O1 + O5 + O11 + O14. 399 = O5 + O15 risk. 593 = O10 + driver-release.
  - 702 = O7 + O15. 322 = O8 + O9 + O15. 055 = O17 + O16 (unreviewed pickup photos). 089 = O5 (latent) + O23.
  - A single-path tree would have to multiply branches for every pair.
- **Several latent structured risks have no owner at the snapshot:**
  - 075/324/439: ferry cutoffs today. 089: chain conflict. 311: release-city mismatch, nothing booked.
  - 735/1013: in progress with no tracking. 360: sold out but safe.
  - These are where deterministic monitors earn their keep. Their first action is to ask a driver or look something up, not to page a person.

## Part 2: Synthetic failure modes (not in the data)

All rows below are **SYNTHETIC**. Each rationale says why it belongs in driven cross-border car delivery.

| # | Mode (SYNTHETIC) | Rationale | Downstream chain |
|---|---|---|---|
| S1 | **Driver misses positioning train or flight** | The brief's first example. Data has 9 positioning bookings but no misses. | Next connection (search), then arrival vs pickup slot, then the site's release window (some sites release only in-slot, e.g. site-042, site-071). Slot move needs site and customer. Possibly a hotel. The missed fare and the new fare need a cost decision. |
| S2 | **Carrier cancels or moves a sailing** (weather, technical) | The schema defines `carrier_amendments`; none in the packet. | Every order on that sailing is affected at once (multi-order). Rebooking competes for scarce space. Promise impact per order. Hotels for drivers already at the terminal. Customer messages in bulk. |
| S3 | **Car not ready on arrival** (driver at site, car in workshop) | The brief's second example. Data has only advance notice (656). | Driver wait clock. Site's realistic release time. Wait vs release the driver (payout, travel home). New slot. Promise. The driver's next job is now at risk. |
| S4 | **Plate papers or registration documents missing at pickup** | The schema tracks plate papers; there are no rows. Imports need them. | Hold collection (no paper, no departure). Site or seller to supply. Courier option. Slot move. For imports, possibly a transit-plate route. |
| S5 | **Keys incomplete** (second key or key card missing) | Site rules mention key counts (site-010, site-021). Custody tracks key sets. | Proceed or hold is the customer's decision. Record the key count. Note it on the CMR. Risk of a later claim. |
| S6 | **VIN mismatch at pickup** (car present, VIN differs from order or CMR) | The schema describes superseded CMR templates and `template_vin`. 593/071 show identity risk. | Hard stop. Never take a "similar" car. Seller and customer reconcile. A corrected CMR template. Possibly cancel. |
| S7 | **Seller demands an extra document at the desk** | The brief's third example. | Hold. Identify the document. The customer or seller produces it. Driver waits or is released. Slot. |
| S8 | **Accident with damage** | Not in data, but inevitable at 25k cars/year. | Safety first. Police report and photos. Owner and insurer. Drivable or tow. Promise. Driver's next job. Later liability, kept separate from operations. |
| S9 | **EV cannot charge or is short of range** | Many EVs in data (Taycan, e-tron, EQE, Enyaq, Model 3, Polestar 2). Only expense rows exist. | Nearest compatible charger (search). Time loss. Ferry cutoff risk. Promise. Charging cost claim. |
| S10 | **Misfuelling** | A common driver error with unfamiliar cars. | Do not start the engine. Drain service (roadside). Owner informed. Cost liability (driver vs Bahn). Promise. |
| S11 | **Silent driver no-show** (no message, phone off) | 702 had a message. Silent ones are worse. | Structured detection: slot open, not started, no answer. Call the driver, then the backup driver, then a site message, then a slot move. Payout decision. Driver reliability record. |
| S12 | **Receiver absent at delivery** (driver at the door) | Many private receivers are UNCONFIRMED in data (154, 299, 603, 449). | Wait clock. Customer contact via a human. Never leave the car unattended. Option: overnight custody or return to a staffed site. Hotel. Next-day delivery is a promise change. |
| S13 | **Address conflict** (Tampere in the address, Helsinki in the notes) | The brief's example. Data has a raw-address issue (023). | Hold dispatch for that leg. The customer confirms (approval). The route and offer fee may change. Promise. |
| S14 | **Arrival after site hours or on a weekend** | Site hours are in data. 342 already held a car over a weekend. | Overnight custody (driver keeps the car and keys). Hotel. Receiving appointment. Promise. |
| S15 | **Traffic or toll fine arrives weeks later** | Long-tail cost for any driven delivery. | Match fine to time, vehicle, plate, then to the assignment and driver. Driver recharge policy. Customer is not involved. No operational urgency. |
| S16 | **Parking fine, clamp or tow during custody** | Overnight custody is common in the data (004, 335, 342). | Car blocked. Recovery and payment. Delay to the ferry or promise. Cost dispute. |
| S17 | **Receiver refuses to sign the CMR or signs with a reservation** | The schema's paper CMR and signature-scope states. 164 shows missing-signature pain. | Photos plus a written note. Condition claim risk. Accounting delay. |
| S18 | **No driver 24 h before pickup** | 404 is close. The brief says agents price and offer jobs. | Reprice (approval). A directed offer to a nearby driver. Slot move. Promise. |
| S19 | **Transit or export plates and papers invalid for crossing** | Imports cross DE/FR/SE to FI or DK. | Hold at the border or terminal. Document courier. Missed sailing (O2/O3 chain). Customer. |
| S20 | **Customer cancels mid-transit** | 419 cancelled before pickup. Mid-transit is harder. | Stop safely. Return or hold the car (where?). Custody. Driver payout. Cost recovery. Ferry booking change. |
| S21 | **Driver injured or ill mid-journey** | 449 was before pickup. | Car custody at the roadside or a hotel. Replacement driver positioning to the car. Keys handover between drivers (custody evidence). Promise. |
| S22 | **Road closure or strike hitting many orders** | Network-level event. | Group affected orders. Rank by promise slack and ferry cutoffs. Bulk rebooking. Bulk customer drafts. |
| S23 | **Theft or break-in during overnight custody** | Luxury-heavy mix (Ferrari, Bentley). | Police. Owner. Insurer. Car status unknown. All downstream legs cancelled. Legal. |
| S24 | **The timed-out booking turns out to exist** (double booking) | The natural follow-on of 299. | Cancel one booking (fees). Keep the cheaper or earlier one. Reconcile the expense. Promise unchanged. |

### Synthetic modes used in the evaluation
The evaluation runs 12 of these:
- S1 missed train, S2 carrier cancellation, S3 car not ready on arrival, S6 VIN mismatch, S8 accident, S9 EV charging
- S11 silent no-show, S12 receiver absent, S13 address conflict, S14 arrival after hours, S15 late fine, S20 cancel mid-transit
