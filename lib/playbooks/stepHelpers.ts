// Small helpers shared by deterministic playbook steps: fact refs, windows, the active assignment, local times.

import { getDriverDuties, type OrderBundle } from '@/lib/bahn';
import { cityTimezone, formatLocal, formatWindow } from '@/lib/evidence/time';
import { factValue } from '@/lib/facts';
import type { Fact } from '@/lib/generated/prisma/client';
import type { CardOption, RunContext } from '@/lib/playbooks/types';

export type FactRef = { factId: string; statement: string };

export const factRef = (fact: Fact): FactRef => ({ factId: fact.id, statement: fact.statement });

export type WindowInfo = {
  id: string;
  startAt: string;
  endAt: string;
  timezone: string;
  local: string;
  factId: string | null;
};

/** The selected window of a purpose (SELECTED_PICKUP_SLOT, CUSTOMER_DELIVERY_PROMISE, …) with its fact id. */
export function selectedWindow(args: {
  bundle: OrderBundle;
  facts: Fact[];
  purpose: string;
}): WindowInfo | null {
  const { bundle, facts, purpose } = args;
  const window = bundle.timeWindows.find((w) => w.purpose === purpose && w.isSelected);
  if (!window) return null;
  return {
    id: window.id,
    startAt: window.startAt.toISOString(),
    endAt: window.endAt.toISOString(),
    timezone: window.timezone,
    local: formatWindow({
      startAt: window.startAt,
      endAt: window.endAt,
      timeZone: window.timezone,
    }),
    factId: facts.find((fact) => factValue(fact, 'windowId') === window.id)?.id ?? null,
  };
}

export function activeAssignment(bundle: OrderBundle) {
  return (
    bundle.assignments.find((a) => a.status !== 'CANCELLED' && !a.cancelledAt) ??
    bundle.assignments[0] ??
    null
  );
}

export function pickupCity(bundle: OrderBundle): string | null {
  return bundle.addresses.find((a) => a.id === bundle.order.pickupAddressId)?.city ?? null;
}

export function deliveryCity(bundle: OrderBundle): string | null {
  return bundle.addresses.find((a) => a.id === bundle.order.deliveryAddressId)?.city ?? null;
}

/** Local time in the pickup city's zone (falls back to UTC). */
export function pickupLocal(args: { bundle: OrderBundle; at: Date }): string {
  const { bundle, at } = args;
  return formatLocal({ at, timeZone: cityTimezone(pickupCity(bundle)) ?? 'UTC' });
}

export type NextDuty = { orderRef: string | null; startAt: string | null; local: string | null };

/** The driver's next duty after this order (by start), from Bahn's assignment records. */
export async function nextDutyAfter(args: {
  driverId: string;
  orderId: string;
  after: Date;
}): Promise<NextDuty | null> {
  const { driverId, orderId, after } = args;
  const { duties } = await getDriverDuties({ driverId, includeCompleted: false });
  const next = duties.find(
    (duty) => duty.assignment.orderId !== orderId && duty.startAt && duty.startAt > after
  );
  if (!next) return null;
  return {
    orderRef: next.order?.reference ?? null,
    startAt: next.startAt?.toISOString() ?? null,
    local: next.startAt
      ? formatLocal({ at: next.startAt, timeZone: next.selectedWindows[0]?.timezone ?? 'UTC' })
      : null,
  };
}

/** Facts this run's tools or the projection created after a moment (e.g. replies since the slot started). */
export function factsSince(args: { facts: Fact[]; kinds: string[]; since: Date }): Fact[] {
  const { facts, kinds, since } = args;
  return facts.filter((fact) => kinds.includes(fact.kind) && fact.observedAt >= since);
}

/** Notes for "The agent will not" from blocked options, shared by card builders. */
export function blockedNotes(options: CardOption[]): string[] {
  return options
    .filter((option) => option.blocked)
    .map(
      (option) =>
        `Option ${option.id} is blocked by ${option.blocked?.ruleId}: ${option.blocked?.message}`
    );
}

/** Recommendation text that survives the gate replacing a blocked first choice. */
export function recommendationFor(args: {
  options: CardOption[];
  answer: { recommendation: { optionId: string; why: string } };
}): { optionId: string; why: string } | null {
  const { options, answer } = args;
  const recommended = options.find((option) => option.recommended);
  if (!recommended) return null;
  return {
    optionId: recommended.id,
    why:
      answer.recommendation.optionId === recommended.id
        ? answer.recommendation.why
        : 'The agent’s first choice is blocked by a guardrail; this is the best remaining option.',
  };
}

/** Terminal summary shared by close blocks. */
export function runFacts(ctx: RunContext): FactRef[] {
  return ctx.facts.filter((fact) => fact.runId === ctx.run.id).map(factRef);
}
