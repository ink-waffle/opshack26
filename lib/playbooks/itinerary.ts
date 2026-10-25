// An option's steps as an itinerary change set, and the checker's result in the card's JSON-safe shape.

import type {
  ItineraryChangeSet,
  ItineraryLeg,
  ItineraryResult,
} from '@/lib/chain/itinerary/types';
import type { CardAction, CardItinerary } from '@/lib/playbooks/types';

type ItineraryAction = Pick<CardAction, 'actionClass' | 'quoteFactId' | 'target' | 'replaces'>;

/** Bookings become new legs (with the booked legs they replace), cancellations cancel their target. */
export function itineraryChangeSet(actions: ItineraryAction[]): ItineraryChangeSet {
  return {
    add: actions.flatMap((action) =>
      action.actionClass === 'BOOK_TRAVEL' && action.quoteFactId
        ? [{ source: 'fact' as const, factId: action.quoteFactId, replaces: action.replaces ?? [] }]
        : []
    ),
    cancel: actions.flatMap((action) =>
      action.actionClass === 'CANCEL_TRAVEL' && action.target ? [action.target] : []
    ),
  };
}

const BROKEN = new Set(['missed', 'unreachable', 'redundant']);

/** Every id (reservation id, booking fact id) of a booked leg the itinerary marks broken or redundant. */
export function brokenLegRefs(result: ItineraryResult): string[] {
  return result.legs
    .filter((leg) => leg.status === 'keep' && BROKEN.has(leg.verdict))
    .flatMap((leg) => [leg.ref, leg.factId].filter((id): id is string => Boolean(id)));
}

function cardLeg(leg: ItineraryLeg): CardItinerary['legs'][number] {
  const { ref, factId, kind, description, status, verdict, reason, replacedBy } = leg;
  return { ref, factId, kind, description, status, verdict, reason, replacedBy };
}

/** The checker's verdict on the whole remaining trip, as the card stores and lists it. */
export function cardItinerary(result: ItineraryResult): CardItinerary {
  return {
    feasible: result.feasible,
    legs: result.legs.map(cardLeg),
    violations: result.violations,
  };
}
