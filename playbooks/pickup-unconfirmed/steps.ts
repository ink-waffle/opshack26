// Deterministic steps of pickup-unconfirmed: pickup evidence, the next deadline after pickup, the card, closes.

import { z } from 'zod';

import { computeChain, deriveDecideBy } from '@/lib/chain/compute';
import { formatLocal } from '@/lib/evidence/time';
import type { Fact } from '@/lib/generated/prisma/client';
import type { GateStepOutput } from '@/lib/playbooks/blocks/gate';
import { latestDecision } from '@/lib/playbooks/blocks/human';
import {
  activeAssignment,
  blockedNotes,
  type FactRef,
  factRef,
  factsSince,
  pickupCity,
  recommendationFor,
  selectedWindow,
  type WindowInfo,
} from '@/lib/playbooks/stepHelpers';
import type { CardDraft, Commitment, RunContext } from '@/lib/playbooks/types';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const askOutcomeSchema = z.object({
  outcome: z
    .enum(['COLLECTED', 'PROBLEM', 'NO_ANSWER'])
    .describe(
      'COLLECTED: the driver or site says the car was collected. PROBLEM: anything else they report (late, not ready, keys, not found). NO_ANSWER: nobody replied.'
    ),
  driverSays: z.string().nullable().describe("The driver's reply in short; null if none."),
  siteSays: z.string().nullable().describe("The site's reply in short; null if not asked or none."),
  problem: z.string().nullable().describe('The problem in one plain sentence; else null.'),
  interpretationFactId: z
    .string()
    .nullable()
    .describe('COLLECTED: the fact id record_interpretation returned; else null.'),
  factIds: z.array(z.string()).describe('Fact ids of your messages and the replies.'),
  summary: z.string().describe('One or two plain sentences for the dispatcher.'),
});

export type AskOutcome = z.infer<typeof askOutcomeSchema>;

export type PickupEvidence = {
  slot: WindowInfo | null;
  slotStarted: boolean;
  slotEnded: boolean;
  pickedUp: FactRef | null;
  assignmentStarted: FactRef | null;
  siteSaid: FactRef[];
  driverSaid: FactRef[];
  driver: { id: string; name: string | null } | null;
  checkedAt: string;
};

export type PickupDeadline = {
  at: string;
  local: string;
  kind: 'SLOT_END' | 'LEAVE_FOR_FERRY' | 'PAID_DEPARTURE' | 'LEAVE_FOR_PROMISE';
  reason: string;
  factId: string | null;
};

export type NextCommitmentOutput = {
  deadlines: PickupDeadline[];
  next: PickupDeadline | null;
  minutesUntilNext: number | null;
  // Plain sentence: is the default wait affordable before the next deadline?
  explanation: string;
};

const evidenceOf = (ctx: RunContext) =>
  (ctx.outputs.recheck ?? ctx.outputs.evidence) as PickupEvidence;

/** Pickup evidence since the slot started: a pickup scan (OBSERVED) closes; statements are only read. */
export async function checkEvidence(ctx: RunContext): Promise<PickupEvidence> {
  const { order: bundle, facts, simNow } = ctx;
  const slot = selectedWindow({ bundle, facts, purpose: 'SELECTED_PICKUP_SLOT' });
  const since = slot ? new Date(new Date(slot.startAt).getTime() - 6 * HOUR_MS) : new Date(0);
  const visible = facts.filter((fact) => fact.observedAt <= simNow);
  const latest = (kind: string): Fact | undefined =>
    factsSince({ facts: visible, kinds: [kind], since }).at(-1);
  const pickedUp = visible
    .filter((fact) => fact.kind === 'PICKUP_EVENT' && fact.level === 'OBSERVED')
    .find((fact) => fact.observedAt >= since);
  const slotStart = slot ? new Date(slot.startAt) : null;
  const assignment = activeAssignment(bundle);
  return {
    slot,
    slotStarted: Boolean(slotStart && slotStart <= simNow),
    slotEnded: Boolean(slot && new Date(slot.endAt) <= simNow),
    pickedUp: pickedUp ? factRef(pickedUp) : null,
    assignmentStarted: latest('ASSIGNMENT_STARTED') ? factRef(latest('ASSIGNMENT_STARTED')!) : null,
    siteSaid: factsSince({ facts: visible, kinds: ['SITE_STATEMENT'], since: slotStart ?? since })
      .slice(-3)
      .map(factRef),
    driverSaid: factsSince({
      facts: visible,
      kinds: ['DRIVER_STATEMENT'],
      since: slotStart ?? since,
    })
      .slice(-3)
      .map(factRef),
    driver: assignment
      ? { id: assignment.driverId, name: assignment.driver?.displayName ?? null }
      : null,
    checkedAt: simNow.toISOString(),
  };
}

function numberParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Hard deadlines after the pickup: slot end, leave-by for a booked ferry, paid departures, leave-by for the promise. */
export async function nextCommitment(ctx: RunContext): Promise<NextCommitmentOutput> {
  const { order: bundle, facts, simNow } = ctx;
  const city = pickupCity(bundle) ?? 'the pickup';
  const slotWindow = bundle.timeWindows.find(
    (w) => w.purpose === 'SELECTED_PICKUP_SLOT' && w.isSelected
  );
  const tz = slotWindow?.timezone ?? 'UTC';
  const local = (at: Date) => formatLocal({ at, timeZone: tz });
  const factFor = (recordId: string) =>
    facts.find((fact) => fact.sourceRef.endsWith(`:${recordId}`))?.id ?? null;
  const deadlines: PickupDeadline[] = [];
  const push = (deadline: Omit<PickupDeadline, 'at' | 'local'> & { at: Date }) => {
    if (deadline.at > simNow)
      deadlines.push({ ...deadline, at: deadline.at.toISOString(), local: local(deadline.at) });
  };

  if (slotWindow)
    push({
      at: slotWindow.endAt,
      kind: 'SLOT_END',
      reason: `the pickup slot in ${city} ends (the site may stop releasing the car)`,
      factId: factFor(slotWindow.id),
    });

  const roadHours =
    bundle.travelOptions.find(
      (option) => option.kind === 'FERRY' && option.roadTimeToTerminalHours !== null
    )?.roadTimeToTerminalHours ?? numberParam(ctx.params.defaultRoadHoursToTerminal, 2);
  for (const reservation of bundle.travelReservations) {
    if (reservation.status !== 'BOOKED' || reservation.cancelledAt) continue;
    if (reservation.kind === 'FERRY' && reservation.checkInCutoffAt) {
      push({
        at: new Date(reservation.checkInCutoffAt.getTime() - roadHours * HOUR_MS),
        kind: 'LEAVE_FOR_FERRY',
        reason: `the driver must leave ${city} to reach the check-in of the booked ferry ${reservation.bookingReference} (cutoff ${local(reservation.checkInCutoffAt)}, about ${roadHours} h drive)`,
        factId: factFor(reservation.id),
      });
    } else if (['TRAIN', 'FLIGHT', 'BUS'].includes(reservation.kind)) {
      push({
        at: reservation.departureAt,
        kind: 'PAID_DEPARTURE',
        reason: `the paid ${reservation.kind.toLowerCase()} ${reservation.routeLabel} departs`,
        factId: factFor(reservation.id),
      });
    }
  }

  const ferryRoute = bundle.travelOptions.some((option) => option.kind === 'FERRY');
  if (!ferryRoute && slotWindow) {
    const chain = computeChain({ bundle, facts, option: { type: 'NO_CHANGE' }, now: simNow });
    const { etaAt, endAt, etaBasis } = chain.promise;
    if (etaAt && endAt && etaBasis.startsWith('planning estimate: pickup slot end')) {
      const driveMs = etaAt.getTime() - slotWindow.endAt.getTime();
      push({
        at: new Date(endAt.getTime() - driveMs),
        kind: 'LEAVE_FOR_PROMISE',
        reason: `the car must leave ${city} to reach the delivery window before it closes (about ${Math.round(driveMs / HOUR_MS)} h drive with rest)`,
        factId: chain.promise.factId,
      });
    }
  }

  deadlines.sort((a, b) => a.at.localeCompare(b.at));
  const next = deadlines[0] ?? null;
  const minutesUntilNext = next
    ? Math.round((new Date(next.at).getTime() - simNow.getTime()) / MINUTE_MS)
    : null;
  const defaultMinutes = numberParam(ctx.params['wait_confirmation.defaultMinutes'], 120);
  const bufferMinutes = numberParam(ctx.params['wait_confirmation.bufferMinutes'], 30);
  const explanation = !next
    ? `No hard deadline after the pickup: waiting the default ${defaultMinutes} min is affordable.`
    : minutesUntilNext! - bufferMinutes >= defaultMinutes
      ? `Next deadline ${next.local}: ${next.reason}. That is ${minutesUntilNext} min away, so the default ${defaultMinutes} min wait is affordable.`
      : `Next deadline ${next.local}: ${next.reason}. Only ${minutesUntilNext} min away, so waiting ${defaultMinutes} min is not affordable: wait at most ${Math.max(0, minutesUntilNext! - bufferMinutes)} min (${bufferMinutes} min buffer), then ask.`;
  return { deadlines, next, minutesUntilNext, explanation };
}

/** The wait block's commitment: the next deadline computed above. */
export async function waitCommitment(ctx: RunContext): Promise<Commitment | null> {
  const next = (ctx.outputs.next_commitment as NextCommitmentOutput).next;
  return next ? { at: new Date(next.at), reason: next.reason } : null;
}

export async function closeNotDue(ctx: RunContext) {
  const evidence = evidenceOf(ctx);
  return {
    outcome: 'nothing to check yet: the pickup slot has not started',
    slot: evidence.slot?.local ?? null,
  };
}

export async function closeObserved(ctx: RunContext) {
  const evidence = evidenceOf(ctx);
  return {
    outcome: 'pickup scan on record (OBSERVED); nothing to do',
    evidence: evidence.pickedUp,
  };
}

/** The driver (or site) says the car was collected: STATED, not a scan; site confirmation still pending. */
export async function closeStated(ctx: RunContext) {
  const asked = ctx.outputs.ask as AskOutcome;
  return {
    outcome: 'pickup reported by a person (STATED); no pickup scan yet',
    siteConfirmation: asked.siteSays ? 'site answered' : 'pending',
    note: 'A statement is not a pickup scan. The watchman keeps checking; the pickup becomes OBSERVED when the scan arrives.',
    factIds: asked.factIds,
    interpretationFactId: asked.interpretationFactId,
    summary: asked.summary,
  };
}

/** Card: decide before the next deadline after pickup; the wait reasoning is shown. */
export async function buildCard(ctx: RunContext): Promise<CardDraft> {
  const gated = ctx.outputs.check as GateStepOutput;
  const evidence = evidenceOf(ctx);
  const commitments = ctx.outputs.next_commitment as NextCommitmentOutput;
  const waited = ctx.outputs.wait_confirmation as
    { reason?: string; simMinutes?: number } | undefined;
  const defaultMinutes = numberParam(ctx.params['wait_confirmation.defaultMinutes'], 120);
  const asked = ctx.outputs.ask as AskOutcome;
  const fallback = deriveDecideBy({
    bundle: ctx.order,
    facts: ctx.facts,
    now: ctx.simNow,
  }).decideBy;
  const next =
    commitments.next && new Date(commitments.next.at) > ctx.simNow ? commitments.next : null;
  const decideBy = next
    ? { at: new Date(next.at), label: `until ${next.local} — ${next.reason}` }
    : fallback
      ? { at: fallback.at, label: fallback.label }
      : null;
  const what = asked.outcome === 'NO_ANSWER' ? 'nobody has answered' : 'there is a problem';
  const summary = [
    `No pickup scan for the slot ${evidence.slot?.local ?? ''} and ${what}.`.replace(/\s+/g, ' '),
    asked.summary,
    waited?.simMinutes !== undefined
      ? `Agent waited ${waited.simMinutes} min${waited.simMinutes < defaultMinutes && commitments.next ? ` instead of ${defaultMinutes} (next deadline ${commitments.next.local})` : ''}, then asked${asked.siteSays ? ' the driver and the site' : ' the driver'}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    title: `${ctx.orderRef}: Pickup not confirmed${evidence.slotEnded ? ' after the slot ended' : ''}, ${asked.outcome === 'NO_ANSWER' ? 'driver not answering' : 'problem reported'}`,
    summary,
    factIds: [
      ...asked.factIds,
      ...evidence.driverSaid.map((fact) => fact.factId),
      ...evidence.siteSaid.map((fact) => fact.factId),
      ...(evidence.slot?.factId ? [evidence.slot.factId] : []),
      ...(next?.factId ? [next.factId] : []),
      ...gated.options.flatMap((option) => option.factIds),
    ],
    options: {
      items: gated.options,
      recommendation: recommendationFor({ options: gated.options, answer: gated.answer }),
      agentWillNot: [...gated.answer.agentWillNot, ...blockedNotes(gated.options)],
      notes: [
        `Before waiting: ${commitments.explanation}`,
        ...(waited?.reason ? [`Wait: ${waited.reason}.`] : []),
        ...commitments.deadlines.map(
          (deadline) => `Deadline ${deadline.local}: ${deadline.reason}.`
        ),
      ],
    },
    decideBy: decideBy?.at ?? null,
    decideByReason: decideBy?.label ?? null,
  };
}

export async function close(ctx: RunContext) {
  const decision = latestDecision(ctx);
  const executed = ctx.outputs.execute as
    | { effects: { status: string; statement: string; factIds: string[] }[]; ok: boolean }
    | undefined;
  return {
    outcome: executed?.ok === false ? 'partially executed' : 'executed',
    optionId: decision?.option?.id ?? null,
    decidedBy: decision?.decision?.decidedBy ?? null,
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
