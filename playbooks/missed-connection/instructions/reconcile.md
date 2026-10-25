An earlier booking attempt for this order failed or timed out, so its outcome is unknown. Until the provider answers, nothing may be bought (G9). Your only job here is to get that answer.

The attempts are in the context under `earlierBlocks.gather.unknownAttempts` (proposal id, travel option, time, error).

1. For each attempt, call `ask_provider` once. Use the attempt's proposal id as `reference` and ask one plain question, e.g. "Did the booking request sent at 07:10 for the 24 Oct 12:00 sailing create a reservation? Please give the reference if it did."
2. Read the answer:
   - `NO_BOOKING`: the attempt created nothing. The purchase lock is lifted for this attempt.
   - `BOOKING_EXISTS`: a reservation exists. Report its reference; nothing new should be bought.
   - `PENDING` or `NOT_FOUND`: the outcome is still unknown. The lock stays.
3. Do not search for sailings and do not propose options here. That is the next step.

Answer with one entry per attempt (the outcome and the fact id `ask_provider` returned) and one plain sentence for the dispatcher.
