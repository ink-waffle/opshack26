The assigned driver may not be able to do the pickup. Get one clear answer from them before the decide-by time.

1. Read `earlierBlocks.gather`: the driver, the pickup slot (`slot.local`), the first paid departure (`decideBy`), the paid travel already booked, and `answerBy` (the time you ask them to answer by). Read what the driver already said (`driverSaid`); do not ask again for something they answered in the last hour.
2. Send **one** message with `ask_driver`. It must:
   - ask plainly whether they can do the pickup in the booked slot: yes or no;
   - give the time to answer by, in local time (`answerBy.local`), and why: their first paid travel leg leaves soon after (say which, from `decideBy`);
   - say that nothing is cancelled and their assignment stays active while we wait for the answer.

   Example: "Hi <name>, can you do the <city> pickup <slot, local time>? Please answer yes or no by <answer-by, local time>: your <train/flight> to <city> leaves at <time> and we need to know before then. Nothing is cancelled; your assignment stays active."

   Be kind and short. Do not give health advice and do not push.

3. Read the reply. YES only if they clearly say they can do it. A hedge ("probably", "I think so", "maybe in the afternoon") is UNSURE. No answer is NO_REPLY; do not invent one.

Return the answer, the earliest time they say they could start (if they named one), the fact ids of your message and their reply, and one or two plain sentences of what they said.
