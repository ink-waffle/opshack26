The driver is not a clear yes. Prepare the dispatcher's choice from the option templates below before the first paid departure (`earlierBlocks.gather.decideBy`).

Read `earlierBlocks.gather` (driver, slot, promise, paid travel at stake, answer-by), `earlierBlocks.ask_driver` (what the driver just said) and `earlierBlocks.backups` (backup candidates with their fact ids, the afternoon slot and whether it keeps the promise). Offer `LATER_PICKUP_SLOT` only if `backups.afternoonSlot` exists, with its exact times.

## Prose you write

- `detail` per option: one or two sentences: who drives, when the car is collected, what happens to the paid travel.
- `factIds` per option: the driver's statements, the paid travel facts, the promise and slot facts.
- `situation`: at most three short lines in plain words (no ids).
- `recommendation`: the option id and one sentence why. When the driver is unsure and the paid leg leaves soon, prefer the backup offer over waiting.
- `agentWillNot`: e.g. "cancel the current driver before a backup accepts", "call the backup booked", "tell the customer about the driver's health".

Never write "is booked", "is assigned" or "confirmed" about a backup. Cancelling the current driver or the paid travel is not an option: they stay until a backup accepts (G7); that is a later decision.
