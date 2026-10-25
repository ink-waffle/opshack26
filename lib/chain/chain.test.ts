import { describe, expect, it } from 'vitest';

import { buildDriverDuties, buildOrderBundle, buildOrderDriverDuties } from '@/lib/bahn/testing';
import { buildCtx, computeChain, deriveDecideBy } from '@/lib/chain/compute';
import { checkItinerary } from '@/lib/chain/itinerary';
import { reservationRow, syntheticBundle } from '@/lib/chain/itinerary/testing';
import { type ChainOption, DEFAULT_CHAIN_PARAMETERS } from '@/lib/chain/types';
import { bahnDedupeKey, factIdFor } from '@/lib/facts/ids';
import { projectOrderFacts } from '@/lib/facts/projection';

// Dataset snapshot time; evaluation.md's numbers are computed at this moment.
const now = new Date('2026-10-21T09:00:00Z');

function chain(ref: string, option: ChainOption, extraDrivers: string[] = []) {
  const bundle = buildOrderBundle({ ref });
  if (!bundle) throw new Error(ref);
  const duties = [
    ...buildOrderDriverDuties({ bundle }),
    ...extraDrivers.map((driverId) => buildDriverDuties({ driverId })),
  ];
  return computeChain({ bundle, option, now, duties });
}

describe('chain calculator against evaluation.md', () => {
  it('CD-420299: the 24 Oct 12:00 sailing keeps the promise with ~42 h slack, locked by G9', () => {
    const result = chain('CD-420299', {
      type: 'NEW_SAILING',
      travelOptionId: 'travel-xf29ed1732d895f37',
    });
    expect(result.feasible).toBe(true);
    expect(result.promise.keepsPromise).toBe(true);
    expect(result.promise.slackHours).toBeCloseTo(42, 0);
    expect(result.promise.verdict).toBe('early');
    expect(result.promise.custodyNights).toBe(2);
    expect(result.promise.source).toBe('CUSTOMER');
    const ferry = result.bookings.create.find((b) => b.mode === 'FERRY');
    expect(ferry?.quoteAgeMinutes).toBe(120);
    expect(ferry?.quoteFreshness).toBe('stale');
    expect(result.bookings.create.find((b) => b.mode === 'HOTEL')?.nights).toBe(1);
    expect(result.cost.eurCents).toBe(38700);
    expect(result.locks.join(' ')).toContain('agent-x4ac988b20000595f');
    expect(result.approvals).toContain('BOOK_TRAVEL');
    expect(result.approvals).not.toContain('CHANGE_WINDOW');
  });

  it('CD-420154: ~20 h slack on the 25 Oct sailing, the 26 Oct one breaks, positioning train must be bought today', () => {
    const keeps = chain('CD-420154', {
      type: 'NEW_SAILING',
      travelOptionId: 'travel-xfdc7bc8969cfb3d0',
    });
    expect(keeps.promise.slackHours).toBeCloseTo(20, 0);
    expect(keeps.promise.keepsPromise).toBe(true);
    expect(keeps.promise.customerAgreed).toBe(false);
    expect(keeps.decideBy?.kind).toBe('POSITIONING_PURCHASE');
    expect(keeps.decideBy?.at.toISOString()).toBe('2026-10-21T21:00:00.000Z');
    expect(keeps.decideBy?.factId).toBe(
      factIdFor(
        bahnDedupeKey({
          collection: 'travel_options',
          recordId: 'travel-x857e37e888660bca',
          kind: 'TRAVEL_QUOTE',
        })
      )
    );
    const breaks = chain('CD-420154', {
      type: 'NEW_SAILING',
      travelOptionId: 'travel-xae55f19d2d6ecd88',
    });
    expect(breaks.promise.verdict).toBe('breaks');
    expect(breaks.approvals).toEqual(expect.arrayContaining(['CHANGE_WINDOW', 'CUSTOMER_MESSAGE']));
  });

  it('CD-420449: decide by 10:25, the first paid leg; replacing the driver puts EUR 368.79 at stake', () => {
    const bundle = buildOrderBundle({ ref: 'CD-420449' });
    if (!bundle) throw new Error('CD-420449');
    const { decideBy } = deriveDecideBy({ bundle, now });
    expect(decideBy?.at.toISOString()).toBe('2026-10-21T10:25:00.000Z');
    expect(decideBy?.kind).toBe('FIRST_PAID_DEPARTURE');
    expect(decideBy?.factId).toBe(
      factIdFor(
        bahnDedupeKey({
          collection: 'travel_reservations',
          recordId: 'res-x0320cdf029cd4c96',
          kind: 'TRAVEL_BOOKING',
        })
      )
    );
    const replace = chain('CD-420449', { type: 'REPLACE_DRIVER', driverId: 'drv-001' }, [
      'drv-001',
    ]);
    expect(replace.bookings.cancel.map((b) => b.ref)).toEqual([
      'res-x0320cdf029cd4c96',
      'res-xe71985ace48030a6',
      'res-xbdba16c24ca9005e',
    ]);
    expect(replace.bookings.cancel.every((b) => b.refundability === 'unknown')).toBe(true);
    expect(replace.bookings.cancel.reduce((sum, b) => sum + (b.costCents ?? 0), 0)).toBe(36879);
    expect(replace.approvals).toEqual(
      expect.arrayContaining(['MARKET', 'CHANGE_ASSIGNMENT', 'CANCEL_TRAVEL'])
    );
    expect(replace.driverChain?.driverId).toBe('drv-001');
  });

  it('CD-420089: the positioning record names CD-420576 but CD-420719 comes in between', () => {
    const result = chain('CD-420089', { type: 'NO_CHANGE' });
    expect(result.driverChain?.flags.positioning_record_mismatch).toBe(true);
    expect(result.driverChain?.previous?.orderRef).toBe('CD-420719');
    expect(result.driverChain?.previous?.endCity).toBe('Helsinki');
    expect(result.driverChain?.positioningRecord?.plannedReleaseCity).toBe('Lahti');
    expect(result.driverChain?.notes.join(' ')).toContain('CD-420576');
  });

  it('flags no mismatch when the positioning record matches the chain (CD-420399)', () => {
    const result = chain('CD-420399', {
      type: 'MOVE_PICKUP_SLOT',
      startAt: new Date('2026-10-22T12:00:00Z'),
      endAt: new Date('2026-10-22T14:00:00Z'),
    });
    expect(result.driverChain?.flags.positioning_record_mismatch).toBe(false);
    expect(result.promise.keepsPromise).toBe(true);
    expect(result.approvals).toEqual(['CHANGE_WINDOW', 'CUSTOMER_MESSAGE']);
    expect(result.notify.map((n) => n.party)).toEqual(['site', 'driver', 'customer']);
  });

  it('uses the driver stated limit as decide-by (CD-420593: 08:27)', () => {
    const bundle = buildOrderBundle({ ref: 'CD-420593' });
    if (!bundle) throw new Error('CD-420593');
    const { candidates } = deriveDecideBy({ bundle, now: new Date('2026-10-21T08:00:00Z') });
    const limit = candidates.find((c) => c.kind === 'DRIVER_STATED_LIMIT');
    expect(limit?.at.toISOString()).toBe('2026-10-21T08:27:00.000Z');
  });

  it('accepts a fresh tool quote fact for a sailing and borrows road time from the linked option', () => {
    const bundle = buildOrderBundle({ ref: 'CD-420299' });
    if (!bundle) throw new Error('CD-420299');
    const tool = {
      id: 'f_tool_quote',
      kind: 'FERRY_QUOTE',
      subject: 'ferry:sail-1',
      statement: 'Quote only, not booked: 24 Oct 12:00 sailing.',
      level: 'QUOTED' as const,
      sourceType: 'TOOL' as const,
      sourceRef: 'tool:search_ferries:sail-1',
      observedAt: new Date('2026-10-21T08:55:00Z'),
      value: {
        mode: 'FERRY',
        fromCity: 'West Baltic terminal',
        toCity: 'South Finland terminal',
        departureAt: '2026-10-24T12:00:00.000Z',
        arrivalAt: '2026-10-25T16:00:00.000Z',
        checkInCutoffAt: '2026-10-24T10:00:00.000Z',
        checkedAt: '2026-10-21T08:55:00.000Z',
        quoteCents: 38700,
        currency: 'EUR',
        datasetOptionId: 'travel-xf29ed1732d895f37',
      },
    };
    const result = computeChain({
      bundle,
      facts: [...projectOrderFacts({ bundle }), tool],
      option: { type: 'NEW_SAILING', factId: 'f_tool_quote' },
      now,
    });
    expect(result.bookings.create[0]).toMatchObject({
      factId: 'f_tool_quote',
      quoteFreshness: 'fresh',
    });
    expect(result.bookings.create.find((b) => b.mode === 'HOTEL')?.nights).toBe(1);
    expect(result.promise.slackHours).toBeCloseTo(42, 0);
    expect(result.locks).toHaveLength(1);
  });

  it('is deterministic', () => {
    const option: ChainOption = { type: 'NEW_SAILING', travelOptionId: 'travel-xf29ed1732d895f37' };
    expect(JSON.stringify(chain('CD-420299', option))).toBe(
      JSON.stringify(chain('CD-420299', option))
    );
  });
});

describe('cancellations through our tools', () => {
  const hotel = reservationRow({
    id: 'res-hotel',
    kind: 'HOTEL',
    city: 'Tallinn',
    departureAt: new Date('2026-10-27T18:30:00Z'),
    expectedArrivalAt: new Date('2026-10-28T06:00:00Z'),
  });
  const train = reservationRow({
    id: 'res-train',
    kind: 'TRAIN',
    fromCity: 'Munich',
    toCity: 'Tallinn',
    departureAt: new Date('2026-10-27T06:00:00Z'),
    expectedArrivalAt: new Date('2026-10-27T18:00:00Z'),
  });
  const bundle = syntheticBundle({
    pickup: {
      city: 'Tallinn',
      timezone: 'Europe/Tallinn',
      startAt: new Date('2026-10-28T07:00:00Z'),
      endAt: new Date('2026-10-28T15:00:00Z'),
    },
    delivery: {
      city: 'Tampere',
      timezone: 'Europe/Helsinki',
      startAt: new Date('2026-10-29T07:00:00Z'),
      endAt: new Date('2026-10-29T10:00:00Z'),
    },
    reservations: [train, hotel],
  });
  const cancelled = (observedAt: string) => ({
    id: 'f_cancel',
    kind: 'TRAVEL_CANCELLED',
    subject: 'hotel:res-hotel',
    statement: 'Cancelled (simulated).',
    value: { status: 'CANCELLED', reservationId: 'res-hotel', bookingFactId: null },
    level: 'BOOKED' as const,
    sourceType: 'TOOL' as const,
    sourceRef: 'tool:cancel_travel:CXL-1',
    observedAt: new Date(observedAt),
  });
  const live = (observedAt: string) =>
    buildCtx({
      bundle,
      facts: [cancelled(observedAt)],
      now: new Date('2026-10-26T12:00:00Z'),
      params: DEFAULT_CHAIN_PARAMETERS,
    }).reservations.map((r) => r.id);

  it('a TRAVEL_CANCELLED fact drops the reservation like Bahn’s cancelledAt', () => {
    expect(live('2026-10-26T11:00:00Z')).toEqual(['res-train']);
  });

  it('a cancellation recorded after now does not count yet', () => {
    expect(live('2026-10-26T13:00:00Z')).toEqual(['res-train', 'res-hotel']);
  });

  const ourTrain = {
    id: 'f_our_train',
    kind: 'TRAVEL_BOOKING',
    subject: 'train:conn-1',
    statement: 'Booked (simulated): Northrail ticket Tallinn → Tampere.',
    value: {
      mode: 'TRAIN',
      status: 'BOOKED',
      provider: 'Northrail',
      fromCity: 'Tallinn',
      toCity: 'Tampere',
      departureAt: '2026-10-29T12:00:00Z',
      arrivalAt: '2026-10-29T15:00:00Z',
      bookingReference: 'TRN-OURS',
      quoteFactId: 'f_quote_train',
    },
    level: 'BOOKED' as const,
    sourceType: 'TOOL' as const,
    sourceRef: 'tool:book_train:TRN-OURS',
    observedAt: new Date('2026-10-26T10:00:00Z'),
  };
  const ourLegs = (args: {
    facts: Parameters<typeof checkItinerary>[0]['facts'];
    cancel?: string[];
  }) =>
    checkItinerary({
      bundle,
      facts: args.facts,
      now: new Date('2026-10-26T12:00:00Z'),
      changeSet: { cancel: args.cancel },
    }).legs.filter((leg) => leg.factId === 'f_our_train');

  it('the itinerary keeps a booking made through our tools until a TRAVEL_CANCELLED names it', () => {
    expect(ourLegs({ facts: [ourTrain] }).map((leg) => leg.status)).toEqual(['keep']);
    expect(
      ourLegs({ facts: [ourTrain], cancel: ['f_our_train'] }).map((leg) => leg.status)
    ).toEqual(['cancel']);
    const cancelledOurs = {
      ...cancelled('2026-10-26T11:00:00Z'),
      value: { status: 'CANCELLED', reservationId: null, bookingFactId: 'f_our_train' },
    };
    expect(ourLegs({ facts: [ourTrain, cancelledOurs] })).toEqual([]);
  });
});
