import { describe, expect, it, vi } from 'vitest';

import type { OrderBundle } from '@/lib/bahn';
import { buildOrderBundle } from '@/lib/bahn/testing';
import { hotelFact } from '@/lib/chain/itinerary/testing';
import { factIdFor } from '@/lib/facts/ids';
import { projectOrderFacts } from '@/lib/facts/projection';
import type { Fact } from '@/lib/generated/prisma/client';
import { describeCatches, type GateStepOutput, plainViolation } from '@/lib/playbooks/blocks/gate';
import type { OptionsAnswer } from '@/lib/playbooks/options';
import { ferryFact } from '@/lib/playbooks/quotes';
import type { CardOption, RunContext } from '@/lib/playbooks/types';
import type { FerrySailing } from '@/lib/providers';
import { missedConnectionDefinition } from '@/playbooks/missed-connection/playbook';

describe('what the gate caught in the first draft, in plain words', () => {
  it('describes a stale quote and says the agent fixed it', () => {
    const [line] = describeCatches({
      firstPass: [
        {
          optionId: 'A',
          violations: [
            {
              ruleId: 'G5',
              message:
                'A2: Quote f_03cd563f271157 is 125 min old (limit 90); refresh capacity before booking.',
            },
          ],
        },
        { optionId: 'B', violations: [] },
      ],
      final: [{ id: 'A', blocked: null } as CardOption],
    });
    expect(line).toBe(
      'Option A: the first draft tried to book from a quote 2 h 5 min old; the rule “quotes older than 90 min must be re-checked before booking” sent it back, and the agent fixed it.'
    );
  });

  it('says when the option stayed blocked or was dropped', () => {
    const lines = describeCatches({
      firstPass: [
        {
          optionId: 'A',
          violations: [
            {
              ruleId: 'G9',
              message: 'A1: An earlier booking attempt (agent-x4ac988b2) has an unknown outcome.',
            },
          ],
        },
        {
          optionId: 'C',
          violations: [
            {
              ruleId: 'G4',
              message:
                'C2: Forbidden for the agent: liability attribution ("caused by the driver").',
            },
          ],
        },
      ],
      final: [{ id: 'A', blocked: { ruleId: 'G9', message: 'x' } } as CardOption],
    });
    expect(lines[0]).toMatch(/unknown outcome.*still broke it, so the option is shown as blocked/);
    expect(lines[1]).toMatch(/included liability attribution.*dropped that option/);
  });

  it('never leaks fact ids into the plain text', () => {
    const { what } = plainViolation({
      violation: { ruleId: 'CHAIN', message: 'Not feasible: quote f_0abc12345678de is stale' },
    });
    expect(what).not.toMatch(/f_0abc/);
  });
});

describe('gate step on template options (CD-420299 from the dataset, offline)', () => {
  const now = new Date('2026-10-21T09:30:00Z');
  const bundle = buildOrderBundle({ ref: 'CD-420299' }) as OrderBundle;
  const asFact = (fact: Omit<Fact, 'recordedAt'>): Fact => ({ ...fact, recordedAt: now });
  const sailing: FerrySailing = {
    sailingId: 'sail-test',
    operator: 'Vela Coast Lines',
    from: { id: null, name: 'West Baltic Vehicle Terminal', city: 'Hamburg', label: 'West Baltic' },
    to: {
      id: null,
      name: 'South Finland Vehicle Terminal',
      city: 'Helsinki',
      label: 'South Finland',
    },
    departureAt: '2026-10-24T12:00:00.000Z',
    arrivalAt: '2026-10-25T16:00:00.000Z',
    checkInCutoffAt: '2026-10-24T10:00:00.000Z',
    status: 'AVAILABLE',
    vehicleSpaces: 5,
    priceCents: 38700,
    currency: 'EUR',
    basis: 'DATASET_TIMETABLE',
    datasetOptionId: 'travel-xf29ed1732d895f37',
  };
  const quote = ferryFact({
    orderId: bundle.order.id,
    runId: 'test',
    simNow: now,
    tool: 'search_ferries',
    sailing,
    roadTimeToTerminalHours: 7,
  });
  const quoteId = factIdFor(quote.dedupeKey);
  const reconciled = asFact({
    id: 'f_reconciled',
    orderId: bundle.order.id,
    runId: 'test',
    kind: 'BOOKING_RECONCILED',
    subject: 'proposal:agent-x4ac988b20000595f',
    statement: 'Vela Coast Lines has no reservation from the 07:10 request.',
    value: { proposalId: 'agent-x4ac988b20000595f', outcome: 'NO_BOOKING' },
    level: 'OBSERVED',
    sourceType: 'TOOL',
    sourceRef: 'tool:ask_provider:agent-x4ac988b20000595f',
    dedupeKey: 'test:reconciled',
    observedAt: now,
  });
  const facts: Fact[] = [
    ...projectOrderFacts({ bundle }).map(asFact),
    asFact({
      ...quote,
      id: quoteId,
      value: quote.value as Fact['value'],
      orderId: bundle.order.id,
      runId: 'test',
      dedupeKey: quote.dedupeKey,
    }),
    reconciled,
    asFact({
      ...hotelFact({
        id: 'f_hotel_leipzig',
        near: 'Leipzig',
        checkIn: '2026-10-23',
        nights: 1,
        observedAt: now,
      }),
      orderId: bundle.order.id,
      runId: 'test',
      dedupeKey: 'test:hotel',
    } as Omit<Fact, 'recordedAt'>),
  ];
  const answer = (driverMessage: string): OptionsAnswer =>
    ({
      situation: 'Sold out; a later sailing is quoted.',
      options: [
        {
          id: 'A',
          template: 'REBOOK_REST_OF_TRIP',
          slots: {
            newSailing: { quoteFactId: quoteId, replaces: [] },
            bookings: [{ quoteFactId: 'f_hotel_leipzig', replaces: [] }],
            cancellations: [],
            driverMessage,
          },
          detail: 'Arrives Sunday 19:00 EEST.',
          factIds: ['f_reconciled'],
        },
      ],
      recommendation: { optionId: 'A', why: 'Keeps the promise.' },
      agentWillNot: [],
      driverAt: null,
    }) as OptionsAnswer;
  const run = async (args: { first: OptionsAnswer; rerun: OptionsAnswer }) => {
    const rerunAgent = vi.fn(async () => args.rerun);
    const ctx = {
      playbook: missedConnectionDefinition,
      outputs: { find_options: args.first },
      order: bundle,
      facts,
      simNow: now,
      orderId: bundle.order.id,
      orderRef: bundle.order.reference,
      params: {},
      services: { rerunAgent, log: () => undefined, refresh: async () => undefined },
    } as unknown as RunContext;
    const block = missedConnectionDefinition.blocks.find((candidate) => candidate.id === 'check');
    const output = (await block?.run?.(ctx)) as GateStepOutput;
    return { output, rerunAgent };
  };

  it('expands the template into the card option and passes it', async () => {
    const { output, rerunAgent } = await run({
      first: answer('Your plan: ferry Sat 24 Oct 14:00 CEST, check in by 12:00 CEST.'),
      rerun: answer('unused'),
    });
    expect(rerunAgent).not.toHaveBeenCalled();
    const [option] = output.options;
    expect(option.label).toBe('Rebook the rest of the trip: new sailing, 1 booking');
    expect(option.actions.map((action) => `${action.id} ${action.actionClass}`)).toEqual([
      'A1 BOOK_TRAVEL',
      'A2 BOOK_TRAVEL',
      'A3 INSTRUCT_CHANGE',
    ]);
    expect(option.change).toEqual({ type: 'NEW_SAILING', factId: quoteId });
    expect(option.costLabel).toBe('EUR 507.00 (EUR 387.00 ferry + EUR 120.00 hotel)');
    expect(option.gate.violations).toEqual([]);
    expect(option.itinerary?.feasible).toBe(true);
  });

  it('sends a broken slot back once, naming the slot', async () => {
    const { output, rerunAgent } = await run({
      first: answer(''),
      rerun: answer('Your plan: ferry Sat 24 Oct 14:00 CEST, check in by 12:00 CEST.'),
    });
    expect(rerunAgent).toHaveBeenCalledTimes(1);
    expect(rerunAgent.mock.calls[0]).toEqual([
      expect.objectContaining({ feedback: expect.stringContaining('A3 (from driverMessage)') }),
    ]);
    expect(output.retried).toBe(true);
    expect(output.options[0].blocked).toBeNull();
  });
});
