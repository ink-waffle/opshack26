import { describe, expect, it } from 'vitest';

import { applyEdits, approvalProblem, chosenOption, parseDecision } from '@/lib/playbooks/decision';
import type { DecisionPayload } from '@/lib/playbooks/types';
import type { CardOption } from '@/lib/playbooks/types';

const option = (id: string): CardOption => ({
  id,
  label: `Option ${id}`,
  detail: '',
  actions: [
    { id: `${id}1`, actionClass: 'BOOK_TRAVEL', description: 'book', quoteFactId: 'f_1' },
    { id: `${id}2`, actionClass: 'CUSTOMER_MESSAGE', description: 'draft', message: 'Hello' },
  ],
  factIds: ['f_1'],
  chain: null,
  slackMinutes: 2520,
  costLabel: 'EUR 387.00',
  costCents: 38700,
  approvers: ['operator'],
  gate: { ok: true, violations: [], warnings: [] },
  blocked: null,
  reversibility: '',
  recommended: id === 'A',
});

describe('decision payload', () => {
  it('parses the contract and the spike shorthand', () => {
    expect(parseDecision({ action: 'approve', optionId: 'A', decidedBy: 'damir' })).toMatchObject({
      action: 'approve',
      optionId: 'A',
    });
    expect(parseDecision({ decision: 'reject' })).toMatchObject({
      action: 'reject',
      decidedBy: 'unknown',
    });
    expect(() => parseDecision({ action: 'maybe' })).toThrow(/Invalid decision payload/);
  });

  it('refuses a free-text change inside the edits', () => {
    expect(() =>
      parseDecision({
        action: 'edit',
        optionId: 'A',
        edits: { note: 'no Helsinki nights' },
        decidedBy: 'operator',
      })
    ).toThrow(/Invalid decision payload/);
  });

  it('chooses the named option (recommended by default), never a silent fallback', () => {
    const options = [option('A'), option('B')];
    const choose = (decision: Omit<DecisionPayload, 'decidedBy'>, recommendedId?: string) =>
      chosenOption({ options, decision: { ...decision, decidedBy: 'x' }, recommendedId })?.id;
    expect(choose({ action: 'approve', optionId: 'B' })).toBe('B');
    expect(choose({ action: 'approve' }, 'A')).toBe('A');
    expect(choose({ action: 'approve', optionId: 'Q' })).toBeUndefined();
    expect(choose({ action: 'approve' })).toBeUndefined();
    expect(choose({ action: 'reject' }, 'A')).toBeUndefined();
  });

  it('edit replaces message texts and drops actions', () => {
    const edited = applyEdits({
      option: option('A'),
      decision: {
        action: 'edit',
        optionId: 'A',
        edits: { messages: { A2: 'Shorter text' }, removeActionIds: ['A1'] },
        decidedBy: 'x',
      },
    });
    expect(edited.actions).toEqual([
      { id: 'A2', actionClass: 'CUSTOMER_MESSAGE', description: 'draft', message: 'Shorter text' },
    ]);
  });
});

describe('what a decision may carry out', () => {
  const problem = (decision: Omit<DecisionPayload, 'decidedBy'>) =>
    approvalProblem({ option: option('A'), decision: { ...decision, decidedBy: 'x' } });

  it('an edit must reword a message or skip a step; a note alone is refused', () => {
    expect(problem({ action: 'edit', optionId: 'A', note: 'ask the customer first' })).toMatch(
      /must reword a message or skip a step/
    );
    expect(
      problem({ action: 'edit', optionId: 'A', edits: { messages: { A2: 'Hi' } }, note: 'tone' })
    ).toBeNull();
  });

  it('an edit only touches steps of the option, and leaves one to run', () => {
    expect(problem({ action: 'edit', edits: { removeActionIds: ['B1'] } })).toMatch(
      /not part of option A/
    );
    expect(problem({ action: 'edit', edits: { messages: { A1: 'x' } } })).toMatch(/no message/);
    expect(
      problem({ action: 'edit', edits: { messages: { A2: 'x' }, removeActionIds: ['A2'] } })
    ).toMatch(/both reworded and skipped/);
    expect(problem({ action: 'edit', edits: { removeActionIds: ['A1', 'A2'] } })).toMatch(
      /nothing to carry out/
    );
  });

  it('approve and reject carry no edit rules', () => {
    expect(problem({ action: 'approve', optionId: 'A' })).toBeNull();
    expect(problem({ action: 'reject', note: 'no' })).toBeNull();
  });
});
