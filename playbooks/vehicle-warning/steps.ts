// Deterministic steps of the vehicle-warning playbook: gather the car/owner/promise, the decision card, close.

import { z } from 'zod';

import { deriveDecideBy } from '@/lib/chain/compute';
import type { ChainResult } from '@/lib/chain/types';
import { cityTimezone, formatLocal } from '@/lib/evidence/time';
import { factValue } from '@/lib/facts';
import type { Fact } from '@/lib/generated/prisma/client';
import type { GateStepOutput } from '@/lib/playbooks/blocks/gate';
import { latestDecision } from '@/lib/playbooks/blocks/human';
import { createTriageCard } from '@/lib/playbooks/cards';
import { type OptionsAnswer, optionsAnswerSchema } from '@/lib/playbooks/options';
import {
  activeAssignment,
  blockedNotes,
  type FactRef,
  factRef,
  type NextDuty,
  nextDutyAfter,
  pickupCity,
  recommendationFor,
  selectedWindow,
  type WindowInfo,
} from '@/lib/playbooks/stepHelpers';
import type { CardDraft, CardOption, RunContext } from '@/lib/playbooks/types';
import { VEHICLE_TEMPLATES } from '@/playbooks/vehicle-warning/templates';

const MINUTE_MS = 60_000;
const WARNING_TEXT =
  /warning|light|smoke|smell|noise|accident|collision|breakdown|broke down|won.?t start|fault|stopped/i;

export const safetySchema = z.object({
  driverSafe: z
    .enum(['YES', 'NO', 'UNKNOWN'])
    .describe('What the driver says about their own safety; UNKNOWN if they did not answer.'),
  engineOff: z.enum(['YES', 'NO', 'UNKNOWN']),
  location: z
    .string()
    .nullable()
    .describe(
      'Only the place, as the driver named it (service area, road and direction, or pin), at most 100 characters; null if they named no place.'
    ),
  photo: z
    .enum(['RECEIVED', 'PROMISED', 'NOT_AVAILABLE', 'UNKNOWN'])
    .describe('Photo of the warning or damage.'),
  symptom: z.string().nullable().describe('What the driver reports, in their words. No diagnosis.'),
  holdInstructed: z
    .boolean()
    .describe('True if your message told the driver to keep the car stopped.'),
  factIds: z.array(z.string()).describe('Fact ids of your message and the driver replies.'),
  summary: z.string().describe('One or two plain sentences for the dispatcher.'),
});

export type SafetyOutput = z.infer<typeof safetySchema>;

export const vehicleOptionsSchema = optionsAnswerSchema(VEHICLE_TEMPLATES).extend({
  callNotes: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe('Short lines the dispatcher reads on the phone with the owner, each a plain fact.'),
});

export type VehicleOptionsAnswer = OptionsAnswer & { callNotes: string[] };

export type VehicleGather = {
  car: {
    make: string;
    model: string;
    year: number;
    fuel: string;
    vin: string | null;
    registration: string | null;
  } | null;
  owner: { id: string; name: string | null; tier: string | null };
  promise: WindowInfo | null;
  stoppedSince: { at: string; local: string; factId: string; basis: string } | null;
  stoppedMinutes: number | null;
  appEstimate: FactRef | null;
  driver: { id: string; name: string | null; homeCity: string | null } | null;
  nextDuty: NextDuty | null;
  reportedLocation: string | null;
  reportFactIds: string[];
  decideBy: { at: string; reason: string; label: string; factId: string | null } | null;
  lateDelivery: string;
};

const safety = (ctx: RunContext) => ctx.outputs.safety as SafetyOutput | undefined;

/** When the car stopped: the earliest warning report (incident or driver message) in the last 24 h. */
function stoppedSince(args: {
  facts: Fact[];
  now: Date;
  timeZone: string;
}): VehicleGather['stoppedSince'] {
  const { facts, now, timeZone } = args;
  const since = now.getTime() - 24 * 60 * MINUTE_MS;
  const reports = facts
    .filter((fact) => fact.observedAt.getTime() >= since && fact.observedAt <= now)
    .filter(
      (fact) =>
        (fact.kind === 'INCIDENT' &&
          /WARNING|BREAKDOWN|ACCIDENT|COLLISION/i.test(String(factValue(fact, 'incidentKind')))) ||
        (fact.kind === 'DRIVER_STATEMENT' && WARNING_TEXT.test(fact.statement))
    )
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const first = reports[0];
  if (!first) return null;
  return {
    at: first.observedAt.toISOString(),
    local: formatLocal({ at: first.observedAt, timeZone }),
    factId: first.id,
    basis: first.kind === 'INCIDENT' ? 'incident record' : "driver's first report",
  };
}

/** Decide-by: a paid departure, else the delivery window opening (tell the owner first), else its end. */
function vehicleDecideBy(args: {
  ctx: RunContext;
  promise: WindowInfo | null;
}): VehicleGather['decideBy'] {
  const { ctx, promise } = args;
  const fromChain = deriveDecideBy({
    bundle: ctx.order,
    facts: ctx.facts,
    now: ctx.simNow,
  }).decideBy;
  const candidates: NonNullable<VehicleGather['decideBy']>[] = [];
  if (fromChain)
    candidates.push({
      at: fromChain.at.toISOString(),
      reason: fromChain.reason,
      label: fromChain.label,
      factId: fromChain.factId,
    });
  if (promise) {
    const start = new Date(promise.startAt);
    const end = new Date(promise.endAt);
    const at = start > ctx.simNow ? start : end > ctx.simNow ? end : null;
    if (at) {
      const reason =
        at === start
          ? 'the delivery window opens; the owner should hear from us before they expect the car'
          : 'the delivery window closes; the owner must hear from us before the promise breaks';
      candidates.push({
        at: at.toISOString(),
        reason,
        label: `until ${formatLocal({ at, timeZone: promise.timezone })} — ${reason}`,
        factId: promise.factId,
      });
    }
  }
  return candidates.sort((a, b) => a.at.localeCompare(b.at))[0] ?? null;
}

/** Car, owner, promise, when the car stopped, the last app estimate, the driver's next duty, decide-by. */
export async function gather(ctx: RunContext): Promise<VehicleGather> {
  const { order: bundle, facts, simNow } = ctx;
  const vehicle = (bundle.items.find((item) => item.role === 'PRIMARY') ?? bundle.items[0])
    ?.vehicle;
  const assignment = activeAssignment(bundle);
  const promise = selectedWindow({ bundle, facts, purpose: 'CUSTOMER_DELIVERY_PROMISE' });
  const stopped = stoppedSince({
    facts,
    now: simNow,
    timeZone: promise?.timezone ?? cityTimezone(pickupCity(bundle)) ?? 'UTC',
  });
  const appEstimate = facts
    .filter((fact) => fact.kind === 'TRACKING_OBSERVATION' && fact.observedAt <= simNow)
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0];
  const stoppedMinutes = stopped
    ? Math.round((simNow.getTime() - new Date(stopped.at).getTime()) / MINUTE_MS)
    : null;
  const nextDuty = assignment
    ? await nextDutyAfter({
        driverId: assignment.driverId,
        orderId: bundle.order.id,
        after: simNow,
      })
    : null;
  const reportFactIds = facts
    .filter(
      (fact) =>
        ['INCIDENT', 'ALERT', 'DOCUMENT', 'CUSTOMER_STATEMENT', 'DRIVER_STATEMENT'].includes(
          fact.kind
        ) &&
        (!stopped || fact.observedAt >= new Date(stopped.at))
    )
    .map((fact) => fact.id);
  const windowOpen = promise && new Date(promise.endAt) > simNow;
  return {
    car: vehicle
      ? {
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.modelYear,
          fuel: vehicle.fuel,
          vin: vehicle.syntheticVin ?? null,
          registration: vehicle.registration ?? null,
        }
      : null,
    owner: {
      id: bundle.customer?.id ?? bundle.order.customerId,
      name: bundle.customer?.name ?? null,
      tier: bundle.customer?.accountTier ?? null,
    },
    promise,
    stoppedSince: stopped,
    stoppedMinutes,
    appEstimate: appEstimate ? factRef(appEstimate) : null,
    driver: assignment
      ? {
          id: assignment.driverId,
          name: assignment.driver?.displayName ?? null,
          homeCity: assignment.driver?.homeCity ?? null,
        }
      : null,
    nextDuty,
    reportedLocation: safety(ctx)?.location ?? null,
    reportFactIds: [...new Set([...(safety(ctx)?.factIds ?? []), ...reportFactIds])],
    decideBy: vehicleDecideBy({ ctx, promise }),
    lateDelivery: !promise
      ? 'No delivery promise on record.'
      : windowOpen
        ? `Expect a late delivery: the car is stopped${stoppedMinutes !== null ? ` (${stoppedMinutes} min so far)` : ''} and today's window ${promise.local} is at risk; no new time until the owner's recovery plan is known.`
        : `The delivery window ${promise.local} has passed; a new time needs the owner's recovery plan.`,
  };
}

/** Driver says they are not safe: a person must call now (no options, no waiting). */
export async function safetyEscalation(ctx: RunContext) {
  const answer = safety(ctx);
  const card = await createTriageCard({
    runId: ctx.run.id,
    orderId: ctx.orderId,
    playbookId: ctx.playbook.id,
    title: `${ctx.orderRef}: Driver may not be safe. Call the driver now`,
    summary: `${answer?.summary ?? 'The driver did not confirm they are safe.'}\nThe agent stopped here: safety comes before any recovery plan. Call the driver; call emergency services if needed.`,
    factIds: answer?.factIds ?? [],
    agentActions: ctx.agentActions,
    decideBy: ctx.simNow,
    decideByReason: 'now — the driver reports they are not safe',
  });
  return { outcome: 'escalated: driver not safe', cardId: card.id };
}

/** A stopped car has no ETA: replace the chain's stale app estimate with an honest "unknown". */
function stoppedCarOption(args: { option: CardOption; gathered: VehicleGather }): CardOption {
  const { option, gathered } = args;
  const chain = option.chain as ChainResult;
  const estimate = chain.promise.etaLocal
    ? ` The app estimate (${chain.promise.etaLocal}) predates the stop.`
    : '';
  const tow = option.actions.some((action) => action.actionClass === 'MONEY');
  return {
    ...option,
    chain: {
      ...chain,
      promise: {
        ...chain.promise,
        etaAt: null,
        etaLocal: null,
        etaBasis: `Car stopped since ${gathered.stoppedSince?.local ?? 'the warning'} with no diagnosis; no ETA until the owner's service decides.${estimate}`,
        slackHours: null,
        earlyHours: null,
        verdict: 'unknown',
        keepsPromise: null,
      },
      warnings: [gathered.lateDelivery, ...chain.warnings],
    },
    slackMinutes: null,
    costLabel: tow ? 'Tow price unknown (the provider quotes on arrival)' : option.costLabel,
    approvers: [...new Set([...option.approvers, 'owner (customer)'])],
  };
}

/** The one decision: call the owner, roadside or tow, expect a late delivery. */
export async function buildCard(ctx: RunContext): Promise<CardDraft> {
  const gated = ctx.outputs.check as GateStepOutput;
  const answer = gated.answer as VehicleOptionsAnswer;
  const gathered = ctx.outputs.gather as VehicleGather;
  const told = safety(ctx);
  const items = gated.options.map((option) => stoppedCarOption({ option, gathered }));
  const car = gathered.car ? `${gathered.car.make} ${gathered.car.model}` : 'The car';
  const where = gathered.reportedLocation
    ? `${gathered.reportedLocation.replace(/\s*\([^)]*\)\s*$/, '').slice(0, 100)} (driver's report, not verified)`
    : 'a place the driver has not named yet';
  const safe =
    told?.driverSafe === 'YES'
      ? 'driver safe'
      : 'driver has not confirmed they are safe (call them first)';
  const summary = [
    `${car} stopped${gathered.stoppedSince ? ` since ${gathered.stoppedSince.local}` : ''} at ${where}; ${safe}${told?.engineOff === 'YES' ? ', engine off' : ''}.`,
    `Call ${gathered.owner.name ?? 'the owner'}: their own roadside service, a tow by Bahn, or wait for their instruction. The agent gives no mechanical advice.`,
    gathered.lateDelivery,
  ].join('\n');
  const notes = [
    ...answer.callNotes.map((line) => `Call notes: ${line}`),
    told?.holdInstructed
      ? 'The agent told the driver to keep the car stopped (INSTRUCT_HOLD: allowed without approval, safety-preserving).'
      : 'The driver has not been told to keep the car stopped by the agent.',
    `Photo of the warning: ${told?.photo?.toLowerCase().replace('_', ' ') ?? 'unknown'}.`,
    gathered.nextDuty
      ? `Driver's next duty: ${gathered.nextDuty.orderRef} from ${gathered.nextDuty.local}.`
      : 'The driver has no next duty on record; waiting time runs from the stop.',
    `Agent's reading: ${answer.situation.replace(/\n+/g, ' ')}`,
  ];
  return {
    title: `${ctx.orderRef}: ${car} stopped with a warning. Call the owner: roadside or tow`,
    summary,
    factIds: [
      ...gathered.reportFactIds,
      ...(gathered.promise?.factId ? [gathered.promise.factId] : []),
      ...items.flatMap((option) => option.factIds),
    ],
    options: {
      items,
      recommendation: recommendationFor({ options: items, answer }),
      agentWillNot: [...answer.agentWillNot, ...blockedNotes(items)],
      notes,
    },
    decideBy: gathered.decideBy ? new Date(gathered.decideBy.at) : null,
    decideByReason: gathered.decideBy?.label ?? null,
  };
}

/** What happened after the decision: messages sent, roadside ordered (BOOKED facts are the proof). */
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
