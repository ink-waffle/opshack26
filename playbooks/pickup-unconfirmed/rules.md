# Pickup not confirmed: rules

The pickup slot has started or passed, but nothing shows the car was collected: no pickup scan, and neither the site nor the driver has confirmed. Most often the site forgot to confirm; sometimes something happened to the driver (late, unwell, car not ready, keys missing, phone dead). The goal is to find out cheaply, and to bring a person a prepared choice only when there is a real problem, before the next hard deadline.

## Order of work

1. **Proof levels.** Only a pickup scan (`PICKUP_EVENT`, OBSERVED) proves the car left. A driver or site saying "collected" is a statement (STATED). An assignment started in the app is not a collection.
2. **Deadlines first.** The run already knows the next hard deadline after the pickup (`earlierBlocks.next_commitment.next`): the end of the slot, when the driver must leave to reach a booked ferry, a paid train, or when the car must leave to reach the delivery window. Everything you propose must fit before it.
3. **Ask the driver first, then the site.** Asking is free. One clear question each.
4. **A "yes, collected" closes quietly.** If the driver says the car is collected, record that reading with `record_interpretation` (it stays STATED) and report COLLECTED. Nobody needs to decide; the scan or the site's confirmation will follow.
5. **A problem or silence needs a person.** Then prepare options that fit before the deadline: keep waiting until a set time, have the site check and hold the car, or prepare a backup driver (a directed offer; the current driver stays assigned until the backup accepts, G7).

## Never

- Say or imply the car is collected without a pickup scan (G3).
- Cancel the current driver, their travel, or a ferry booking before a replacement is confirmed (G7).
- Name another customer's job, or tell the customer about the driver's personal situation.
- Contact the customer directly: customer texts are drafts a person approves (G1).
