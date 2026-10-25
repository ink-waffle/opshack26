// Deterministic steps of the missed-connection playbook: gather (with the trip baseline), decision card, close.

import { z } from 'zod';

import { deriveDecideBy } from '@/lib/chain/compute';
import { checkItinerary, type ItineraryStart } from '@/lib/chain/itinerary';
import { factValue } from '@/lib/facts';
import type { Fact } from '@/lib/generated/prisma/client';
import type { GateStepOutput } from '@/lib/playbooks/blocks/gate';
import { latestDecision } from '@/lib/playbooks/blocks/human';
import { cardItinerary } from '@/lib/playbooks/itinerary';
import { type OptionsAnswer, optionsAnswerSchema } from '@/lib/playbooks/options';
import type { CardDraft, CardItinerary, CardItineraryLeg, RunContext } from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';
import { MISSED_CONNECTION_TEMPLATES } from '@/playbooks/missed-connection/templates';

const HOUR_MS = 3_600_000;

const ref = (fact: Fact) => ({ factId: fact.id, statement: fact.statement });

export const connectionOptionsSchema = optionsAnswerSchema(MISSED_CONNECTION_TEMPLATES).extend({
  driverAt: z
    .object({
      city: z.string().describe('The city (or ferry terminal) the driver is in now.'),
      at: z.string().describe('When they said so, ISO 8601 with offset.'),
      factId: z.string().describe('The fact id of the driver statement that says so.'),
    })
    .nullable()
    .describe(
      'Where the driver is now, from their own message (e.g. "still in Munich", "at the terminal, gate closed"); null when nobody said. The trip check starts from here.'
    ),
});

export type ConnectionOptionsAnswer = OptionsAnswer & {
  driverAt: { city: string; at: string; factId: string } | null;
};

/** Where the trip check starts: the driver's own word, when the agent cites a statement on file. */
export function driverStart(args: {
  ctx: RunContext;
  answer: OptionsAnswer;
}): ItineraryStart | undefined {
  const { ctx, answer } = args;
  const position = (answer as ConnectionOptionsAnswer).driverAt;
  if (!position || !ctx.facts.some((fact) => fact.id === position.factId)) return undefined;
  const at = new Date(position.at);
  return Number.isNaN(at.getTime()) ? undefined : { city: position.city, at };
}

export type GatherOutput = {
  // The whole remaining trip from the records alone (no change), and where it places the driver.
  baseline: CardItinerary & { start: { city: string | null; at: string | null; basis: string } };
  // Booked legs the baseline marks missed, unreachable or redundant: every option must replace or cancel each.
  mustAddress: CardItineraryLeg[];
  // The first broken booked leg (what the run is about), when the records show one.
  lostLeg: CardItineraryLeg | null;
  route: { fromTerminal: string; toTerminal: string } | null;
  roadHoursToTerminal: number | null;
  pickupSlot: { startAt: string; endAt: string; timezone: string; factId: string | null } | null;
  earliestAtTerminal: string | null;
  promise: { startAt: string; endAt: string; timezone: string; factId: string | null } | null;
  driver: { id: string; name: string | null; homeCity: string | null } | null;
  soldOut: { factId: string; statement: string }[];
  quotes: { factId: string; statement: string }[];
  bookedFerries: { factId: string; statement: string }[];
  unknownAttempts: {
    factId: string;
    proposalId: string | null;
    travelOptionId: string | null;
    attemptedAt: string | null;
    error: string | null;
  }[];
  decideBy: { at: string; reason: string; label: string } | null;
  // The message or record the watchman routed here (e.g. the driver at the terminal: "the sailing is full").
  reported: { factId: string | null; statement: string } | null;
  needsReconcile: boolean;
  nothingToDo: boolean;
};

function windowFact(args: { facts: Fact[]; windowId: string }): string | null {
  const { facts, windowId } = args;
  return facts.find((fact) => factValue(fact, 'windowId') === windowId)?.id ?? null;
}

/** The message or record that started this run, when the watchman routed one (monitor hits report nothing). */
async function reportedItem(ctx: RunContext): Promise<GatherOutput['reported']> {
  const signalId = ctx.payload.signalId;
  if (!signalId) return null;
  const signal = await prisma.signal.findUnique({ where: { id: signalId } });
  if (!signal?.sourceRef || signal.source === 'monitor') return null;
  const recordId = signal.sourceRef.split(':').at(-1) ?? signal.sourceRef;
  const fact = ctx.facts.find((candidate) => candidate.sourceRef.endsWith(`:${recordId}`));
  return {
    factId: fact?.id ?? null,
    statement: fact?.statement ?? `New ${signal.source}: ${signal.sourceRef}`,
  };
}

/** The trip baseline, ferry legs, bookings, unknown-outcome attempts, slot, promise and the earliest time at the terminal. */
export async function gather(ctx: RunContext): Promise<GatherOutput> {
  const { order: bundle, facts, simNow } = ctx;
  const trip = checkItinerary({ bundle, facts, now: simNow });
  const baseline = cardItinerary(trip);
  const mustAddress = baseline.legs.filter(
    (leg) => leg.status === 'keep' && ['missed', 'unreachable', 'redundant'].includes(leg.verdict)
  );
  const ferryOptions = bundle.travelOptions.filter((option) => option.kind === 'FERRY');
  const first = ferryOptions[0];
  const reconciled = facts.filter((fact) => fact.kind === 'BOOKING_RECONCILED');
  const unknownAttempts = facts
    .filter((fact) => fact.kind === 'BOOKING_OUTCOME_UNKNOWN')
    .filter(
      (attempt) =>
        !reconciled.some(
          (answer) =>
            answer.observedAt >= attempt.observedAt &&
            factValue(answer, 'proposalId') === factValue(attempt, 'proposalId')
        )
    );
  const slot = bundle.timeWindows.find((w) => w.purpose === 'SELECTED_PICKUP_SLOT' && w.isSelected);
  const promise = bundle.timeWindows.find(
    (w) => w.purpose === 'CUSTOMER_DELIVERY_PROMISE' && w.isSelected
  );
  const roadHours = first?.roadTimeToTerminalHours ?? null;
  const earliest =
    slot && roadHours !== null ? new Date(slot.endAt.getTime() + roadHours * HOUR_MS) : null;
  const assignment = bundle.assignments.find((a) => a.status !== 'CANCELLED');
  const bookedFerries = facts.filter(
    (fact) => fact.kind === 'FERRY_BOOKING' && factValue(fact, 'status') === 'BOOKED'
  );
  const soldOut = facts.filter((fact) => fact.kind === 'FERRY_SOLD_OUT');
  const { decideBy } = deriveDecideBy({ bundle, facts, now: simNow });
  const reported = await reportedItem(ctx);
  return {
    baseline: {
      ...baseline,
      start: {
        city: trip.start.city,
        at: trip.start.at?.toISOString() ?? null,
        basis: trip.start.basis,
      },
    },
    mustAddress,
    lostLeg: mustAddress.find((leg) => leg.verdict !== 'redundant') ?? mustAddress[0] ?? null,
    route: first ? { fromTerminal: first.fromCity, toTerminal: first.toCity } : null,
    roadHoursToTerminal: roadHours,
    pickupSlot: slot
      ? {
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
          timezone: slot.timezone,
          factId: windowFact({ facts, windowId: slot.id }),
        }
      : null,
    earliestAtTerminal:
      earliest && earliest > simNow ? earliest.toISOString() : simNow.toISOString(),
    promise: promise
      ? {
          startAt: promise.startAt.toISOString(),
          endAt: promise.endAt.toISOString(),
          timezone: promise.timezone,
          factId: windowFact({ facts, windowId: promise.id }),
        }
      : null,
    driver: assignment
      ? {
          id: assignment.driverId,
          name: assignment.driver?.displayName ?? null,
          homeCity: assignment.driver?.homeCity ?? null,
        }
      : null,
    soldOut: soldOut.map(ref),
    quotes: facts.filter((fact) => fact.kind === 'FERRY_QUOTE').map(ref),
    bookedFerries: bookedFerries.map(ref),
    unknownAttempts: unknownAttempts.map((attempt) => ({
      factId: attempt.id,
      proposalId: factValue<string>(attempt, 'proposalId'),
      travelOptionId: factValue<string>(attempt, 'travelOptionId'),
      attemptedAt: factValue<string>(attempt, 'attemptedAt'),
      error: factValue<string>(attempt, 'error'),
    })),
    decideBy: decideBy
      ? { at: decideBy.at.toISOString(), reason: decideBy.reason, label: decideBy.label }
      : null,
    reported,
    needsReconcile: unknownAttempts.length > 0,
    // Nothing to do only when a ferry is booked, the trip works out and nobody reported a problem.
    nothingToDo:
      bookedFerries.length > 0 &&
      trip.feasible &&
      soldOut.length === 0 &&
      unknownAttempts.length === 0 &&
      !reported,
  };
}

/** G9 status for the card, in plain words (the attempt and the provider's answer stay on the cited facts). */
function lockNotes(ctx: RunContext): string[] {
  const gathered = ctx.outputs.gather as GatherOutput;
  return gathered.unknownAttempts.map((attempt) => {
    const answer = ctx.facts.find(
      (fact) =>
        fact.kind === 'BOOKING_RECONCILED' && factValue(fact, 'proposalId') === attempt.proposalId
    );
    const outcome = answer ? String(factValue(answer, 'outcome') ?? '') : '';
    const words =
      outcome === 'NO_BOOKING'
        ? 'it made no booking'
        : outcome === 'BOOKING_EXISTS'
          ? 'a booking exists, so keep it'
          : outcome.replace('_', ' ').toLowerCase();
    return answer
      ? `Buying was locked until the ferry company confirmed what the timed-out booking attempt did: ${words}. Lock released (guardrail G9).`
      : 'Buying stays locked: the ferry company has not yet confirmed what the timed-out booking attempt did (guardrail G9).';
  });
}

const LOST_WORDS: Record<string, string> = {
  missed: 'missed',
  unreachable: 'can no longer be reached',
  redundant: 'no longer needed',
};

/** What is wrong with the trip, in a few words (the card title). */
export function connectionProblem(gathered: GatherOutput): string {
  const soldOut = gathered.soldOut.length > 0;
  const unknown = gathered.unknownAttempts.length > 0;
  const lost = gathered.lostLeg;
  if (soldOut && unknown) return 'Ferry sold out, booking attempt timed out';
  if (unknown) return 'Ferry booking attempt timed out, outcome unknown';
  if (lost)
    return `${lost.description.charAt(0).toUpperCase()}${lost.description.slice(1)} ${LOST_WORDS[lost.verdict] ?? lost.verdict}`;
  if (soldOut) return 'Ferry sold out, no crossing booked';
  if (gathered.reported && gathered.bookedFerries.length) return 'Driver may miss the booked ferry';
  if (gathered.reported) return 'Driver reports a lost connection';
  if (gathered.route && !gathered.bookedFerries.length) return 'No ferry crossing booked yet';
  return 'The trip needs repair';
}

/** Decision card from the gated options: decide-by is the earliest feasible commitment of the recommended option. */
export async function buildCard(ctx: RunContext): Promise<CardDraft> {
  const gated = ctx.outputs.check as GateStepOutput;
  const gathered = ctx.outputs.gather as GatherOutput;
  const recommended = gated.options.find((option) => option.recommended) ?? null;
  type Deadline = { at: Date | string; kind?: string; reason: string; label: string };
  const chain = recommended?.chain as { decideByCandidates?: Deadline[] } | undefined;
  // An option that brings in a new driver does not wait on the current driver's positioning ticket.
  const newDriver = Boolean(
    recommended?.actions.some((action) => action.actionClass === 'MARKET') ||
    recommended?.change?.type === 'REPLACE_DRIVER'
  );
  const fits = (candidate: Deadline) => !newDriver || candidate.kind !== 'POSITIONING_PURCHASE';
  const orderDecideBy = deriveDecideBy({ bundle: ctx.order, facts: ctx.facts, now: ctx.simNow });
  const decideBy =
    chain?.decideByCandidates?.find(fits) ?? orderDecideBy.candidates.find(fits) ?? null;
  const position = (gated.answer as ConnectionOptionsAnswer).driverAt;
  const factIds = [
    ...gated.options.flatMap((option) => option.factIds),
    ...(position && ctx.facts.some((fact) => fact.id === position.factId) ? [position.factId] : []),
    ...gathered.unknownAttempts.map((attempt) => attempt.factId),
    ...gathered.soldOut.map((fact) => fact.factId),
  ];
  const blockedNotes = gated.options
    .filter((option) => option.blocked)
    .map(
      (option) =>
        `Option ${option.id} is blocked by ${option.blocked?.ruleId}: ${option.blocked?.message}`
    );
  return {
    title: `${ctx.orderRef}: ${connectionProblem(gathered)}`,
    summary: gated.answer.situation,
    factIds,
    options: {
      items: gated.options,
      recommendation: recommended
        ? {
            optionId: recommended.id,
            why:
              gated.answer.recommendation.optionId === recommended.id
                ? gated.answer.recommendation.why
                : 'The agent’s first choice is blocked by a guardrail; this is the best remaining option.',
          }
        : null,
      agentWillNot: [...gated.answer.agentWillNot, ...blockedNotes],
      notes: lockNotes(ctx),
    },
    decideBy: decideBy ? new Date(decideBy.at) : null,
    decideByReason: decideBy?.label ?? null,
  };
}

/** Closing summary: what was booked, cancelled and sent (BOOKED and TRAVEL_CANCELLED facts are the proof). */
export async function close(ctx: RunContext) {
  const decision = latestDecision(ctx);
  const executed = ctx.outputs.execute as
    | { effects: { status: string; statement: string; factIds: string[] }[]; ok: boolean }
    | undefined;
  const bookedFacts = ctx.facts.filter(
    (fact) =>
      fact.runId === ctx.run.id && fact.level === 'BOOKED' && fact.kind !== 'TRAVEL_CANCELLED'
  );
  const cancelledFacts = ctx.facts.filter(
    (fact) => fact.runId === ctx.run.id && fact.kind === 'TRAVEL_CANCELLED'
  );
  return {
    outcome: executed?.ok === false ? 'partially executed' : 'executed',
    optionId: decision?.option?.id ?? null,
    decidedBy: decision?.decision?.decidedBy ?? null,
    booked: bookedFacts.map(ref),
    cancelled: cancelledFacts.map(ref),
    effects: executed?.effects ?? [],
  };
}

export async function escalate(ctx: RunContext) {
  const decision = latestDecision(ctx);
  return {
    outcome: decision?.expired ? 'decision expired' : 'rejected by the operator',
    cardId: decision?.cardId ?? null,
    note: decision?.decision?.note ?? null,
  };
}
