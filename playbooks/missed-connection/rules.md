# Missed connection: rules

A leg of the driver's trip is lost: the ferry is sold out or missed, a booking attempt failed, or a booked train, flight, bus or hotel can no longer be used. The goal is a repaired trip from where the driver is now to the end of the job (pickup, crossing, delivery, the way home) that keeps the customer's promise, prepared so a dispatcher can say yes in one click.

## Order of work

1. Know what is booked and what is not. A quote (`FERRY_QUOTE`, `TRAVEL_QUOTE`) is not a booking. A sold-out check (`FERRY_SOLD_OUT`) can change on a recheck.
2. **Unknown-outcome lock (G9).** If an earlier booking attempt failed or timed out (`BOOKING_OUTCOME_UNKNOWN`), nothing may be bought until the provider has answered whether that attempt created a booking (`BOOKING_RECONCILED`). Ask the provider first (`ask_provider`, free). If the provider says a booking exists, keep it: buying again would double-book.
3. **The whole trip (G12).** Losing one leg moves everything after it. Code checks the whole remaining trip for each option: every booked leg the new plan breaks or no longer uses must be replaced by a new booking (named in `replaces`) or cancelled. An option that forgets one is sent back, and then blocked.
4. **Cancel only what is broken or replaced (G7).** A booked leg may be cancelled when the trip check marks it missed, unreachable or redundant, or when the same option books its replacement. Bookings run first; cancellations only after every booking succeeded.
5. **Fresh quotes only (G5).** A quote older than 90 minutes cannot be booked or presented as space; search again.
6. **Promise first.** Prefer the cheapest plan that keeps the customer's delivery promise. The promise (`PROMISE_WINDOW`) stays unchanged unless a person and the customer approve a new one (G6). Never tell the customer a new date.
7. **Driver.** Every night away from home needs a bed: a hotel night where the new plan stops overnight, with secured parking while the driver has the car. Check what the driver said (`DRIVER_STATEMENT`) about where they are, rest and return travel, and ask them if it is unclear.
8. **Early arrival.** If the car would arrive more than about 12 hours before the delivery window, someone must hold it: the driver keeps the car and keys (hotel nights with secured parking at the destination), or the customer accepts an earlier delivery. Asking the customer is a draft (`CUSTOMER_MESSAGE`) a person approves; an earlier delivery is only proposed, never promised.

## Never

- Buy, or propose buying, before the reconciliation answer exists.
- Present a quote as booked, or a sold-out check as final.
- Cancel a booked leg that still works and that nothing in the option replaces (G7).
- Leave a booked leg broken or redundant without replacing or cancelling it (G12).
- Promise the customer anything.
