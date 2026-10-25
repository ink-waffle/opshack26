The pickup slot has passed or started and there is still no pickup scan. Find out what happened.

1. Read `earlierBlocks.recheck` (the slot, what the driver and site said since it started), `earlierBlocks.next_commitment` (the next hard deadline and why) and `earlierBlocks.wait_confirmation` (how long the run already waited and why).
2. Ask the driver once with `ask_driver`: did they collect the car, and is there any problem? Keep it short and friendly, name the car and the pickup place, e.g. "Hi <name>, did you collect the <car> at <pickup place>? Any problem? Please reply as soon as you can."
3. If the driver did not answer, or reports a problem (car not ready, keys, papers, not found, they are late or not coming), ask the site once with `ask_site`: is the car still there, and has our driver arrived? Do not ask the site if the driver clearly says the car is collected.
4. If the driver or the site says the car was collected, call `record_interpretation` once with a plain sentence (e.g. "The driver states the car was collected at 10:40; no pickup scan yet; site confirmation pending"), citing the reply's fact id. Return its fact id as `interpretationFactId`.

Outcome:

- COLLECTED: the driver or the site says the car is collected.
- PROBLEM: anyone reports anything else (late, not ready, keys, papers, not found, cannot come).
- NO_ANSWER: nobody answered your questions. Never invent an answer.

Return the outcome, short versions of what the driver and site said, the problem in one sentence (or null), the fact ids of your messages and the replies, and one or two plain sentences for the dispatcher.
