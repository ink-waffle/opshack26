// When a decision card expires: on sim time (decide-by plus a margin), with a 24 h real backstop on its token (pure).

import { MINUTE_MS } from '@/lib/clock/math';

// The waitpoint token only guards against a run waiting forever; the sim clock decides when a card is too late.
export const TOKEN_TIMEOUT_MS = 24 * 60 * MINUTE_MS;

export type ExpiryPayload = { expired: true; reason: string; simAt: string };

/** Sim instant the card expires (decide-by + margin), or null when it has no deadline. */
export function cardExpiresAt(args: { decideBy: Date | null; marginMinutes: number }): Date | null {
  const { decideBy, marginMinutes } = args;
  return decideBy ? new Date(decideBy.getTime() + marginMinutes * MINUTE_MS) : null;
}

export function isExpiryPayload(output: unknown): output is ExpiryPayload {
  return Boolean(
    output && typeof output === 'object' && (output as ExpiryPayload).expired === true
  );
}
