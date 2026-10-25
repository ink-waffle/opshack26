import { describe, expect, it } from 'vitest';

import { decisionRefusal } from '@/lib/control-room/decide';
import type { DecisionPayload } from '@/lib/playbooks/types';

const options = {
  items: [
    {
      id: 'A',
      label: 'Book the 24 Oct sailing',
      actions: [{ id: 'A1', actionClass: 'BOOK_TRAVEL', description: 'Book.', quoteFactId: 'f_1' }],
      gate: { ok: true, violations: [], warnings: [] },
      blocked: null,
      recommended: true,
    },
    {
      id: 'B',
      label: 'Book and tell the customer it is booked',
      actions: [
        { id: 'B1', actionClass: 'BOOK_TRAVEL', description: 'Book.', quoteFactId: 'f_1' },
        {
          id: 'B2',
          actionClass: 'CUSTOMER_MESSAGE',
          description: 'Tell.',
          message: 'It is booked.',
        },
      ],
      gate: {
        ok: false,
        violations: [{ ruleId: 'G3', message: 'B2: "is booked" asserts BOOKED_CAPACITY' }],
        warnings: [],
      },
      blocked: { ruleId: 'G3', message: 'B2: "is booked" asserts BOOKED_CAPACITY' },
    },
    {
      id: 'C',
      label: 'A plan that does not work',
      actions: [{ id: 'C1', actionClass: 'BOOK_TRAVEL', description: 'Book.', quoteFactId: 'f_2' }],
      gate: {
        ok: false,
        violations: [{ ruleId: 'CHAIN', message: 'Not feasible: late' }],
        warnings: [],
      },
      blocked: { ruleId: 'CHAIN', message: 'Not feasible: late' },
    },
  ],
  recommendation: { optionId: 'A', why: '' },
  agentWillNot: [],
};

const refusal = (args: Partial<DecisionPayload>) =>
  decisionRefusal({ options, decision: { action: 'approve', decidedBy: 'operator', ...args } });

describe('the server refuses decisions the gate does not allow', () => {
  it('approves an unblocked option and refuses a blocked one', () => {
    expect(refusal({ optionId: 'A' })).toBeNull();
    expect(refusal({ optionId: 'B' })).toMatch(/Option B is blocked/);
    expect(refusal({ optionId: 'Z' })).toMatch(/not on this card/);
  });

  it('an edit of a blocked option must skip the blocked step', () => {
    expect(
      refusal({ action: 'edit', optionId: 'B', edits: { messages: { B2: 'Planned.' } } })
    ).toMatch(/Skip step B2/);
    expect(
      refusal({ action: 'edit', optionId: 'B', edits: { removeActionIds: ['B2'] } })
    ).toBeNull();
  });

  it('an option blocked as a whole cannot be approved through an edit', () => {
    expect(refusal({ action: 'edit', optionId: 'C', edits: { removeActionIds: ['C1'] } })).toMatch(
      /nothing to carry out|blocked as a whole/
    );
  });

  it('an edit carries reworded messages or skipped steps, never only a note', () => {
    expect(
      refusal({ action: 'edit', optionId: 'A', note: 'no Helsinki nights, ask the customer first' })
    ).toMatch(/must reword a message or skip a step/);
    expect(refusal({ action: 'edit', optionId: 'A', edits: { messages: { A1: 'x' } } })).toMatch(
      /sends no message/
    );
    expect(refusal({ action: 'edit', optionId: 'A', edits: { removeActionIds: ['B1'] } })).toMatch(
      /not part of option A/
    );
  });

  it('a reject always goes through', () => {
    expect(refusal({ action: 'reject', note: 'wrong sailing' })).toBeNull();
  });
});
