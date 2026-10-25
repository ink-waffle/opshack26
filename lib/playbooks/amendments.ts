// Approved amendments: INSTRUCTION text goes into agent prompts, PARAMETER values override playbook params.

import type { Amendment } from '@/lib/generated/prisma/client';
import type { PlaybookDefinition } from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';

/** Param defaults with approved PARAMETER amendments applied in approval order. */
export function resolveParams(args: {
  definition: PlaybookDefinition;
  amendments: Amendment[];
}): Record<string, unknown> {
  const { definition, amendments } = args;
  const params: Record<string, unknown> = Object.fromEntries(
    Object.entries(definition.params ?? {}).map(([key, param]) => [key, param.default])
  );
  for (const amendment of amendments)
    if (
      amendment.kind === 'PARAMETER' &&
      amendment.parameters &&
      typeof amendment.parameters === 'object'
    )
      Object.assign(params, amendment.parameters);
  return params;
}

/** Numeric params whose keys exist in `defaults`, e.g. the chain calculator's parameters out of ctx.params. */
export function numericOverrides<T extends Record<string, number>>(args: {
  params: Record<string, unknown>;
  defaults: T;
}): Partial<T> {
  const { params, defaults } = args;
  return Object.fromEntries(
    Object.keys(defaults).flatMap((key) => {
      const value = params[key];
      return typeof value === 'number' && Number.isFinite(value) ? [[key, value]] : [];
    })
  ) as Partial<T>;
}

export async function loadApprovedAmendments(args: { playbookId: string }): Promise<Amendment[]> {
  const { playbookId } = args;
  return prisma.amendment.findMany({
    where: { playbookId, status: 'APPROVED' },
    orderBy: [{ decidedAt: 'asc' }, { createdAt: 'asc' }],
  });
}
