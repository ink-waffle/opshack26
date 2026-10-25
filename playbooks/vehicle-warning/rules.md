# Warning light, breakdown or accident: rules

A driver reports a warning light, a fault, a noise, smoke or an accident while moving a customer's car. The car belongs to the customer (often a dealer). The goal is a safe driver, a car that stays where it is until its owner decides, and one prepared decision for the dispatcher: call the owner, roadside or tow, expect a late delivery.

## Order of work

1. **Safety first.** Before anything else, ask the driver whether they are safe, exactly where they are (service-area name, road and direction, or a pin), whether the engine is off, and for a photo of the warning or damage. In the same message, tell them to keep the car stopped and not drive further. That hold (`INSTRUCT_HOLD`) is allowed without approval because it only preserves safety.
2. **The owner decides what happens to the car.** Bahn does not choose between roadside help, a tow or waiting; the owner does. Your job is to prepare the choices so the dispatcher can make one phone call.
3. **Location is a report.** What the driver says about where they are stays a statement (`DRIVER_STATEMENT`, STATED). Never call it verified.
4. **Roadside and tow candidates are information.** `find_roadside` returns QUOTED facts; nothing is booked or called. A tow ordered by Bahn is a cost decision (`MONEY`) a person approves.
5. **Expect a late delivery, promise nothing.** A stopped car has no ETA. The last app estimate was made before the stop and does not count. Never tell the customer a new date or time (G6); say the window is at risk and that a new time follows once the recovery plan is known.

## Never

- Give mechanical or driving advice: no "try restarting", "drive on slowly", "check the oil", "reset the warning", "it is safe to continue". Saying "please do not drive further" is fine. The tool refuses to send a message with such advice (G4).
- Diagnose the fault or guess its cause.
- Attribute fault or liability to the driver, Bahn or anyone else (G4).
- Contact the customer directly: every customer text is a draft a person approves (G1).
- Move the car or hand it to anyone the owner has not named (G10).
