// Simulated effects beyond travel bookings: a directed offer to a backup driver (MARKET) and a roadside/tow order (MONEY).

import type { Effect } from '@/lib/playbooks/blocks/execute';
import { getFactsByIds, recordFact } from '@/lib/playbooks/facts';
import type { CardAction, RunContext } from '@/lib/playbooks/types';
import { getRoadsideProvider, type RoadsideOption } from '@/lib/providers';
import { shortId } from '@/lib/providers/seeded';

type ToolValue = { tool?: string } & Record<string, unknown>;

async function actionFact(action: CardAction) {
  if (!action.quoteFactId) return null;
  const [fact] = await getFactsByIds({ ids: [action.quoteFactId] });
  return fact ? { fact, value: (fact.value ?? {}) as ToolValue } : null;
}

/** True when the action acts on a fact this module can simulate (backup candidate or roadside quote). */
export async function simulatedKind(action: CardAction): Promise<'offer' | 'roadside' | null> {
  const found = await actionFact(action);
  if (action.actionClass === 'MARKET' && found?.value.tool === 'find_backup_drivers')
    return 'offer';
  if (action.actionClass === 'MONEY' && found?.value.tool === 'find_roadside') return 'roadside';
  return null;
}

/** Directed offer to one backup driver: OFFER_EXPOSURE (NOTIFIED, OBSERVED); the current assignment stays (G7). */
export async function sendDirectedOffer(args: {
  ctx: RunContext;
  action: CardAction;
}): Promise<Effect> {
  const { ctx, action } = args;
  const base = { actionId: action.id, actionClass: action.actionClass };
  const found = await actionFact(action);
  const driverId = typeof found?.value.driverId === 'string' ? found.value.driverId : null;
  if (!found || !driverId)
    return {
      ...base,
      status: 'FAILED',
      statement: 'No backup-driver fact to offer to.',
      factIds: [],
    };
  const name = typeof found.value.name === 'string' ? found.value.name : driverId;
  const offerId = `offer-ctl-${shortId(`${ctx.run.id}:${driverId}`)}`;
  const fact = await recordFact({
    orderId: ctx.orderId,
    runId: ctx.run.id,
    kind: 'OFFER_EXPOSURE',
    subject: `driver:${driverId}`,
    statement: `Directed offer for ${ctx.orderRef} sent to ${name} (${driverId}) (simulated, ${offerId}). Not accepted yet; the current driver stays assigned until the backup accepts (G7).`,
    value: {
      tool: 'directed_offer',
      offerId,
      driverId,
      status: 'NOTIFIED',
      message: action.message ?? null,
      candidateFactId: found.fact.id,
      simulated: true,
    },
    level: 'OBSERVED',
    sourceType: 'TOOL',
    sourceRef: `tool:directed_offer:${offerId}`,
    observedAt: ctx.simNow,
    dedupeKey: `tool:directed_offer:${ctx.run.id}:${driverId}`,
  });
  return { ...base, status: 'DONE', statement: fact.statement, factIds: [fact.id] };
}

/** Orders the quoted roadside/tow provider (simulated) and records it as a BOOKED TOOL_RESULT. */
export async function orderRoadside(args: {
  ctx: RunContext;
  action: CardAction;
}): Promise<Effect> {
  const { ctx, action } = args;
  const base = { actionId: action.id, actionClass: action.actionClass };
  const found = await actionFact(action);
  if (!found)
    return {
      ...base,
      status: 'FAILED',
      statement: 'No roadside quote fact to order.',
      factIds: [],
    };
  const option = found.value as unknown as RoadsideOption & { location?: string };
  const location = option.location ?? 'the reported location';
  const result = await getRoadsideProvider().order({
    option,
    location,
    orderId: ctx.orderId,
    at: ctx.simNow,
  });
  if (!result.ok || !result.bookingReference)
    return { ...base, status: 'FAILED', statement: result.statement, factIds: [found.fact.id] };
  const fact = await recordFact({
    orderId: ctx.orderId,
    runId: ctx.run.id,
    kind: 'TOOL_RESULT',
    subject: `roadside:${option.providerId}`,
    statement: result.statement,
    value: {
      tool: 'book_roadside',
      status: 'BOOKED',
      bookingReference: result.bookingReference,
      providerId: option.providerId,
      name: option.name,
      kind: option.kind,
      location,
      etaMinutes: option.etaMinutes,
      quoteFactId: found.fact.id,
      simulated: true,
    },
    level: 'BOOKED',
    sourceType: 'TOOL',
    sourceRef: `tool:book_roadside:${result.bookingReference}`,
    observedAt: ctx.simNow,
    dedupeKey: `tool:book_roadside:${ctx.run.id}:${option.providerId}`,
  });
  return {
    ...base,
    status: 'DONE',
    statement: fact.statement,
    factIds: [fact.id],
    bookingReference: result.bookingReference,
  };
}
