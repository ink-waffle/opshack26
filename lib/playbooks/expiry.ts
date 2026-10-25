// Expires decision cards whose decide-by (plus margin) has passed on the sim clock: completes their waitpoint token.

import { wait } from '@trigger.dev/sdk';

import { simNow } from '@/lib/clock';
import { formatLocal } from '@/lib/evidence/time';
import type { ExpiryPayload } from '@/lib/playbooks/cardExpiry';
import { toJson } from '@/lib/playbooks/json';
import { prisma } from '@/lib/prismaClient';

type HumanInput = { cardId?: string; tokenId?: string; expiresAtSim?: string | null };

export async function expireOverdueCards(): Promise<{
  simNow: string;
  expired: { cardId: string; tokenId: string }[];
}> {
  const now = await simNow();
  const waiting = await prisma.blockRun.findMany({
    where: { kind: 'human', status: 'WAITING' },
    select: { input: true },
  });
  const expired: { cardId: string; tokenId: string }[] = [];
  for (const { input } of waiting) {
    const { cardId, tokenId, expiresAtSim } = (input ?? {}) as HumanInput;
    if (!cardId || !tokenId || !expiresAtSim || new Date(expiresAtSim) > now) continue;
    const payload: ExpiryPayload = {
      expired: true,
      reason: `Nobody decided by ${formatLocal({ at: new Date(expiresAtSim), timeZone: 'Europe/Helsinki' })}`,
      simAt: now.toISOString(),
    };
    // Claim the card first, so a decision clicked at the same moment wins or loses cleanly.
    const claimed = await prisma.card.updateMany({
      where: { id: cardId, status: 'OPEN' },
      data: { status: 'EXPIRED', decision: toJson(payload), decidedAt: now },
    });
    if (!claimed.count) continue;
    await wait.completeToken(tokenId, payload);
    expired.push({ cardId, tokenId });
  }
  return { simNow: now.toISOString(), expired };
}
