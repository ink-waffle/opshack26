import { describe, expect, it } from 'vitest';

import type { DriverDuties } from '@/lib/bahn/drivers';
import {
  checkItinerary,
  type ItineraryChangeSet,
  type ItineraryResult,
  type ItineraryStart,
} from '@/lib/chain/itinerary';
import { localDate, nightWindow, resolvePlace, samePlace } from '@/lib/chain/itinerary/places';
import {
  eventRow,
  hotelFact,
  munichTallinnBundle,
  quoteFact,
  reservationRow,
  syntheticDuties,
  terminalRow,
} from '@/lib/chain/itinerary/testing';
import { bahnDedupeKey, factIdFor } from '@/lib/facts/ids';
import type { FactLike } from '@/lib/facts/types';
import type { BahnOperationalEvent, BahnTravelReservation } from '@/lib/generated/prisma/client';

const at = (iso: string) => new Date(iso);

function check(args: {
  now: Date;
  facts?: FactLike[];
  changeSet?: ItineraryChangeSet;
  start?: ItineraryStart;
  duties?: DriverDuties[];
  extraReservations?: BahnTravelReservation[];
  events?: BahnOperationalEvent[];
}): ItineraryResult {
  const { now, facts = [], changeSet, start, duties, extraReservations, events } = args;
  return checkItinerary({
    bundle: munichTallinnBundle({ extraReservations, events }),
    facts,
    now,
    changeSet,
    start,
    duties,
  });
}

function leg(result: ItineraryResult, ref: string) {
  const found = result.legs.find((l) => l.ref === ref || l.factId === ref);
  if (!found) throw new Error(`no leg ${ref}`);
  return found;
}

function verdicts(result: ItineraryResult): Record<string, string> {
  return Object.fromEntries(result.legs.map((l) => [l.factId ?? l.ref ?? '?', l.verdict]));
}

function refs(legs: ItineraryResult['legs']): (string | null)[] {
  return legs.map((l) => l.ref);
}

const bookingFactId = (recordId: string, kind: string) =>
  factIdFor(bahnDedupeKey({ collection: 'travel_reservations', recordId, kind }));

// Missed-train scenario: the driver should have left Munich at 06:00Z and is still there at 07:00Z.
const missedNow = at('2026-10-27T07:00:00Z');
const inMunich: ItineraryStart = { city: 'Munich', at: missedNow };
const nextDayTrain = quoteFact({
  id: 'f_train_next_day',
  mode: 'TRAIN',
  fromCity: 'Munich',
  toCity: 'Tallinn',
  departureAt: '2026-10-28T05:00:00Z',
  arrivalAt: '2026-10-28T11:30:00Z',
  localTransferHours: 0.5,
  observedAt: missedNow,
});
const munichHotel = hotelFact({
  id: 'f_hotel_munich',
  near: 'Munich',
  checkIn: '2026-10-27',
  nights: 1,
  observedAt: missedNow,
});

// Missed-ferry scenario: the car was released late (15:30Z), after the 14:00Z cutoff.
const lateNow = at('2026-10-28T15:45:00Z');
const lateRelease = [
  eventRow({
    id: 'ev-pickup',
    command: 'vehicle.picked_up',
    occurredAt: at('2026-10-28T15:30:00Z'),
  }),
];
const nextSailing = quoteFact({
  id: 'f_sailing_next',
  mode: 'FERRY',
  fromCity: 'Tallinn terminal',
  toCity: 'South Finland terminal',
  originTerminalId: 'terminal-tallinn',
  destinationTerminalId: 'terminal-south-finland',
  departureAt: '2026-10-29T06:00:00Z',
  arrivalAt: '2026-10-29T08:00:00Z',
  checkInCutoffAt: '2026-10-29T05:00:00Z',
  roadTimeToTerminalHours: 0.5,
  observedAt: lateNow,
});
const laterReturn = quoteFact({
  id: 'f_return_later',
  mode: 'TRAIN',
  fromCity: 'Tampere',
  toCity: 'Helsinki',
  departureAt: '2026-10-29T13:00:00Z',
  arrivalAt: '2026-10-29T15:00:00Z',
  observedAt: lateNow,
});
const terminalHotel = hotelFact({
  id: 'f_hotel_terminal',
  near: 'Tallinn terminal',
  checkIn: '2026-10-28',
  nights: 1,
  observedAt: lateNow,
});
const lateFacts = [nextSailing, laterReturn, terminalHotel];

describe('checkItinerary: the booked plan', () => {
  it('follows the driver through every leg when nothing goes wrong', () => {
    const result = check({ now: at('2026-10-27T05:00:00Z') });
    expect(result.feasible).toBe(true);
    expect(result.violations).toEqual([]);
    expect(verdicts(result)).toEqual({
      [bookingFactId('res-train', 'TRAVEL_BOOKING')]: 'ok',
      [bookingFactId('res-hotel-tallinn', 'HOTEL_BOOKING')]: 'ok',
      [bookingFactId('res-ferry', 'FERRY_BOOKING')]: 'ok',
      [bookingFactId('res-hotel-tampere', 'HOTEL_BOOKING')]: 'ok',
      [bookingFactId('res-return', 'TRAVEL_BOOKING')]: 'ok',
    });
    expect(result.pickup.at?.toISOString()).toBe('2026-10-28T07:00:00.000Z');
    // Sailing arrives 17:00Z + 2 h road (quote note) = 19:00Z; delivered when the window opens.
    expect(result.delivery.etaAt?.toISOString()).toBe('2026-10-28T19:00:00.000Z');
    expect(result.delivery.at?.toISOString()).toBe('2026-10-29T07:00:00.000Z');
    expect(result.delivery.promise?.verdict).toBe('holds');
    expect(result.nights.map((n) => [n.date, n.hotel])).toEqual([
      ['2026-10-27', 'hotel in Tallinn, night of Tue 27 Oct'],
      ['2026-10-28', 'hotel in Tampere, night of Wed 28 Oct'],
    ]);
  });

  it('ignores cancelled and non-live reservations in the bundle', () => {
    const result = check({
      now: at('2026-10-27T05:00:00Z'),
      extraReservations: [
        reservationRow({
          id: 'res-cancelled-hotel',
          kind: 'HOTEL',
          city: 'Riga',
          departureAt: at('2026-10-27T18:30:00Z'),
          expectedArrivalAt: at('2026-10-28T06:00:00Z'),
          cancelledAt: at('2026-10-26T10:00:00Z'),
        }),
        reservationRow({
          id: 'res-cancelled-train',
          kind: 'TRAIN',
          fromCity: 'Munich',
          toCity: 'Riga',
          departureAt: at('2026-10-27T05:30:00Z'),
          expectedArrivalAt: at('2026-10-27T15:00:00Z'),
          status: 'CANCELLED',
          cancelledAt: at('2026-10-26T10:00:00Z'),
        }),
        reservationRow({
          id: 'res-old-ferry',
          kind: 'FERRY',
          originTerminalId: 'terminal-tallinn',
          destinationTerminalId: 'terminal-south-finland',
          departureAt: at('2026-10-28T09:00:00Z'),
          expectedArrivalAt: at('2026-10-28T11:00:00Z'),
          status: 'MISSED_CHECK_IN',
        }),
      ],
    });
    expect(result.feasible).toBe(true);
    expect(refs(result.legs)).toEqual([
      'res-train',
      'res-hotel-tallinn',
      'res-ferry',
      'res-hotel-tampere',
      'res-return',
    ]);
  });
});

describe('checkItinerary: the driver misses the positioning train Munich → Tallinn', () => {
  it('(a) next-day train still makes the ferry: the Tallinn hotel is redundant and the Munich night has no hotel', () => {
    const result = check({
      now: missedNow,
      start: inMunich,
      facts: [nextDayTrain],
      changeSet: { add: [{ source: 'fact', factId: nextDayTrain.id }] },
    });
    expect(leg(result, 'res-train')).toMatchObject({
      verdict: 'missed',
      replacedBy: 'f_train_next_day',
    });
    expect(leg(result, 'f_train_next_day')).toMatchObject({ status: 'new', verdict: 'ok' });
    expect(leg(result, 'res-hotel-tallinn').verdict).toBe('redundant');
    expect(leg(result, 'res-hotel-tallinn').reason).toContain('in Munich');
    expect(leg(result, 'res-ferry').verdict).toBe('ok');
    expect(leg(result, 'res-hotel-tampere').verdict).toBe('ok');
    expect(leg(result, 'res-return').verdict).toBe('ok');
    expect(result.pickup.at?.toISOString()).toBe('2026-10-28T12:00:00.000Z');
    expect(result.gaps).toEqual([]);
    expect(result.warnings).toContain(
      'No hotel is booked for the night of Tue 27 Oct in Munich: the driver is in Munich.'
    );
    expect(refs(result.unaddressed)).toEqual(['res-hotel-tallinn']);
    expect(result.feasible).toBe(false);
    expect(result.violations).toEqual([
      'Booked hotel in Tallinn, night of Tue 27 Oct is no longer needed: on the night of Tue 27 Oct the driver is in Munich. The option does not cancel it.',
    ]);
  });

  it('(b) the replacement train arrives after the ferry cutoff: the ferry is missed and everything after it is re-checked', () => {
    const result = check({
      now: missedNow,
      start: inMunich,
      changeSet: {
        add: [
          {
            source: 'quote',
            quote: {
              mode: 'TRAIN',
              fromCity: 'Munich',
              toCity: 'Tallinn',
              departureAt: at('2026-10-28T06:15:00Z'),
              arrivalAt: at('2026-10-28T12:45:00Z'),
              localTransferHours: 0.5,
              checkedAt: missedNow,
              ref: 'quote-late-train',
            },
          },
        ],
      },
    });
    expect(leg(result, 'quote-late-train').verdict).toBe('ok');
    expect(leg(result, 'res-train').replacedBy).toBe('quote-late-train');
    expect(leg(result, 'res-ferry').verdict).toBe('missed');
    expect(leg(result, 'res-ferry').reason).toBe(
      'the driver reaches the terminal Wed 28 Oct 16:15 EET (car collected Wed 28 Oct 15:15 EET, 0.5 h handover, 0.5 h road), after the check-in cutoff Wed 28 Oct 16:00 EET'
    );
    expect(leg(result, 'res-hotel-tampere').verdict).toBe('unreachable');
    expect(leg(result, 'res-return').verdict).toBe('unreachable');
    expect(result.delivery.at).toBeNull();
    expect(result.delivery.promise?.verdict).toBe('unknown');
    expect(result.gaps.map((g) => g.kind)).toEqual(['FERRY_CUTOFF', 'NO_CROSSING']);
    expect(result.gaps.find((g) => g.kind === 'NO_CROSSING')?.message).toBe(
      'No sailing the driver can make is in the plan, so the car cannot reach Tampere for the promised window Thu 29 Oct 09:00–12:00 EET.'
    );
    expect(refs(result.unaddressed)).toEqual([
      'res-hotel-tallinn',
      'res-ferry',
      'res-hotel-tampere',
      'res-return',
    ]);
    expect(result.violations).toHaveLength(5);
    expect(result.violations[1]).toBe(
      'The ferry Tallinn Vehicle Terminal → South Finland Vehicle Terminal Wed 28 Oct 17:00 EET is missed: the driver reaches the terminal Wed 28 Oct 16:15 EET (car collected Wed 28 Oct 15:15 EET, 0.5 h handover, 0.5 h road), after the check-in cutoff Wed 28 Oct 16:00 EET. The option neither cancels nor replaces it.'
    );
  });

  it('a change set that forgets to cancel the redundant Tallinn hotel leaves exactly that leg unaddressed', () => {
    const result = check({
      now: missedNow,
      start: inMunich,
      facts: [nextDayTrain, munichHotel],
      changeSet: {
        add: [
          { source: 'fact', factId: nextDayTrain.id },
          { source: 'fact', factId: munichHotel.id },
        ],
      },
    });
    expect(leg(result, 'f_hotel_munich')).toMatchObject({ verdict: 'ok', nights: ['2026-10-27'] });
    expect(result.gaps).toEqual([]);
    expect(refs(result.unaddressed)).toEqual(['res-hotel-tallinn']);
    expect(result.violations).toHaveLength(1);
    expect(result.feasible).toBe(false);

    const fixed = check({
      now: missedNow,
      start: inMunich,
      facts: [nextDayTrain, munichHotel],
      changeSet: {
        add: [
          { source: 'fact', factId: nextDayTrain.id },
          { source: 'fact', factId: munichHotel.id },
        ],
        cancel: ['res-hotel-tallinn'],
      },
    });
    expect(leg(fixed, 'res-hotel-tallinn')).toMatchObject({
      status: 'cancel',
      verdict: 'cancelled',
    });
    expect(fixed.feasible).toBe(true);
    expect(fixed.unaddressed).toEqual([]);
  });
});

describe('checkItinerary: missed ferry, new sailing pushes delivery later', () => {
  it('the return train after delivery becomes unreachable unless the change set replaces it', () => {
    const result = check({
      now: lateNow,
      events: lateRelease,
      facts: lateFacts,
      changeSet: { cancel: ['res-ferry'], add: [{ source: 'fact', factId: nextSailing.id }] },
    });
    expect(result.start.basis).toBe('pickup scan');
    expect(leg(result, 'res-train').verdict).toBe('ok');
    expect(leg(result, 'res-ferry').verdict).toBe('cancelled');
    expect(leg(result, 'f_sailing_next').verdict).toBe('ok');
    expect(result.delivery.etaAt?.toISOString()).toBe('2026-10-29T11:00:00.000Z');
    expect(result.delivery.promise?.verdict).toBe('breaks');
    expect(leg(result, 'res-return')).toMatchObject({ verdict: 'unreachable', replacedBy: null });
    expect(leg(result, 'res-return').reason).toContain('with the car between');
    expect(leg(result, 'res-hotel-tampere').verdict).toBe('redundant');
    expect(result.gaps.map((g) => g.kind).sort()).toEqual([
      'DELIVERY_LATE',
      'RETURN_BEFORE_DELIVERY',
    ]);
    expect(refs(result.unaddressed)).toEqual(['res-hotel-tampere', 'res-return']);
    expect(result.violations).toContain(
      'The train Tampere → Helsinki Thu 29 Oct 12:00 EET departs before the driver is free after the delivery in Tampere (Thu 29 Oct 13:30 EET). The option neither cancels nor replaces it.'
    );

    const replaced = check({
      now: lateNow,
      events: lateRelease,
      facts: lateFacts,
      changeSet: {
        cancel: ['res-ferry'],
        add: [
          { source: 'fact', factId: nextSailing.id },
          { source: 'fact', factId: laterReturn.id },
        ],
      },
    });
    expect(leg(replaced, 'res-return')).toMatchObject({
      verdict: 'unreachable',
      replacedBy: 'f_return_later',
    });
    expect(leg(replaced, 'f_return_later').verdict).toBe('ok');
    expect(refs(replaced.unaddressed)).toEqual(['res-hotel-tampere']);
    expect(replaced.gaps.map((g) => g.kind)).not.toContain('RETURN_BEFORE_DELIVERY');
  });

  it('a change set that addresses every broken leg is feasible', () => {
    const result = check({
      now: lateNow,
      events: lateRelease,
      facts: lateFacts,
      duties: [
        syntheticDuties({
          current: { startAt: at('2026-10-28T07:00:00Z'), endAt: at('2026-10-29T10:00:00Z') },
          next: {
            startAt: at('2026-10-29T18:00:00Z'),
            endAt: at('2026-10-30T12:00:00Z'),
            startCity: 'Helsinki',
            endCity: 'Oulu',
          },
        }),
      ],
      changeSet: {
        cancel: ['res-ferry', bookingFactId('res-hotel-tampere', 'HOTEL_BOOKING'), 'res-return'],
        add: [
          { source: 'fact', factId: nextSailing.id },
          { source: 'fact', factId: terminalHotel.id },
          { source: 'fact', factId: laterReturn.id },
        ],
        deliveryWindow: { startAt: at('2026-10-29T11:00:00Z'), endAt: at('2026-10-29T14:00:00Z') },
      },
    });
    expect(result.violations).toEqual([]);
    expect(result.unaddressed).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.feasible).toBe(true);
    expect(leg(result, 'f_hotel_terminal')).toMatchObject({
      verdict: 'ok',
      nights: ['2026-10-28'],
    });
    expect(leg(result, 'res-hotel-tampere').verdict).toBe('cancelled');
    expect(result.delivery.promise?.verdict).toBe('holds');
    expect(result.nextDuty).toMatchObject({ city: 'Helsinki', ok: true });
  });

  it('flags the next duty when the later return gets the driver there too late', () => {
    const result = check({
      now: lateNow,
      events: lateRelease,
      facts: lateFacts,
      duties: [
        syntheticDuties({
          current: { startAt: at('2026-10-28T07:00:00Z'), endAt: at('2026-10-29T10:00:00Z') },
          next: {
            startAt: at('2026-10-29T14:00:00Z'),
            endAt: at('2026-10-30T12:00:00Z'),
            startCity: 'Helsinki',
            endCity: 'Oulu',
          },
        }),
      ],
      changeSet: {
        cancel: ['res-ferry', 'res-hotel-tampere', 'res-return'],
        add: [
          { source: 'fact', factId: nextSailing.id },
          { source: 'fact', factId: terminalHotel.id },
          { source: 'fact', factId: laterReturn.id },
        ],
        deliveryWindow: { startAt: at('2026-10-29T11:00:00Z'), endAt: at('2026-10-29T14:00:00Z') },
      },
    });
    expect(result.nextDuty).toMatchObject({ ok: false });
    expect(result.violations).toEqual([
      "The driver's next duty starts in Helsinki Thu 29 Oct 16:00 EET, but the driver is free in Helsinki only Thu 29 Oct 17:00 EET.",
    ]);
  });
});

describe('checkItinerary: pickup and change-set inputs', () => {
  const lateTrain: ItineraryChangeSet['add'] = [
    {
      source: 'quote',
      quote: {
        mode: 'TRAIN',
        fromCity: 'Munich',
        toCity: 'Tallinn',
        departureAt: at('2026-10-28T10:00:00Z'),
        arrivalAt: at('2026-10-28T16:00:00Z'),
        localTransferHours: 0.5,
        checkedAt: missedNow,
        ref: 'quote-very-late',
      },
    },
  ];

  it('an arrival after the pickup slot leaves the pickup unreachable and the ferry without a car', () => {
    const result = check({ now: missedNow, start: inMunich, changeSet: { add: lateTrain } });
    expect(result.gaps.map((g) => g.kind)).toContain('PICKUP_UNREACHABLE');
    expect(leg(result, 'res-ferry')).toMatchObject({
      verdict: 'unreachable',
      reason: 'the driver does not collect the car before it sails',
    });
  });

  it('a moved pickup slot lets the driver collect the car, and the ferry is then missed', () => {
    const result = check({
      now: missedNow,
      start: inMunich,
      changeSet: {
        add: lateTrain,
        pickupSlot: { startAt: at('2026-10-28T16:00:00Z'), endAt: at('2026-10-28T18:00:00Z') },
      },
    });
    expect(result.pickup.at?.toISOString()).toBe('2026-10-28T16:30:00.000Z');
    expect(result.gaps.map((g) => g.kind)).not.toContain('PICKUP_UNREACHABLE');
    expect(leg(result, 'res-ferry').verdict).toBe('missed');
  });

  it('reports a proposed leg whose quote is not on record', () => {
    const result = check({
      now: missedNow,
      start: inMunich,
      changeSet: { add: [{ source: 'fact', factId: 'f_missing' }] },
    });
    expect(result.gaps.map((g) => g.kind)).toContain('UNRESOLVED_LEG');
    expect(result.feasible).toBe(false);
  });

  it('a proposed leg that already departed is missed', () => {
    const result = check({
      now: missedNow,
      start: inMunich,
      changeSet: {
        add: [
          {
            source: 'quote',
            quote: {
              mode: 'TRAIN',
              fromCity: 'Munich',
              toCity: 'Tallinn',
              departureAt: at('2026-10-27T06:30:00Z'),
              arrivalAt: at('2026-10-27T18:30:00Z'),
              checkedAt: missedNow,
              ref: 'quote-gone',
            },
          },
        ],
      },
    });
    expect(leg(result, 'quote-gone').verdict).toBe('missed');
    expect(result.violations[0]).toMatch(
      /^Proposed train Munich → Tallinn .* is missed: it departs/
    );
  });

  it('violations never carry record or fact ids', () => {
    const result = check({
      now: missedNow,
      start: inMunich,
      changeSet: { add: lateTrain },
    });
    expect(result.violations.length).toBeGreaterThan(0);
    for (const line of result.violations) expect(line).not.toMatch(/res-|f_|quote-|terminal-/);
  });

  it('is deterministic', () => {
    const run = () =>
      JSON.stringify(
        check({
          now: missedNow,
          start: inMunich,
          facts: [nextDayTrain],
          changeSet: { add: [{ source: 'fact', factId: nextDayTrain.id }] },
        })
      );
    expect(run()).toBe(run());
  });
});

describe('itinerary places', () => {
  it('night windows follow the local zone across the DST change', () => {
    const window = (date: string) =>
      nightWindow({ date, timeZone: 'Europe/Berlin', startHour: 22, endHour: 6 });
    expect(window('2026-10-24')).toEqual({
      from: at('2026-10-24T20:00:00Z'),
      to: at('2026-10-25T05:00:00Z'),
    });
    expect(window('2026-10-25').from).toEqual(at('2026-10-25T21:00:00Z'));
    expect(localDate(at('2026-10-27T23:30:00Z'), 'Europe/Tallinn')).toBe('2026-10-28');
  });

  it('maps terminal labels and ids to their city', () => {
    const west = terminalRow({
      id: 'terminal-west-baltic',
      name: 'West Baltic Vehicle Terminal',
      city: 'Hamburg',
      timezone: 'Europe/Berlin',
    });
    const place = (label: string, terminalId?: string) =>
      resolvePlace({ label, terminalId, terminals: [west] });
    expect(place('West Baltic terminal')).toEqual({
      label: 'West Baltic terminal',
      city: 'Hamburg',
    });
    expect(place('x', 'terminal-west-baltic').city).toBe('Hamburg');
    expect(samePlace(place('West Baltic terminal'), place('Hamburg'))).toBe(true);
    expect(place('East Sweden terminal').city).toBeNull();
    expect(samePlace(place('Malmö'), place('Malmo'))).toBe(true);
  });
});
