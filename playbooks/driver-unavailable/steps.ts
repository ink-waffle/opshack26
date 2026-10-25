// Deterministic steps of the driver-unavailable playbook: the hard clock, backups and a later slot, the card, close.

import { z } from 'zod';

import { computeChain, deriveDecideBy } from '@/lib/chain/compute';
import type { ChainResult } from '@/lib/chain/types';
import { formatLocal, formatMoney, formatWindow } from '@/lib/evidence/time';
import { factValue } from '@/lib/facts';
import type { GateStepOutput } from '@/lib/playbooks/blocks/gate';
import { latestDecision } from '@/lib/playbooks/blocks/human';
import {
  activeAssignment,
  blockedNotes,
  type FactRef,
  factRef,
  pickupCity,
  pickupLocal,
  recommendationFor,
  selectedWindow,
  type WindowInfo,
} from '@/lib/playbooks/stepHelpers';
import type { CardDraft, CardOption, RunContext } from '@/lib/playbooks/types';
import { searchBackupDrivers } from '@/mcp/tools/findBackupDrivers';

const MINUTE_MS = 60_000;

export const askAnswerSchema = z.object({
  answer: z
    .enum(['YES', 'NO', 'UNSURE', 'NO_REPLY'])
    .describe('YES only for a clear "I can do it"; anything hedged is UNSURE.'),
  earliestAvailable: z
    .string()
    .nullable()
    .describe('ISO time the driver says they could start, if they named one; else null.'),
  factIds: z.array(z.string()).describe('Fact ids of your message and the driver replies.'),
  summary: z.string().describe('One or two plain sentences: what the driver said.'),
});

export type AskAnswer = z.infer<typeof askAnswerSchema>;

type Deadline = {
  at: string;
  local: string;
  kind: string;
  reason: string;
  label: string;
  factId: string | null;
};

export type DriverGather = {
  driver: { id: string; name: string | null; homeCity: string | null } | null;
  assignmentId: string | null;
  pickupCity: string | null;
  slot: WindowInfo | null;
  availability: { startAt: string; endAt: string; local: string } | null;
  promise: WindowInfo | null;
  decideBy: Deadline | null;
  answerBy: { at: string; local: string; reason: string };
  paidTravel: (FactRef & { costCents: number | null; departureAt: string | null })[];
  paidAtStake: string;
  driverSaid: FactRef[];
};

export type BackupsOutput = {
  backups: {
    factId: string;
    driverId: string;
    name: string;
    homeCity: string;
    reachMinutes: number;
    likelihood: string;
  }[];
  afternoonSlot: {
    startAt: string;
    endAt: string;
    local: string;
    verdict: string;
    slackHours: number | null;
  } | null;
  replaceDriver: { driverId: string; warnings: string[]; paidAtRisk: string } | null;
};

const gathered = (ctx: RunContext) => ctx.outputs.gather as DriverGather;

function numberParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The hard clock (first paid departure), the paid travel at stake, what the driver said, and the answer-by time. */
export async function gather(ctx: RunContext): Promise<DriverGather> {
  const { order: bundle, facts, simNow } = ctx;
  const assignment = activeAssignment(bundle);
  const slot = selectedWindow({ bundle, facts, purpose: 'SELECTED_PICKUP_SLOT' });
  const promise = selectedWindow({ bundle, facts, purpose: 'CUSTOMER_DELIVERY_PROMISE' });
  const availability = bundle.timeWindows.find((w) => w.purpose === 'PICKUP_AVAILABILITY');
  const { decideBy } = deriveDecideBy({ bundle, facts, now: simNow });
  // A paid departure needs the answer just before it; a slot start needs it hours ahead to arrange cover.
  const bufferMinutes =
    decideBy?.kind === 'SLOT_START'
      ? Math.max(120, numberParam(ctx.params.answerBufferMinutes, 15))
      : numberParam(ctx.params.answerBufferMinutes, 15);
  const answerAt = decideBy
    ? new Date(
        Math.max(
          decideBy.at.getTime() - bufferMinutes * MINUTE_MS,
          simNow.getTime() + 10 * MINUTE_MS
        )
      )
    : slot
      ? new Date(new Date(slot.startAt).getTime() - 120 * MINUTE_MS)
      : new Date(simNow.getTime() + 60 * MINUTE_MS);
  const paid = facts.filter(
    (fact) =>
      ['TRAVEL_BOOKING', 'HOTEL_BOOKING', 'FERRY_BOOKING'].includes(fact.kind) &&
      fact.level === 'BOOKED' &&
      (!assignment || factValue(fact, 'assignmentId') === assignment.id)
  );
  const paidTravel = paid.map((fact) => ({
    ...factRef(fact),
    costCents: factValue<number>(fact, 'fareCents') ?? null,
    departureAt: factValue<string>(fact, 'departureAt') ?? null,
  }));
  const stakeCents = bundle.travelReservations
    .filter((r) => r.status === 'BOOKED' && (!assignment || r.assignmentId === assignment.id))
    .reduce((sum, r) => sum + (r.currency === 'EUR' ? (r.fareCents ?? 0) : 0), 0);
  return {
    driver: assignment
      ? {
          id: assignment.driverId,
          name: assignment.driver?.displayName ?? null,
          homeCity: assignment.driver?.homeCity ?? null,
        }
      : null,
    assignmentId: assignment?.id ?? null,
    pickupCity: pickupCity(bundle),
    slot,
    availability: availability
      ? {
          startAt: availability.startAt.toISOString(),
          endAt: availability.endAt.toISOString(),
          local: formatWindow({
            startAt: availability.startAt,
            endAt: availability.endAt,
            timeZone: availability.timezone,
          }),
        }
      : null,
    promise,
    decideBy: decideBy
      ? {
          at: decideBy.at.toISOString(),
          local: decideBy.local,
          kind: decideBy.kind,
          reason: decideBy.reason,
          label: decideBy.label,
          factId: decideBy.factId,
        }
      : null,
    answerBy: {
      at: answerAt.toISOString(),
      local: pickupLocal({ bundle, at: answerAt }),
      reason: decideBy
        ? `${bufferMinutes} min before ${decideBy.reason}`
        : 'two hours before the pickup slot starts',
    },
    paidTravel,
    paidAtStake: formatMoney({ cents: stakeCents, currency: 'EUR' }),
    driverSaid: facts
      .filter((fact) => fact.kind === 'DRIVER_STATEMENT' && fact.observedAt <= simNow)
      .slice(-4)
      .map(factRef),
  };
}

/** Backup drivers from the pool (QUOTED facts), the afternoon slot inside the site's availability, both through the chain. */
export async function findBackups(ctx: RunContext): Promise<BackupsOutput> {
  const search = await searchBackupDrivers({
    bundle: ctx.order,
    runId: ctx.run.id,
    now: ctx.simNow,
  });
  await ctx.services.refresh();
  const g = gathered(ctx);
  let afternoonSlot: BackupsOutput['afternoonSlot'] = null;
  if (g.slot && g.availability) {
    const slotMs = new Date(g.slot.endAt).getTime() - new Date(g.slot.startAt).getTime();
    const end = new Date(g.availability.endAt);
    const start = new Date(Math.max(new Date(g.slot.endAt).getTime(), end.getTime() - slotMs));
    if (end > new Date(g.slot.endAt)) {
      const chain = computeChain({
        bundle: ctx.order,
        facts: ctx.facts,
        option: { type: 'MOVE_PICKUP_SLOT', startAt: start, endAt: end },
        now: ctx.simNow,
      });
      afternoonSlot = {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        local: formatWindow({ startAt: start, endAt: end, timeZone: g.slot.timezone }),
        verdict: chain.promise.verdict,
        slackHours: chain.promise.slackHours,
      };
    }
  }
  const best = search.candidates[0];
  const replace: ChainResult | null = best
    ? computeChain({
        bundle: ctx.order,
        facts: ctx.facts,
        option: { type: 'REPLACE_DRIVER', driverId: best.driverId },
        now: ctx.simNow,
      })
    : null;
  return {
    backups: search.candidates.map((candidate) => ({
      factId: candidate.factId,
      driverId: candidate.driverId,
      name: candidate.name,
      homeCity: candidate.homeCity,
      reachMinutes: candidate.reachMinutes,
      likelihood: candidate.likelihood,
    })),
    afternoonSlot,
    replaceDriver:
      best && replace
        ? { driverId: best.driverId, warnings: replace.warnings, paidAtRisk: g.paidAtStake }
        : null,
  };
}

/** Cost line that says what is really at stake: paid travel that may be lost, unknown new costs. */
function costLabel(option: CardOption): string {
  const chain = option.chain as ChainResult;
  const cancelCents = chain.bookings.cancel.reduce(
    (sum, booking) => sum + (booking.currency === 'EUR' ? (booking.costCents ?? 0) : 0),
    0
  );
  const parts = [
    cancelCents
      ? `${formatMoney({ cents: cancelCents, currency: 'EUR' })} paid travel at risk (refund unknown)`
      : null,
    chain.cost.unknown.find((line) => line.startsWith('new driver'))
      ? 'new driver travel unknown'
      : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' + ') : option.costLabel;
}

/** Card: decide before the first paid leg leaves; options keep / backup offer / afternoon slot. */
export async function buildCard(ctx: RunContext): Promise<CardDraft> {
  const gated = ctx.outputs.check as GateStepOutput;
  const g = gathered(ctx);
  const asked = ctx.outputs.ask_driver as AskAnswer;
  const backups = ctx.outputs.backups as BackupsOutput;
  const items = gated.options.map((option) => ({ ...option, costLabel: costLabel(option) }));
  const recommended = items.find((option) => option.recommended);
  const chainDecideBy = (recommended?.chain as ChainResult | undefined)?.decideBy ?? null;
  const decideBy = chainDecideBy
    ? { at: chainDecideBy.at, label: chainDecideBy.label }
    : g.decideBy
      ? { at: new Date(g.decideBy.at), label: g.decideBy.label }
      : null;
  const driver = g.driver?.name ?? g.driver?.id ?? 'The driver';
  const answer = {
    NO: 'says they cannot do',
    UNSURE: 'is not sure about',
    NO_REPLY: 'has not answered about',
    YES: 'confirmed',
  }[asked.answer];
  const paidFirst = g.decideBy?.kind === 'FIRST_PAID_DEPARTURE';
  const paidLine = g.paidTravel.length
    ? `${g.paidAtStake} of positioning travel is paid.`
    : 'No positioning travel is booked.';
  const clock = !g.decideBy
    ? `${paidLine} No hard deadline is on record.`
    : paidFirst
      ? `${g.paidAtStake} of positioning travel is paid; the first paid leg leaves ${g.decideBy.local}.`
      : `${paidLine} Deadline ${g.decideBy.local}: ${g.decideBy.reason}.`;
  const summary = [
    `${driver} ${answer} the ${g.pickupCity ?? ''} pickup ${g.slot?.local ?? ''}.`.replace(
      /\s+/g,
      ' '
    ),
    clock,
    `Agent asked the driver for a yes or no by ${g.answerBy.local} and found ${backups.backups.length} possible backup drivers; nothing is cancelled.`,
  ].join('\n');
  return {
    title: `${ctx.orderRef}: Driver may not make the pickup. Decide before ${paidFirst ? 'the paid travel starts' : g.decideBy?.kind === 'SLOT_START' ? 'the pickup slot' : 'the deadline'}`,
    summary,
    factIds: [
      ...g.driverSaid.map((fact) => fact.factId),
      ...g.paidTravel.map((fact) => fact.factId),
      ...(g.decideBy?.factId ? [g.decideBy.factId] : []),
      ...asked.factIds,
      ...items.flatMap((option) => option.factIds),
    ],
    options: {
      items,
      recommendation: recommendationFor({ options: items, answer: gated.answer }),
      agentWillNot: [
        ...gated.answer.agentWillNot,
        'cancel the current assignment or its paid travel before a backup accepts (G7)',
        'describe a backup driver as booked before they accept (G3)',
        ...blockedNotes(items),
      ],
      notes: [
        `Driver’s answer: ${asked.summary}`,
        ...(backups.afternoonSlot
          ? [
              `Afternoon slot ${backups.afternoonSlot.local} fits the pickup availability; the promise ${backups.afternoonSlot.verdict === 'breaks' ? 'breaks' : 'still holds'}${backups.afternoonSlot.slackHours !== null ? ` (slack ${backups.afternoonSlot.slackHours} h)` : ''}.`,
            ]
          : []),
        ...backups.backups.map(
          (backup) =>
            `Backup candidate ${backup.name} (${backup.homeCity}, about ${backup.reachMinutes} min away, likelihood ${backup.likelihood.toLowerCase()}): free in the records, not asked yet.`
        ),
      ],
    },
    decideBy: decideBy?.at ?? null,
    decideByReason: decideBy?.label ?? null,
  };
}

/** The driver confirmed: nothing to decide; the plan stays as booked. */
export async function closeConfirmed(ctx: RunContext) {
  const asked = ctx.outputs.ask_driver as AskAnswer;
  return {
    outcome: 'driver confirmed; plan unchanged',
    note: 'A driver statement (STATED). The agent cancelled nothing and keeps the assignment as booked.',
    factIds: asked.factIds,
    summary: asked.summary,
    at: formatLocal({ at: ctx.simNow, timeZone: 'UTC' }),
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
    recorded: ctx.facts
      .filter((fact) => fact.runId === ctx.run.id && ['BOOKED', 'OBSERVED'].includes(fact.level))
      .map(factRef),
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
