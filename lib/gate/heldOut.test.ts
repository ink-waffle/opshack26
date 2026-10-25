import { describe, expect, it } from 'vitest';

import { buildOrderBundle, loadBahnDataset } from '@/lib/bahn/testing';
import { projectOrderFacts } from '@/lib/facts/projection';
import { type BahnProposalRow, checkProposal, fromBahnProposal } from '@/lib/gate';
import { BENIGN_VARIANTS, HELD_OUT_BLIND, HELD_OUT_VARIANTS } from '@/lib/gate/heldOut';

const dataset = loadBahnDataset();
const proposals = dataset.agent_proposals as unknown as BahnProposalRow[];

function gate(proposal: BahnProposalRow) {
  const bundle = buildOrderBundle({ ref: proposal.orderId });
  if (!bundle) throw new Error(proposal.orderId);
  const facts = projectOrderFacts({ bundle });
  const now = proposal.createdAt;
  return checkProposal({
    proposal: fromBahnProposal({ proposal, facts, now, orderRef: bundle.order.reference }),
    facts,
    now,
  });
}

function run(variants: typeof HELD_OUT_VARIANTS) {
  return variants.map((variant) => {
    const original = proposals.find((p) => p.id === variant.proposalId) as BahnProposalRow;
    const result = gate({ ...original, proposedPayload: variant.payload } as BahnProposalRow);
    return { variant, rules: result.violations.map((v) => v.ruleId) };
  });
}

function report(name: string, results: ReturnType<typeof run>) {
  const caught = results.filter((r) => r.rules.includes(r.variant.rule));
  console.info(
    `${name}: ${caught.length}/${results.length} blocked\n${results.map((r) => `${r.rules.includes(r.variant.rule) ? 'BLOCKED' : 'PASSES '} ${r.variant.rule} ${r.variant.label} → [${r.rules.join(', ')}]`).join('\n')}`
  );
  return caught.length;
}

describe('held-out rewordings of the 4 corrected Bahn proposals', () => {
  it('blocks every rewording of the first set (the rules were generalised on it)', () => {
    expect(report('held-out set 1', run(HELD_OUT_VARIANTS))).toBe(HELD_OUT_VARIANTS.length);
  });

  // First run (before any fix): 9/12; the 3 misses were then fixed generically, so this set is no longer blind.
  it('blocks the blind set after the generic fixes', () => {
    expect(report('blind set', run(HELD_OUT_BLIND))).toBe(HELD_OUT_BLIND.length);
  });

  it('does not block rewordings that keep the approved meaning', () => {
    const results = run(BENIGN_VARIANTS);
    report('benign set (should pass)', results);
    expect(results.filter((r) => r.rules.length).map((r) => r.variant.label)).toEqual([]);
  });
});
