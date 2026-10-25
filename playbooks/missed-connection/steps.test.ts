import { describe, expect, it, vi } from 'vitest';

import { hotelFact, munichTallinnBundle, quoteFact } from '@/lib/chain/itinerary/testing';
import { projectOrderFacts } from '@/lib/facts/projection';
import type { FactLike } from '@/lib/facts/types';
import { checkProposal } from '@/lib/gate';
import type { Fact } from '@/lib/generated/prisma/client';
import type { GateStepOutput } from '@/lib/playbooks/blocks/gate';
import type { OptionsAnswer } from '@/lib/playbooks/options';
import type { RunContext } from '@/lib/playbooks/types';
import { missedConnectionDefinition } from '@/playbooks/missed-connection/playbook';
import { gather } from '@/playbooks/missed-connection/steps';

// The owner's example: the driver missed the Munich → Tallinn train and is still in Munich the next morning.
const now = new Date('2026-10-27T07:00:00Z');
const bundle = munichTallinnBundle();
const asFact = (fact: FactLike): Fact =>
  ({
    orderId: bundle.order.id,
    runId: null,
    dedupeKey: null,
    recordedAt: now,
    ...fact,
    observedAt: fact.observedAt ?? now,
  }) as Fact;

const nextDayTrain = quoteFact({
  id: 'f_train_next_day',
  mode: 'TRAIN',
  fromCity: 'Munich',
  toCity: 'Tallinn',
  departureAt: '2026-10-28T05:00:00Z',
  arrivalAt: '2026-10-28T11:30:00Z',
  localTransferHours: 0.5,
  observedAt: now,
});
const munichHotel = hotelFact({
  id: 'f_hotel_munich',
  near: 'Munich',
  checkIn: '2026-10-27',
  nights: 1,
  observedAt: now,
});
const laterReturn = quoteFact({
  id: 'f_return_later',
  mode: 'TRAIN',
  fromCity: 'Tampere',
  toCity: 'Helsinki',
  departureAt: '2026-10-29T13:00:00Z',
  arrivalAt: '2026-10-29T15:00:00Z',
  observedAt: now,
});
const driverSaid: FactLike = {
  id: 'f_driver_munich',
  kind: 'DRIVER_STATEMENT',
  subject: 'message:m-1',
  statement: 'Driver: I missed the 08:00 train, still at Munich Hbf.',
  value: { text: 'I missed the 08:00 train, still at Munich Hbf.' },
  level: 'STATED',
  sourceType: 'BAHN_RECORD',
  sourceRef: 'bahn:messages:m-1',
  observedAt: now,
};
const facts = [
  ...projectOrderFacts({ bundle }),
  nextDayTrain,
  munichHotel,
  laterReturn,
  driverSaid,
].map(asFact);

type Slots = {
  bookings: { quoteFactId: string; replaces: string[] }[];
  cancellations: string[];
};

const answer = (slots: Slots): OptionsAnswer =>
  ({
    situation: 'The driver missed the Munich → Tallinn train.',
    options: [
      {
        id: 'A',
        template: 'REBOOK_REST_OF_TRIP',
        slots: {
          newSailing: null,
          ...slots,
          driverMessage: 'Your plan: hotel in Munich tonight, train Wed 07:00 to Tallinn.',
        },
        detail: 'Next-day train; the ferry still works.',
        factIds: ['f_driver_munich'],
      },
    ],
    recommendation: { optionId: 'A', why: 'Keeps the ferry.' },
    agentWillNot: [],
    driverAt: { city: 'Munich', at: now.toISOString(), factId: 'f_driver_munich' },
  }) as OptionsAnswer;

const forgetful = answer({
  bookings: [
    { quoteFactId: 'f_train_next_day', replaces: ['res-train'] },
    { quoteFactId: 'f_hotel_munich', replaces: [] },
  ],
  cancellations: [],
});
const complete = answer({
  bookings: [
    { quoteFactId: 'f_train_next_day', replaces: ['res-train'] },
    { quoteFactId: 'f_hotel_munich', replaces: [] },
  ],
  cancellations: ['res-hotel-tallinn'],
});

function context(args: { outputs: Record<string, unknown>; rerun?: OptionsAnswer }): RunContext {
  const { outputs, rerun } = args;
  return {
    playbook: missedConnectionDefinition,
    outputs,
    order: bundle,
    facts,
    simNow: now,
    orderId: bundle.order.id,
    orderRef: bundle.order.reference,
    params: {},
    payload: { orderId: bundle.order.id },
    services: {
      rerunAgent: vi.fn(async () => rerun),
      log: () => undefined,
      refresh: async () => undefined,
    },
  } as unknown as RunContext;
}

async function gate(args: { first: OptionsAnswer; rerun?: OptionsAnswer }) {
  const { first, rerun = first } = args;
  const ctx = context({ outputs: { find_options: first }, rerun });
  const block = missedConnectionDefinition.blocks.find((candidate) => candidate.id === 'check');
  return (await block?.run?.(ctx)) as GateStepOutput;
}

describe('missed-connection gate: the whole remaining trip (G12)', () => {
  it('blocks an option that forgets to cancel the redundant Tallinn hotel and names it', async () => {
    const output = await gate({ first: forgetful });
    const [option] = output.options;
    expect(output.retried).toBe(true);
    expect(option.blocked).toMatchObject({ ruleId: 'G12' });
    expect(option.blocked?.message).toContain('hotel in Tallinn');
    expect(option.blocked?.message).toContain('The option does not cancel it.');
    expect(option.itinerary?.feasible).toBe(false);
    expect(output.caught?.[0]).toContain('hotel in Tallinn');
    expect(output.caught?.[0]).toContain('still broke it');
  });

  it('passes the complete plan and lists keep, new and cancel legs for the card', async () => {
    const output = await gate({ first: complete });
    const [option] = output.options;
    expect(option.gate.violations).toEqual([]);
    expect(option.blocked).toBeNull();
    expect(option.itinerary?.feasible).toBe(true);
    const legs = Object.fromEntries(
      (option.itinerary?.legs ?? []).map((leg) => [
        leg.ref ?? leg.factId,
        [leg.status, leg.verdict],
      ])
    );
    expect(legs['res-train']).toEqual(['keep', 'missed']);
    expect(legs['res-hotel-tallinn']).toEqual(['cancel', 'cancelled']);
    expect(legs['res-ferry']).toEqual(['keep', 'ok']);
    expect(option.actions.find((action) => action.actionClass === 'CANCEL_TRAVEL')).toMatchObject({
      target: 'res-hotel-tallinn',
      slot: 'cancellations.0',
    });
  });

  it('a recovered first draft is described as fixed', async () => {
    const output = await gate({ first: forgetful, rerun: complete });
    expect(output.options[0].blocked).toBeNull();
    expect(output.caught?.[0]).toContain('hotel in Tallinn');
    expect(output.caught?.[0]).toContain('the agent fixed it');
  });
});

describe('missed-connection gate: cancel only what is broken or replaced (G7)', () => {
  it('blocks cancelling a booked leg that still works and that nothing replaces', async () => {
    const output = await gate({
      first: answer({
        bookings: [
          { quoteFactId: 'f_train_next_day', replaces: ['res-train'] },
          { quoteFactId: 'f_hotel_munich', replaces: [] },
        ],
        cancellations: ['res-hotel-tallinn', 'res-return'],
      }),
    });
    const ruleIds = output.options[0].gate.violations.map((violation) => violation.ruleId);
    expect(ruleIds).toContain('G7');
    expect(output.options[0].gate.violations.find((v) => v.ruleId === 'G7')?.message).toContain(
      'res-return'
    );
  });

  it('allows cancelling a working leg when the same option books its replacement', async () => {
    const output = await gate({
      first: answer({
        bookings: [
          { quoteFactId: 'f_train_next_day', replaces: ['res-train'] },
          { quoteFactId: 'f_hotel_munich', replaces: [] },
          { quoteFactId: 'f_return_later', replaces: ['res-return'] },
        ],
        cancellations: ['res-hotel-tallinn', 'res-return'],
      }),
    });
    expect(output.options[0].gate.violations.filter((v) => v.ruleId === 'G7')).toEqual([]);
  });

  it('is pure: brokenLegs and a replacing booking open the cancel, nothing else does', () => {
    const cancel = (target: string) => ({
      class: 'CANCEL_TRAVEL' as const,
      payload: { reservation_id: target },
    });
    const g7 = (proposal: Parameters<typeof checkProposal>[0]['proposal']) =>
      checkProposal({ proposal, facts, now }).violations.filter((v) => v.ruleId === 'G7');
    expect(g7({ actions: [cancel('res-hotel-tallinn')] })).toHaveLength(1);
    expect(
      g7({ actions: [cancel('res-hotel-tallinn')], context: { brokenLegs: ['res-hotel-tallinn'] } })
    ).toEqual([]);
    expect(
      g7({
        actions: [
          {
            class: 'BOOK_TRAVEL',
            payload: { quote_fact_id: 'f_return_later', replaces: ['res-return'] },
            evidenceFactIds: ['f_return_later'],
          },
          cancel('res-return'),
        ],
      })
    ).toEqual([]);
    expect(g7({ actions: [cancel('res-nowhere')], context: { brokenLegs: [] } })[0]?.message).toBe(
      'Cancels res-nowhere, which is not a booking on record.'
    );
  });
});

describe('missed-connection gather: the trip baseline', () => {
  it('lists the booked legs every option must address when the records show the loss', async () => {
    const late = new Date('2026-10-28T15:45:00Z');
    const lateBundle = munichTallinnBundle();
    const ctx = {
      ...context({ outputs: {} }),
      order: lateBundle,
      facts: projectOrderFacts({ bundle: lateBundle }).map(asFact),
      simNow: late,
    } as RunContext;
    const output = await gather(ctx);
    expect(output.baseline.legs.length).toBeGreaterThan(0);
    expect(output.mustAddress.every((leg) => leg.status === 'keep')).toBe(true);
    expect(output.lostLeg).toEqual(
      output.mustAddress.find((leg) => leg.verdict !== 'redundant') ?? output.mustAddress[0] ?? null
    );
  });
});
