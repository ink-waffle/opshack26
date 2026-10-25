import { describe, expect, it } from 'vitest';

import { parseItinerary, parseOptions } from '@/lib/control-room/options';

const itinerary = {
  feasible: false,
  legs: [
    {
      ref: 'res-train',
      factId: 'f_train',
      kind: 'TRAIN',
      description: 'train Munich → Tallinn 24 Oct, 08:00',
      status: 'keep',
      verdict: 'missed',
      reason: 'it departed 24 Oct, 08:00, and the driver is in Munich 24 Oct, 09:10',
      replacedBy: 'tool:search_trains:c2',
    },
    {
      ref: 'tool:search_trains:c2',
      factId: 'f_new',
      kind: 'TRAIN',
      description: 'train Munich → Tallinn 25 Oct, 08:00',
      status: 'new',
      verdict: 'ok',
      reason: '',
      replacedBy: null,
    },
    {
      ref: 'res-hotel',
      factId: 'f_hotel',
      kind: 'HOTEL',
      description: 'hotel in Tallinn, night of 24 Oct',
      status: 'cancel',
      verdict: 'cancelled',
      reason: 'cancelled by the option',
      replacedBy: null,
    },
    {
      ref: 'res-return',
      factId: 'f_return',
      kind: 'TRAIN',
      description: 'train Tallinn → Riga 27 Oct, 18:00',
      status: 'keep',
      verdict: 'redundant',
      reason: 'the driver is already in Riga',
      replacedBy: null,
    },
  ],
  violations: [
    'Booked train Tallinn → Riga 27 Oct, 18:00 is not needed. The option does not cancel it.',
  ],
};

describe('parseItinerary', () => {
  it('reads each leg with its status, problem and replacement', () => {
    const view = parseItinerary(itinerary);
    expect(view?.feasible).toBe(false);
    expect(view?.legs.map((leg) => [leg.status, leg.verdict, leg.replacedBy])).toEqual([
      ['keep', 'missed', 'train Munich → Tallinn 25 Oct, 08:00'],
      ['new', 'ok', null],
      ['cancel', 'cancelled', null],
      ['keep', 'redundant', null],
    ]);
    expect(view?.legs[0].problem).toMatch(/^missed: it departed/);
    expect(view?.legs[2].problem).toBeNull();
    expect(view?.legs[3].problem).toBe('redundant: the driver is already in Riga');
    expect(view?.violations).toHaveLength(1);
  });

  it('is null for cards without an itinerary and tolerates unknown values', () => {
    expect(parseItinerary(undefined)).toBeNull();
    expect(parseItinerary({ feasible: true })).toBeNull();
    const view = parseItinerary({ legs: [{ status: 'odd', verdict: 'odd' }, 'x'] });
    expect(view?.legs).toEqual([
      {
        kind: 'TRAVEL',
        description: 'leg',
        status: 'keep',
        verdict: 'ok',
        problem: null,
        replacedBy: null,
      },
    ]);
  });

  it('reaches the option view, with the cancel target on the step', () => {
    const view = parseOptions({
      items: [
        {
          id: 'A',
          label: 'Rebook the rest of the trip',
          actions: [
            {
              id: 'A1',
              actionClass: 'CANCEL_TRAVEL',
              description: 'Cancel the hotel',
              target: 'res-hotel',
            },
          ],
          itinerary,
        },
        { id: 'B', label: 'Keep', actions: [] },
      ],
    });
    expect(view.items[0].itinerary?.legs).toHaveLength(4);
    expect(view.items[0].actions[0].target).toBe('res-hotel');
    expect(view.items[1].itinerary).toBeNull();
  });
});
