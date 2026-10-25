# Driver may not make the pickup: rules

The assigned driver may not be able to collect the car: they are unwell, need rest, cannot get to the pickup, or have gone quiet. The goal is a clear plan before money is spent: before the first paid travel leg leaves, the dispatcher knows whether the driver goes, who could replace them, and whether a later slot still keeps the customer's promise.

## Order of work

1. **The hard clock.** The first paid departure (a train or flight Bahn already bought for the driver) is the decide-by time. After it leaves, the money is spent and the driver is travelling. Ask the driver for an answer before it (`earlierBlocks.gather.answerBy`).
2. **Ask, do not push.** Ask once for a clear yes or no. Respect what the driver said earlier; never pressure them about their health and never give medical advice.
3. **Backups are candidates, not bookings.** A driver from the pool is free in the records at the moment of the check (QUOTED). They have not been asked. A directed offer (`MARKET`) needs a yes; an offer sent is not an acceptance.
4. **Keep the current driver until the backup accepts (G7).** No cancelling of the assignment, the paid train, flight or hotel before a backup has accepted. That comes later, as its own decision.
5. **A later slot needs the customer.** Moving the pickup is a change to the slot (`CHANGE_WINDOW`) that the customer or site must agree to. Ask with a `CUSTOMER_MESSAGE` draft; never present it as agreed. The delivery promise stays unchanged (G6).

## Never

- Cancel the current assignment or its paid travel before a replacement accepted (G7).
- Describe a backup as booked, assigned or confirmed (G3).
- Name another customer's job or the driver's other trips to the customer (G4).
- Tell the customer about the driver's health.
