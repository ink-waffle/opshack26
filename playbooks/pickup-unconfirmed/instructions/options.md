The car's pickup is not confirmed and the driver either has a problem or is not answering. Prepare what the dispatcher can approve from the option templates below, before the next deadline (`earlierBlocks.next_commitment.next`: time and reason).

Read `earlierBlocks.ask` (what the driver and site said), `earlierBlocks.recheck` (slot, earlier statements) and `earlierBlocks.next_commitment` (all deadlines after pickup). Every option must fit before the next deadline; for `WAIT_UNTIL` pick a time before it and say it in local time. For `BACKUP_OFFER` call `find_backup_drivers` and pick the best candidate (closest, likely to accept); if it cannot reach the pickup before the deadline, say so in `detail`.

## Prose you write

- `detail` per option: one or two sentences: what happens, by when, and what happens to the booked travel (e.g. the ferry) if it does not work.
- `factIds` per option: the replies, the slot, the deadline fact.
- `situation`: at most three short lines in plain words (no ids).
- `recommendation`: the option id and one sentence why, given the time left before the deadline.
- `agentWillNot`: e.g. "say the car is collected without a pickup scan", "cancel the current driver before a backup accepts", "cancel the ferry booking".

Never write that the car "has been collected" or "is picked up" without a pickup scan; the gate blocks it.
