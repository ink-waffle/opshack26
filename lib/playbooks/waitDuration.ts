// Deadline-aware wait: sleep min(default, minutes until the next commitment − buffer), in sim minutes.

import { MINUTE_MS, simMsToRealMs } from '@/lib/clock/math';
import type { Commitment } from '@/lib/playbooks/types';

export type WaitPlan = {
  simMinutes: number;
  // Real milliseconds to sleep at the current clock speed (paused clock: sim minutes at speed 1).
  realMs: number;
  until: Date;
  shortened: boolean;
  reason: string;
};

function formatTime(args: { at: Date; timeZone: string }) {
  const { at, timeZone } = args;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}

export function computeWaitDuration(args: {
  defaultMinutes: number;
  bufferMinutes: number;
  simNow: Date;
  commitment: Commitment | null;
  speed: number;
  timeZone?: string;
}): WaitPlan {
  const { defaultMinutes, bufferMinutes, simNow, commitment, speed, timeZone = 'UTC' } = args;
  const untilCommitment = commitment
    ? (commitment.at.getTime() - simNow.getTime()) / MINUTE_MS - bufferMinutes
    : Number.POSITIVE_INFINITY;
  const simMinutes = Math.max(0, Math.round(Math.min(defaultMinutes, untilCommitment)));
  const shortened = simMinutes < defaultMinutes;
  const realMsAtSpeed = simMsToRealMs({ simMs: simMinutes * MINUTE_MS, speed });
  const realMs = Number.isFinite(realMsAtSpeed) ? realMsAtSpeed : simMinutes * MINUTE_MS;
  const when = commitment ? `${formatTime({ at: commitment.at, timeZone })} ${timeZone}` : '';
  const reason = !commitment
    ? `waiting ${simMinutes} min (sim): no upcoming commitment`
    : shortened
      ? `waiting ${simMinutes} min (sim) instead of ${defaultMinutes}: ${commitment.reason} at ${when}, ${bufferMinutes} min buffer`
      : `waiting ${simMinutes} min (sim): next commitment (${commitment.reason}) is at ${when}`;
  return {
    simMinutes,
    realMs,
    until: new Date(simNow.getTime() + simMinutes * MINUTE_MS),
    shortened,
    reason,
  };
}
