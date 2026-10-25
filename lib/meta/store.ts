// Amendments for the /meta page and the chief dispatcher's approve / reject.

import type { Amendment, AmendmentStatus, Card } from '@/lib/generated/prisma/client';
import { describeCorrection } from '@/lib/meta/load';
import type { Backtest, ParameterSpec } from '@/lib/meta/types';
import { parameterWhitelist } from '@/lib/meta/whitelist';
import { parseDecision } from '@/lib/playbooks/decision';
import { readPlaybookFile } from '@/lib/playbooks/prompt';
import { getPlaybook } from '@/lib/playbooks/registry';
import type { CardOptionsPayload } from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';

export const CHIEF_DISPATCHER = 'chief-dispatcher';

export type AmendmentView = {
  amendment: Amendment;
  playbookTitle: string;
  blockTitle: string | null;
  backtest: Backtest | null;
  source: {
    card: Pick<Card, 'id' | 'title' | 'status' | 'orderId' | 'decidedBy' | 'decidedAt'>;
    orderRef: string | null;
    note: string | null;
    correction: string;
  } | null;
  // INSTRUCTION: the block's instructions and the amendments in force before this one.
  instructions: string | null;
  inForce: Amendment[];
  // PARAMETER: each key with its spec and old → new value.
  parameterChanges: { key: string; spec: ParameterSpec | null; from: number | null; to: number }[];
};

async function sourceOf(cardId: string | null): Promise<AmendmentView['source']> {
  if (!cardId) return null;
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return null;
  let note: string | null = null;
  let correction = '';
  try {
    const decision = parseDecision(card.decision);
    note = decision.note ?? null;
    correction = describeCorrection({
      decision,
      options: (card.options ?? null) as CardOptionsPayload | null,
    });
  } catch {}
  const order = card.orderId
    ? await prisma.bahnOrder.findUnique({
        where: { id: card.orderId },
        select: { reference: true },
      })
    : null;
  return {
    card: {
      id: card.id,
      title: card.title,
      status: card.status,
      orderId: card.orderId,
      decidedBy: card.decidedBy,
      decidedAt: card.decidedAt,
    },
    orderRef: order?.reference ?? null,
    note,
    correction,
  };
}

/** Every amendment with what the /meta page shows: source card, before → after, backtest. */
export async function listAmendmentViews(): Promise<AmendmentView[]> {
  const amendments = await prisma.amendment.findMany({ orderBy: { createdAt: 'desc' } });
  return Promise.all(
    amendments.map(async (amendment) => {
      const definition = getPlaybook(amendment.playbookId);
      const block = definition?.blocks.find((candidate) => candidate.id === amendment.blockId);
      const approvedBefore = amendments
        .filter(
          (other) =>
            other.id !== amendment.id &&
            other.playbookId === amendment.playbookId &&
            other.kind === amendment.kind &&
            other.status === 'APPROVED' &&
            (!other.blockId || other.blockId === amendment.blockId) &&
            (other.decidedAt ?? other.createdAt) <= (amendment.decidedAt ?? new Date())
        )
        .sort((a, b) => (a.decidedAt?.getTime() ?? 0) - (b.decidedAt?.getTime() ?? 0));
      const specs = definition ? parameterWhitelist(definition) : [];
      const params = (amendment.parameters ?? {}) as Record<string, number>;
      const parameterChanges = Object.entries(params).map(([key, to]) => {
        const spec = specs.find((candidate) => candidate.key === key) ?? null;
        const earlier = approvedBefore
          .map((other) => (other.parameters as Record<string, number> | null)?.[key])
          .filter((value): value is number => typeof value === 'number');
        return { key, spec, from: earlier.at(-1) ?? spec?.default ?? null, to };
      });
      return {
        amendment,
        playbookTitle: definition?.title ?? amendment.playbookId,
        blockTitle: block?.title ?? null,
        backtest: (amendment.backtest ?? null) as Backtest | null,
        source: await sourceOf(amendment.sourceCardId),
        instructions:
          definition && block?.instructions
            ? await readPlaybookFile({ definition, file: block.instructions }).catch(() => null)
            : null,
        inForce: approvedBefore,
        parameterChanges,
      };
    })
  );
}

/** The chief dispatcher's decision on a PROPOSED amendment. */
export async function decideAmendment(args: {
  id: string;
  status: Extract<AmendmentStatus, 'APPROVED' | 'REJECTED'>;
  decidedBy?: string;
}): Promise<Amendment> {
  const { id, status, decidedBy = CHIEF_DISPATCHER } = args;
  const amendment = await prisma.amendment.findUnique({ where: { id } });
  if (!amendment) throw new Error(`Amendment ${id} not found`);
  if (amendment.status !== 'PROPOSED') throw new Error(`Amendment ${id} is ${amendment.status}`);
  return prisma.amendment.update({
    where: { id },
    data: { status, decidedBy, decidedAt: new Date() },
  });
}
