import { describe, expect, it } from 'vitest';

import {
  CLAIM_KINDS,
  claimRows,
  EVIDENCE_LEVELS,
  FACT_KINDS,
  LADDER_CHAINS,
  ladderRows,
  renderLadderForAgents,
  renderLadderForDecisions,
} from '@/lib/evidence';

describe('evidence ladder', () => {
  it('matches the Prisma EvidenceLevel enum order', () => {
    expect([...EVIDENCE_LEVELS]).toEqual([
      'REQUESTED',
      'STATED',
      'QUOTED',
      'PLANNED',
      'BOOKED',
      'OBSERVED',
      'VERIFIED',
    ]);
  });

  it('only references known fact kinds in claim requirements', () => {
    for (const [claim, spec] of Object.entries(CLAIM_KINDS)) {
      for (const requirement of spec.anyOf) {
        for (const kind of requirement.kinds)
          expect(FACT_KINDS, `${claim} → ${kind}`).toHaveProperty(kind);
      }
    }
  });

  it('has a "does not prove" note for every fact kind and covers every domain chain', () => {
    for (const row of ladderRows()) expect(row.doesNotProve.length, row.kind).toBeGreaterThan(0);
    expect(LADDER_CHAINS.map((c) => c.domain)).toEqual(
      expect.arrayContaining([
        'travel',
        'dispatch',
        'location',
        'handover',
        'time',
        'site',
        'documents',
        'alerts',
        'money',
        'agents',
        'absence',
      ])
    );
  });

  it('renders for agents, decisions and the UI', () => {
    const agents = renderLadderForAgents();
    expect(agents).toContain('A booking timeout does not mean "not booked"');
    expect(agents).toContain('| BOARDED |');
    const decisions = renderLadderForDecisions({ domains: ['travel'] });
    expect(decisions).toContain('A quote does not mean space exists now');
    expect(decisions).not.toContain('DKK');
    expect(claimRows().find((r) => r.kind === 'DAMAGE_ATTRIBUTED')?.agentMayAssert).toBe(false);
  });
});
