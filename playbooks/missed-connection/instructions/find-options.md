Prepare at most three options for the dispatcher from the option templates below. Each option is something they can approve as is, and each repairs the whole rest of the trip, not only the first broken link.

## Steps (cheap first)

1. Read `earlierBlocks.gather`: `baseline` (the trip check on the records alone: every booked leg with `ref`, `factId`, verdict and reason, and where it places the driver), `mustAddress` (booked legs now missed, unreachable or redundant), `reported` (the message that started this run), the route, pickup slot, earliest time at the departure terminal, promise window, driver and unknown attempts; and `earlierBlocks.reconcile` if present (provider answers). If the provider said a booking exists, offer `KEEP_EXISTING_BOOKING` first.
2. **Where the driver is.** If the driver's message says where they are now ("still in Munich", "at the terminal, the gate closed"), fill `driverAt` with that city, the time of the message and the statement's fact id. The trip check starts from there and finds every booked leg the driver can no longer use, also ones `mustAddress` does not list yet. Otherwise `driverAt` is null.
3. **Fresh travel from there.** Search what the driver needs from where they are to the end of the job: `search_trains` for a later train, `search_ferries` from the earliest time the car can be at the terminal if the booked sailing is lost or the new train misses its cutoff, `search_hotels` for every night the new plan stops somewhere (prefer secured parking while the driver has the car), and `search_trains` for the way home after the delivery. Only fact ids from your own searches go into the slots; quotes older than 90 minutes do not count.
4. **Driver.** Read what the driver already said (`DRIVER_STATEMENT` facts). If it is unclear where they are, whether they can stay overnight or keep the car longer, ask once with `ask_driver` (one short question covering what you need).
5. **Cover every broken leg.** For each booked leg the new plan breaks or no longer uses (from `mustAddress`, and those your new times break: a hotel in a city the driver no longer sleeps in, a ferry the new train cannot reach, a return train before the new delivery time): either a new booking names it in `replaces`, or `cancellations` lists it by `ref`. A redundant leg (still bookable but no longer used) can only be cancelled. Never cancel a leg that still works and that nothing replaces.
6. **Early arrival.** If the new plan arrives more than about 12 hours before the delivery window starts, offer both `REBOOK_REST_OF_TRIP` with hotel nights near the destination and `REBOOK_ASK_EARLY_DELIVERY`.

## Prose you write

- `detail` per option: one or two sentences a dispatcher reads first: the new arrival, what is cancelled, and what happens to the car until the delivery window.
- `factIds` per option: the facts it rests on besides its quotes (the driver's statements, the provider's answer, the promise window).
- `situation`: at most three short lines in the third person: what was lost, what else that breaks, and what the decision is. Mention a lookup only if you made that tool call in this step. Cite no ids here; plain words.
- `recommendation`: the option id and one sentence why. A is the one you recommend unless you say otherwise.
- `agentWillNot`: the things you are deliberately not doing (e.g. "cancel the Tallinn hotel before the new train is booked", "tell the customer a new date").
