import { afterAll, describe, expect, it, vi } from 'vitest';

import type { OrderBundle } from '@/lib/bahn';
import type { Fact } from '@/lib/generated/prisma/client';
import type { GateStepOutput } from '@/lib/playbooks/blocks/gate';
import type { OptionsAnswer } from '@/lib/playbooks/options';
import type { RunContext } from '@/lib/playbooks/types';
import type { FerrySailing } from '@/lib/providers';
import { missedConnectionDefinition } from '@/playbooks/missed-connection/playbook';

// Reads CD-420299 from the DB but writes nothing: facts are projected in memory. `pnpm test:local`.
describe.skipIf(!process.env.DATABASE_URL)('gate step on CD-420299 (integration)', () => {
  const now = new Date('2026-10-21T09:30:00Z');

  afterAll(async () => {
    const { prisma } = await import('@/lib/prismaClient');
    await prisma.$disconnect();
  });

  async function setup(args: { reconciled: boolean }) {
    const { getOrderBundle } = await import('@/lib/bahn');
    const { projectOrderFacts, factIdFor } = await import('@/lib/facts');
    const { ferryFact } = await import('@/lib/playbooks/quotes');
    const bundle = (await getOrderBundle({ ref: 'CD-420299' })) as OrderBundle;
    const asFact = (fact: Omit<Fact, 'recordedAt'>): Fact => ({ ...fact, recordedAt: now });
    const facts: Fact[] = projectOrderFacts({ bundle }).map(asFact);
    const terminal = (name: string, city: string, label: string) => ({
      id: null,
      name,
      city,
      label,
    });
    const sailing: FerrySailing = {
      sailingId: 'sail-test',
      operator: 'Vela Coast Lines',
      from: terminal('West Baltic Vehicle Terminal', 'Hamburg', 'West Baltic terminal'),
      to: terminal('South Finland Vehicle Terminal', 'Helsinki', 'South Finland terminal'),
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
    facts.push(
      asFact({
        ...quote,
        id: factIdFor(quote.dedupeKey),
        value: quote.value as Fact['value'],
        orderId: bundle.order.id,
        runId: 'test',
        dedupeKey: quote.dedupeKey,
      })
    );
    if (args.reconciled)
      facts.push(
        asFact({
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
        })
      );
    const quoteId = factIdFor(quote.dedupeKey);
    const answer = (extraFactIds: string[]): OptionsAnswer => ({
      situation: 'Sold out; later sailing quoted.',
      options: [
        {
          id: 'A',
          template: 'NEW_SAILING_KEEP_CAR',
          slots: {
            ferryQuoteFactId: quoteId,
            hotelQuoteFactIds: [],
            returnTrainQuoteFactId: null,
            driverMessage: 'Your plan: ferry Sat 24 Oct 14:00 CEST, check in by 12:00 CEST.',
          },
          detail: 'Arrives 25 Oct 16:00.',
          factIds: extraFactIds,
        },
      ],
      recommendation: { optionId: 'A', why: 'Keeps the promise.' },
      agentWillNot: [],
    });
    return { bundle, facts, answer };
  }

  function fakeCtx(args: {
    bundle: OrderBundle;
    facts: Fact[];
    first: OptionsAnswer;
    rerun: () => OptionsAnswer;
  }) {
    const rerunAgent = vi.fn(async () => args.rerun());
    const ctx = {
      playbook: missedConnectionDefinition,
      outputs: { find_options: args.first },
      order: args.bundle,
      facts: args.facts,
      simNow: now,
      orderId: args.bundle.order.id,
      orderRef: args.bundle.order.reference,
      params: {},
      services: { rerunAgent, log: () => undefined, refresh: async () => undefined },
    } as unknown as RunContext;
    return { ctx, rerunAgent };
  }

  async function gate() {
    const { gateStep } = await import('@/lib/playbooks/blocks/gate');
    return gateStep({
      id: 'check',
      title: 'check',
      description: 'check',
      optionsFrom: 'find_options',
      next: [],
    });
  }

  it('re-asks once and blocks with G9 while the earlier attempt is unreconciled', async () => {
    const { bundle, facts, answer } = await setup({ reconciled: false });
    const { ctx, rerunAgent } = fakeCtx({
      bundle,
      facts,
      first: answer([]),
      rerun: () => answer([]),
    });
    const output = (await (await gate()).run?.(ctx)) as GateStepOutput;
    expect(rerunAgent).toHaveBeenCalledTimes(1);
    expect(rerunAgent.mock.calls[0]).toEqual([
      expect.objectContaining({ blockId: 'find_options', feedback: expect.stringContaining('G9') }),
    ]);
    expect(output.retried).toBe(true);
    expect(output.options[0].blocked?.ruleId).toBe('G9');
    expect(output.options[0].recommended).toBe(false);
  });

  it('accepts a self-corrected answer after reconciliation', async () => {
    const { bundle, facts, answer } = await setup({ reconciled: true });
    const { ctx, rerunAgent } = fakeCtx({
      bundle,
      facts,
      first: answer(['f_does_not_exist']),
      rerun: () => answer(['f_reconciled']),
    });
    const output = (await (await gate()).run?.(ctx)) as GateStepOutput;
    expect(rerunAgent).toHaveBeenCalledTimes(1);
    expect(output.firstPass[0].violations.map((v) => v.ruleId)).toContain('G11');
    expect(output.options[0].blocked).toBeNull();
    expect(output.options[0].gate.ok).toBe(true);
    expect(output.options[0].recommended).toBe(true);
    expect(Math.round((output.options[0].slackMinutes ?? 0) / 60)).toBe(42);
  });

  it('passes a clean answer without re-asking', async () => {
    const { bundle, facts, answer } = await setup({ reconciled: true });
    const { ctx, rerunAgent } = fakeCtx({
      bundle,
      facts,
      first: answer([]),
      rerun: () => answer([]),
    });
    const output = (await (await gate()).run?.(ctx)) as GateStepOutput;
    expect(rerunAgent).not.toHaveBeenCalled();
    expect(output.options[0].costLabel).toBe('EUR 387.00 ferry');
    expect(output.options[0].approvers).toEqual(['operator']);
  });
});
