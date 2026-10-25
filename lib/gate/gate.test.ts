import { describe, expect, it } from 'vitest';

import { buildOrderBundle, loadBahnDataset } from '@/lib/bahn/testing';
import { projectOrderFacts } from '@/lib/facts/projection';
import type { ProjectedFact } from '@/lib/facts/types';
import { type BahnProposalRow, checkProposal, fromBahnProposal, type Proposal } from '@/lib/gate';

const dataset = loadBahnDataset();
const proposals = dataset.agent_proposals as unknown as BahnProposalRow[];

function factsFor(orderId: string) {
  const bundle = buildOrderBundle({ ref: orderId });
  if (!bundle) throw new Error(orderId);
  return { bundle, facts: projectOrderFacts({ bundle }) };
}

function gate(args: { proposal: BahnProposalRow; payload: 'proposed' | 'final' }) {
  const { proposal, payload } = args;
  const { bundle, facts } = factsFor(proposal.orderId);
  const review = proposal.review as { reviewed_at?: string } | null;
  const now =
    payload === 'final' && review?.reviewed_at ? new Date(review.reviewed_at) : proposal.createdAt;
  const mapped = fromBahnProposal({
    proposal,
    facts,
    now,
    payload,
    orderRef: bundle.order.reference,
  });
  return checkProposal({ proposal: mapped, facts, now });
}

const decision = (p: BahnProposalRow) =>
  (p.review as { decision?: string } | null)?.decision ?? null;

const CORRECTED: Record<string, { order: string; rule: string }> = {
  'agent-x40ab609877909161': { order: 'CD-420020 mark_boarding_confirmed', rule: 'G3' },
  'agent-x3151927d69c76a10': { order: 'CD-420194 use_first_available', rule: 'G5' },
  'agent-xaa0af5ec9f775363': { order: 'CD-420055 attribution', rule: 'G4' },
  'agent-x95169653143f1607': { order: 'CD-420322 restart advice', rule: 'G4' },
};

describe('gate regression on the 14 recorded Bahn proposals', () => {
  it('has 14 proposals: 4 corrected (edited or rejected), 6 approved, 4 pending', () => {
    expect(proposals).toHaveLength(14);
    expect(
      proposals.filter((p) => ['EDITED', 'REJECTED'].includes(decision(p) ?? ''))
    ).toHaveLength(4);
    expect(proposals.filter((p) => decision(p) === 'APPROVED')).toHaveLength(6);
  });

  it.each(Object.entries(CORRECTED))('blocks the corrected proposal %s', (id, expected) => {
    const proposal = proposals.find((p) => p.id === id) as BahnProposalRow;
    const result = gate({ proposal, payload: 'proposed' });
    expect(result.ok, expected.order).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain(expected.rule);
  });

  it.each(
    proposals.filter((p) => decision(p) === 'APPROVED').map((p) => [p.id, p.command, p] as const)
  )('does not block the approved proposal %s (%s)', (_id, _command, proposal) => {
    const result = gate({ proposal, payload: 'proposed' });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it.each(
    proposals.filter((p) => decision(p) === 'EDITED').map((p) => [p.id, p.command, p] as const)
  )(
    "passes the reviewer's final payload of the edited proposal %s (%s)",
    (_id, _command, proposal) => {
      const result = gate({ proposal, payload: 'final' });
      expect(result.violations).toEqual([]);
    }
  );

  it.each(proposals.filter((p) => !decision(p)).map((p) => [p.id, p.command, p] as const))(
    'does not block the pending proposal %s (%s)',
    (_id, _command, proposal) => {
      expect(gate({ proposal, payload: 'proposed' }).violations).toEqual([]);
    }
  );

  it('routes approvals by action class', () => {
    const book = proposals.find((p) => p.id === 'agent-x44051005c0c18aaf') as BahnProposalRow;
    const result = gate({ proposal: book, payload: 'proposed' });
    expect(result.approvalsRequired.map((a) => a.actionClass)).toEqual(['BOOK_TRAVEL']);
    const ask = proposals.find((p) => p.id === 'agent-x95169653143f1607') as BahnProposalRow;
    expect(gate({ proposal: ask, payload: 'final' }).autoAllowed.map((a) => a.actionClass)).toEqual(
      ['ASK_DRIVER']
    );
  });
});

describe('gate rules on synthetic proposals', () => {
  const at = (iso: string) => new Date(iso);
  const cd299 = factsFor('CD-420299').facts;
  const factOf = (facts: ProjectedFact[], recordId: string, kind: string) => {
    const fact = facts.find((f) => f.sourceRef.endsWith(`:${recordId}`) && f.kind === kind);
    if (!fact) throw new Error(`${recordId} ${kind}`);
    return fact;
  };
  const check = (proposal: Proposal, now: Date, facts = cd299, parameters = {}) =>
    checkProposal({ proposal, facts, now, parameters });

  it('G9 locks any purchase after the timed-out 299 attempt but allows asking the provider', () => {
    const quote = factOf(cd299, 'travel-xf29ed1732d895f37', 'FERRY_QUOTE');
    const result = check(
      {
        orderRef: 'CD-420299',
        actions: [
          { class: 'ASK_PROVIDER', summary: 'Reconcile the 07:10 attempt' },
          {
            class: 'BOOK_TRAVEL',
            payload: { travel_option_id: 'travel-xf29ed1732d895f37' },
            evidenceFactIds: [quote.id],
          },
        ],
      },
      at('2026-10-21T08:20:00Z')
    );
    expect(result.violations.filter((v) => v.ruleId === 'G9').map((v) => v.actionIndex)).toEqual([
      1,
    ]);
    expect(result.autoAllowed.map((a) => a.actionIndex)).toEqual([0]);
  });

  it('G9 lifts once a reconciliation fact exists', () => {
    const reconciled: ProjectedFact = {
      ...factOf(cd299, 'agent-x4ac988b20000595f', 'BOOKING_OUTCOME_UNKNOWN'),
      id: 'f_reconciled',
      kind: 'BOOKING_RECONCILED',
      sourceType: 'TOOL',
      sourceRef: 'tool:reconcile_booking:1',
      dedupeKey: 'tool:reconcile:1',
      value: { proposalId: 'agent-x4ac988b20000595f', outcome: 'NO_BOOKING' },
      observedAt: at('2026-10-21T09:05:00Z'),
    };
    const result = check(
      { actions: [{ class: 'BOOK_TRAVEL', payload: { require_fresh_capacity_check: true } }] },
      at('2026-10-21T09:10:00Z'),
      [...cd299, reconciled]
    );
    expect(result.violations).toEqual([]);
  });

  it('G5 warns between 60 and 90 minutes and blocks above 90 (overridable)', () => {
    const quote = factOf(cd299, 'travel-xf29ed1732d895f37', 'FERRY_QUOTE');
    const proposal: Proposal = {
      actions: [
        {
          class: 'BOOK_TRAVEL',
          payload: { travel_option_id: 'travel-xf29ed1732d895f37' },
          evidenceFactIds: [quote.id],
        },
      ],
    };
    const warn = check(proposal, at('2026-10-21T08:10:00Z'));
    expect(warn.violations.filter((v) => v.ruleId === 'G5')).toEqual([]);
    expect(warn.warnings.map((w) => w.ruleId)).toContain('G5');
    expect(check(proposal, at('2026-10-21T08:31:00Z')).violations.map((v) => v.ruleId)).toContain(
      'G5'
    );
    const strict = check(proposal, at('2026-10-21T07:40:00Z'), cd299, { quoteBlockMinutes: 30 });
    expect(strict.violations.map((v) => v.ruleId)).toContain('G5');
  });

  it('G3 blocks presenting a quote as a booking and G1 blocks sending to the customer', () => {
    const quote = factOf(cd299, 'travel-xf29ed1732d895f37', 'FERRY_QUOTE');
    const result = check(
      {
        orderRef: 'CD-420299',
        actions: [
          {
            class: 'CUSTOMER_MESSAGE',
            mode: 'execute',
            text: 'Your car is booked on the Saturday sailing.',
            claims: [{ kind: 'BOOKED_CAPACITY', factIds: [quote.id] }],
          },
        ],
      },
      at('2026-10-21T07:30:00Z')
    );
    expect(result.violations.map((v) => v.ruleId).sort()).toEqual(['G1', 'G3']);
  });

  it('G6 blocks a promise change without customer approval; G7 blocks cancelling before a replacement', () => {
    const result = check(
      {
        actions: [
          {
            class: 'CHANGE_WINDOW',
            payload: {
              window: 'CUSTOMER_DELIVERY_PROMISE',
              new_promise_start_at: '2026-10-28T09:00:00Z',
            },
          },
          { class: 'CHANGE_ASSIGNMENT', payload: { cancel_current: true } },
        ],
      },
      at('2026-10-21T09:00:00Z')
    );
    expect(result.violations.map((v) => [v.ruleId, v.actionIndex])).toEqual([
      ['G6', 0],
      ['G7', 1],
    ]);
    expect(result.approvalsRequired.map((a) => a.actionClass)).toEqual([
      'CHANGE_WINDOW',
      'CHANGE_ASSIGNMENT',
    ]);
  });

  it('G4 keeps stop instructions but blocks operate instructions in a warning case', () => {
    const cd322 = factsFor('CD-420322').facts;
    const now = at('2026-10-21T08:40:00Z');
    const stop = check(
      {
        actions: [
          {
            class: 'ASK_DRIVER',
            text: 'Please do not drive it further. Do not restart the car; send a photo of the warning.',
          },
        ],
      },
      now,
      cd322
    );
    expect(stop.violations).toEqual([]);
    const operate = check(
      {
        actions: [
          {
            class: 'ASK_DRIVER',
            text: 'It should be fine to continue slowly; check the oil first.',
          },
        ],
      },
      now,
      cd322
    );
    expect(operate.violations.map((v) => v.ruleId)).toEqual(['G4', 'G4']);
  });

  it("G4 blocks naming another customer's job to the buyer and G11 blocks unknown fact ids", () => {
    const result = check(
      {
        orderRef: 'CD-420299',
        actions: [
          {
            class: 'CUSTOMER_MESSAGE',
            text: 'The driver is still finishing CD-420326 for another customer.',
          },
          { class: 'READ', evidenceFactIds: ['f_does_not_exist'] },
        ],
      },
      at('2026-10-21T09:00:00Z')
    );
    expect(result.violations.map((v) => v.ruleId)).toEqual(['G4', 'G4', 'G11']);
  });

  it('MONEY is human-only and FORBIDDEN is blocked', () => {
    const result = check(
      { actions: [{ class: 'MONEY', payload: { approve_expense: true } }, { class: 'FORBIDDEN' }] },
      at('2026-10-21T09:00:00Z')
    );
    expect(result.approvalsRequired.map((a) => a.authority)).toEqual(['HUMAN_ONLY']);
    expect(result.violations.map((v) => [v.ruleId, v.actionIndex])).toEqual([['G4', 1]]);
  });
});
