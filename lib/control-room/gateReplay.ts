// Bahn's 14 recorded agent proposals replayed through the live gate at render time (nothing precomputed).

import { getOrderBundle, type OrderBundle } from '@/lib/bahn';
import { projectOrderFacts } from '@/lib/facts/projection';
import type { ProjectedFact } from '@/lib/facts/types';
import {
  type BahnProposalRow,
  checkProposal,
  fromBahnProposal,
  type GateViolation,
  GUARDRAILS,
} from '@/lib/gate';
import {
  BENIGN_VARIANTS,
  HELD_OUT_BLIND,
  HELD_OUT_VARIANTS,
  type HeldOutVariant,
} from '@/lib/gate/heldOut';
import { plainViolation } from '@/lib/playbooks/blocks/gate';
import { prisma } from '@/lib/prismaClient';

export type OperatorVerdict = 'corrected' | 'approved' | 'pending';

export type ReplayRow = {
  id: string;
  orderRef: string;
  summary: string;
  operator: OperatorVerdict;
  // EDITED or REJECTED for corrected ones, APPROVED, or null while pending.
  decision: string | null;
  operatorNote: string | null;
  blocked: { ruleId: string; title: string; message: string } | null;
  // Corrected and blocked, or approved and passed; null for pending ones.
  agrees: boolean | null;
};

export type ReplayCount = { total: number; blocked: number };

export type GateReplay = {
  rows: ReplayRow[];
  corrected: ReplayCount;
  approved: ReplayCount;
  pending: ReplayCount;
  agreement: { agree: number; total: number };
  rewordings: ReplayCount;
  blind: ReplayCount;
  benign: ReplayCount;
};

const FACT_ID = /\s*\(?\b(?:f_[0-9a-f]{6,}|[a-z]+-x[0-9a-f]{8,})\b\)?/g;

function verdict(review: unknown): {
  operator: OperatorVerdict;
  decision: string | null;
  note: string | null;
} {
  const value = (review ?? null) as { decision?: string; decision_note?: string } | null;
  const decision = value?.decision ?? null;
  return {
    operator:
      decision === 'EDITED' || decision === 'REJECTED'
        ? 'corrected'
        : decision === 'APPROVED'
          ? 'approved'
          : 'pending',
    decision,
    note: value?.decision_note ?? null,
  };
}

function firstBlock(violations: GateViolation[]): ReplayRow['blocked'] {
  const first = violations[0];
  if (!first) return null;
  const plain = plainViolation({ violation: first });
  return {
    ruleId: first.ruleId,
    title:
      (GUARDRAILS as Record<string, { title: string } | undefined>)[first.ruleId]?.title ??
      first.ruleId,
    message: `It ${plain.what.replace(FACT_ID, '').replace(/\s+/g, ' ').trim()}; the rule: ${plain.rule}.`,
  };
}

function gate(args: { proposal: BahnProposalRow; bundle: OrderBundle; facts: ProjectedFact[] }) {
  const { proposal, bundle, facts } = args;
  const now = proposal.createdAt;
  return checkProposal({
    proposal: fromBahnProposal({ proposal, facts, now, orderRef: bundle.order.reference }),
    facts,
    now,
  });
}

/** Replays every recorded proposal (and the held-out rewordings) through checkProposal now. */
export async function replayBahnProposals(): Promise<GateReplay> {
  const proposals = (await prisma.bahnAgentProposal.findMany({
    select: {
      id: true,
      orderId: true,
      command: true,
      proposedPayload: true,
      review: true,
      evidenceRefs: true,
      summary: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })) as BahnProposalRow[];
  const orders = new Map<string, { bundle: OrderBundle; facts: ProjectedFact[] }>();
  for (const orderId of new Set(proposals.map((proposal) => proposal.orderId))) {
    const bundle = await getOrderBundle({ ref: orderId });
    if (bundle) orders.set(orderId, { bundle, facts: projectOrderFacts({ bundle }) });
  }
  const rows: ReplayRow[] = proposals.flatMap((proposal) => {
    const order = orders.get(proposal.orderId);
    if (!order) return [];
    const result = gate({ proposal, ...order });
    const { operator, decision, note } = verdict(proposal.review);
    const blocked = firstBlock(result.violations);
    return [
      {
        id: proposal.id,
        orderRef: order.bundle.order.reference,
        summary: proposal.summary,
        operator,
        decision,
        operatorNote: note,
        blocked,
        agrees: operator === 'pending' ? null : (operator === 'corrected') === Boolean(blocked),
      },
    ];
  });
  const count = (kind: OperatorVerdict): ReplayCount => {
    const of = rows.filter((row) => row.operator === kind);
    return { total: of.length, blocked: of.filter((row) => row.blocked).length };
  };
  // A rewording counts as blocked by its own rule; a benign one counts if anything blocks it.
  const variants = (args: { list: HeldOutVariant[]; anyRule?: boolean }): ReplayCount => {
    const { list, anyRule = false } = args;
    let blocked = 0;
    for (const variant of list) {
      const original = proposals.find((proposal) => proposal.id === variant.proposalId);
      const order = original ? orders.get(original.orderId) : undefined;
      if (!original || !order) continue;
      const result = gate({
        proposal: {
          ...original,
          proposedPayload: variant.payload as BahnProposalRow['proposedPayload'],
        },
        ...order,
      });
      const hit = anyRule
        ? result.violations.length > 0
        : result.violations.some((violation) => violation.ruleId === variant.rule);
      if (hit) blocked += 1;
    }
    return { total: list.length, blocked };
  };
  const decided = rows.filter((row) => row.agrees !== null);
  return {
    rows,
    corrected: count('corrected'),
    approved: count('approved'),
    pending: count('pending'),
    agreement: { agree: decided.filter((row) => row.agrees).length, total: decided.length },
    rewordings: variants({ list: HELD_OUT_VARIANTS }),
    blind: variants({ list: HELD_OUT_BLIND }),
    benign: variants({ list: BENIGN_VARIANTS, anyRule: true }),
  };
}
