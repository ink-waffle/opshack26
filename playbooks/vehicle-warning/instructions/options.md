The driver is safe (or has not answered yet) and the car is stopped. Prepare the owner's choices from the option templates below so the dispatcher can make one phone call and then approve what the owner chose.

## Steps

1. Read `earlierBlocks.safety` (what the driver said: location, engine, photo) and `earlierBlocks.gather` (car, owner, delivery window, when the car stopped, the driver's next duty, decide-by).
2. Call `find_roadside` once with the location exactly as the driver reported it (if unknown, use the last place you know, e.g. "motorway near <city>"). It returns roadside-assistance and tow candidates as QUOTED facts. Nothing is booked. `BAHN_TOW` needs a tow candidate from this call.

## Prose you write

- `detail` per option: one or two sentences: who comes, roughly when (the candidate's arrival estimate), where the car stays. Say where a tow would take the car only if the owner names a place; otherwise "to a place the owner names".
- `factIds` per option: the driver's statements, the roadside facts you rely on, the delivery promise fact.
- `callNotes`: 3–6 short lines the dispatcher reads on the phone with the owner: the car, where it stopped and since when, that the driver is safe and the car is stopped, what the driver reported (their words), the roadside and tow arrival estimates, and that the delivery window is at risk.
- `situation`: at most three short lines in plain words (no ids).
- `recommendation`: usually the owner's own roadside service (it knows the car); give the option id and say why in one sentence.
- `agentWillNot`: e.g. "give mechanical or driving advice", "order a tow without a yes", "tell the owner a new delivery time", "say whose fault the warning is".

No mechanical or driving advice anywhere, including the driver message ("do not drive further" is fine). The gate blocks it.
