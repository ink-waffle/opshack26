// Upcoming dated commitments of an order (sim time), the default "next commitment" for wait blocks.

import type { OrderBundle } from '@/lib/bahn';
import type { Commitment } from '@/lib/playbooks/types';

export function listCommitments(bundle: OrderBundle): Commitment[] {
  const commitments: Commitment[] = [];
  for (const reservation of bundle.travelReservations) {
    if (reservation.cancelledAt) continue;
    const label = `${reservation.kind.toLowerCase()} ${reservation.routeLabel}`;
    if (reservation.checkInCutoffAt)
      commitments.push({
        at: reservation.checkInCutoffAt,
        reason: `check-in cutoff of the ${label}`,
      });
    commitments.push({ at: reservation.departureAt, reason: `departure of the paid ${label}` });
  }
  for (const window of bundle.timeWindows) {
    if (!window.isSelected) continue;
    const what = window.purpose.toLowerCase().replace(/_/g, ' ');
    commitments.push({ at: window.startAt, reason: `start of the ${what}` });
    commitments.push({ at: window.endAt, reason: `end of the ${what}` });
  }
  return commitments.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function nextCommitment(args: { bundle: OrderBundle; after: Date }): Commitment | null {
  const { bundle, after } = args;
  return listCommitments(bundle).find((commitment) => commitment.at > after) ?? null;
}
