// Simulated effects of an approved option: bookings become BOOKED facts, messages become bahn.messages rows.

import { bahnFactId, reservationKind } from '@/lib/chain/compute';
import { cityTimezone, formatLocal } from '@/lib/evidence/time';
import { factValue } from '@/lib/facts/types';
import type { Fact } from '@/lib/generated/prisma/client';
import { insertMessage, type Party, partyTarget } from '@/lib/playbooks/bahnWrites';
import { MESSAGE_PARTY, planExecution } from '@/lib/playbooks/blocks/executePlan';
import { latestDecision } from '@/lib/playbooks/blocks/human';
import type { BlockExecutor } from '@/lib/playbooks/blocks/types';
import { approvalProblem } from '@/lib/playbooks/decision';
import { getFactsByIds, messageFactId, recordFact } from '@/lib/playbooks/facts';
import { errorMessage } from '@/lib/playbooks/json';
import { bookedFact, cancelledFact, readQuote } from '@/lib/playbooks/quotes';
import { orderRoadside, sendDirectedOffer, simulatedKind } from '@/lib/playbooks/simulated';
import type { CardAction, RunContext } from '@/lib/playbooks/types';
import { type BookableQuote, type CancellableBooking, getTravelProvider } from '@/lib/providers';

export type Effect = {
  actionId: string;
  actionClass: string;
  // WAITING: the step depends on something that has not happened yet (e.g. a new driver accepting).
  status: 'DONE' | 'FAILED' | 'SKIPPED' | 'MANUAL' | 'WAITING';
  statement: string;
  factIds: string[];
  messageId?: string;
  bookingReference?: string;
  // CANCEL_TRAVEL: the reference of the booking that was cancelled and the provider's cancellation reference.
  cancelledReference?: string;
  cancellationReference?: string;
};

export type ExecuteOutput = {
  cardId?: string;
  optionId?: string;
  effects: Effect[];
  ok: boolean;
  // Set when the runtime refused to carry out the decision (a blocked option, an edit it cannot carry out).
  refused?: string;
  note?: string;
};

// Messages that promise a plan; they are not sent when a booking they rely on failed.
const PLAN_MESSAGES = new Set(['CUSTOMER_MESSAGE', 'INSTRUCT_CHANGE', 'DRIVER_MESSAGE']);

/** When a travel quote stops being bookable: the ferry check-in cutoff, else the departure (hotels never). */
export function quoteClosesAt(quote: BookableQuote): Date | null {
  if (quote.type === 'ferry')
    return new Date(quote.sailing.checkInCutoffAt ?? quote.sailing.departureAt);
  if (quote.type === 'train') return new Date(quote.connection.departureAt);
  return null;
}

async function book(args: { ctx: RunContext; action: CardAction }): Promise<Effect> {
  const { ctx, action } = args;
  const base = { actionId: action.id, actionClass: action.actionClass };
  const [quoteFact] = action.quoteFactId ? await getFactsByIds({ ids: [action.quoteFactId] }) : [];
  const quote = readQuote(quoteFact);
  if (!quoteFact || !quote)
    return {
      ...base,
      status: 'FAILED',
      statement: `No bookable quote fact (${action.quoteFactId ?? 'none'}).`,
      factIds: action.quoteFactId ? [action.quoteFactId] : [],
    };
  const closesAt = quoteClosesAt(quote);
  if (closesAt && closesAt.getTime() <= ctx.simNow.getTime())
    return {
      ...base,
      status: 'FAILED',
      statement: `Not booked: it ${quote.type === 'ferry' ? 'closed for check-in' : 'departed'} at ${formatLocal({ at: closesAt, timeZone: 'Europe/Helsinki' })}, before this decision.`,
      factIds: [quoteFact.id],
    };
  // G8: the provider re-checks the quote right before the write.
  const result = await getTravelProvider().book({ quote, orderId: ctx.orderId, at: ctx.simNow });
  if (!result.ok || !result.bookingReference)
    return { ...base, status: 'FAILED', statement: result.statement, factIds: [quoteFact.id] };
  const booked = await recordFact(
    bookedFact({ quoteFact, quote, result, runId: ctx.run.id, simNow: ctx.simNow })
  );
  return {
    ...base,
    status: 'DONE',
    statement: booked.statement,
    factIds: [booked.id],
    bookingReference: result.bookingReference,
  };
}

const BOOKING_KINDS = ['FERRY_BOOKING', 'HOTEL_BOOKING', 'TRAVEL_BOOKING'];

type CancelTarget = {
  booking: CancellableBooking;
  reservationId: string | null;
  bookingFactId: string | null;
  subject: string;
};

/** A booking in plain words: 'train Munich → Tallinn 23 Oct 18:05', 'hotel in Tallinn from 23 Oct 22:00'. */
function bookingWords(args: {
  mode: string;
  fromCity: string | null;
  toCity: string | null;
  city: string | null;
  at: Date | string | null;
}): string {
  const { mode, fromCity, toCity, city, at } = args;
  const place = mode === 'HOTEL' ? city : fromCity;
  const when = at ? ` ${formatLocal({ at: new Date(at), timeZone: cityTimezone(place) })}` : '';
  if (mode === 'HOTEL') return `hotel in ${city ?? '?'} from${when || ' ?'}`;
  return `${mode.toLowerCase()} ${fromCity ?? '?'} → ${toCity ?? '?'}${when}`;
}

/** The booking a CANCEL_TRAVEL names: a bahn reservation (by id or its fact id) or one of our BOOKED facts. */
async function cancelTarget(args: {
  ctx: RunContext;
  target: string;
}): Promise<CancelTarget | null> {
  const { ctx, target } = args;
  const reservation = ctx.order.travelReservations.find(
    (r) =>
      r.id === target || bahnFactId('travel_reservations', r.id, reservationKind(r.kind)) === target
  );
  if (reservation)
    return {
      booking: {
        mode: reservation.kind,
        provider: reservation.provider,
        bookingReference: reservation.bookingReference,
        description: bookingWords({
          mode: reservation.kind,
          fromCity: reservation.fromCity,
          toCity: reservation.toCity,
          city: reservation.city,
          at: reservation.kind === 'HOTEL' ? reservation.checkInAt : reservation.departureAt,
        }),
      },
      reservationId: reservation.id,
      bookingFactId: bahnFactId(
        'travel_reservations',
        reservation.id,
        reservationKind(reservation.kind)
      ),
      subject: `${reservation.kind.toLowerCase()}:${reservation.id}`,
    };
  const [fact] = await getFactsByIds({ ids: [target] });
  if (!fact || fact.level !== 'BOOKED' || !BOOKING_KINDS.includes(fact.kind)) return null;
  const mode = factValue<string>(fact, 'mode') ?? 'TRAVEL';
  return {
    booking: {
      mode,
      provider: factValue<string>(fact, 'provider'),
      bookingReference: factValue<string>(fact, 'bookingReference'),
      description: bookingWords({
        mode,
        fromCity: factValue<string>(fact, 'fromCity'),
        toCity: factValue<string>(fact, 'toCity'),
        city: factValue<string>(fact, 'city'),
        at: factValue<string>(fact, mode === 'HOTEL' ? 'checkInAt' : 'departureAt'),
      }),
    },
    reservationId: factValue<string>(fact, 'reservationId'),
    bookingFactId: fact.id,
    subject: fact.subject,
  };
}

/** True when a TRAVEL_CANCELLED fact already covers this reservation or booking fact. */
function alreadyCancelled(args: { facts: Fact[]; target: CancelTarget }): boolean {
  const { facts, target } = args;
  return facts.some(
    (fact) =>
      fact.kind === 'TRAVEL_CANCELLED' &&
      ((target.reservationId && factValue(fact, 'reservationId') === target.reservationId) ||
        (target.bookingFactId && factValue(fact, 'bookingFactId') === target.bookingFactId))
  );
}

async function cancel(args: { ctx: RunContext; action: CardAction }): Promise<Effect> {
  const { ctx, action } = args;
  const base = { actionId: action.id, actionClass: action.actionClass };
  const target = action.target ? await cancelTarget({ ctx, target: action.target }) : null;
  if (!target)
    return {
      ...base,
      status: 'FAILED',
      statement: `No live booking on record for ${action.target ?? 'this step'}; nothing was cancelled.`,
      factIds: [],
    };
  if (alreadyCancelled({ facts: ctx.facts, target }))
    return {
      ...base,
      status: 'SKIPPED',
      statement: `The ${target.booking.description} is already cancelled.`,
      factIds: [],
    };
  const result = await getTravelProvider().cancel({
    booking: target.booking,
    orderId: ctx.orderId,
    at: ctx.simNow,
  });
  if (!result.ok || !result.cancellationReference)
    return { ...base, status: 'FAILED', statement: result.statement, factIds: [] };
  const cancelled = await recordFact(
    cancelledFact({
      orderId: ctx.orderId,
      subject: target.subject,
      booking: target.booking,
      reservationId: target.reservationId,
      bookingFactId: target.bookingFactId,
      result,
      runId: ctx.run.id,
      simNow: ctx.simNow,
    })
  );
  return {
    ...base,
    status: 'DONE',
    statement: cancelled.statement,
    factIds: [cancelled.id],
    cancelledReference: target.booking.bookingReference ?? undefined,
    cancellationReference: result.cancellationReference,
  };
}

/** The reference lines appended to the driver's plan once bookings and cancellations went through. */
function referenceLines(effects: Effect[]): string[] {
  const booked = effects.flatMap((effect) =>
    effect.bookingReference ? [effect.bookingReference] : []
  );
  const cancelled = effects.flatMap((effect) =>
    effect.cancellationReference
      ? [`${effect.cancelledReference ?? '?'} (cancellation ${effect.cancellationReference})`]
      : []
  );
  return [
    ...(booked.length ? [`Booking references: ${booked.join(', ')}.`] : []),
    ...(cancelled.length ? [`Cancelled: ${cancelled.join(', ')}.`] : []),
  ];
}

async function send(args: {
  ctx: RunContext;
  action: CardAction;
  party: Party;
  // Reference lines for the driver (booked and cancelled).
  footer: string[];
}): Promise<Effect> {
  const { ctx, action, party, footer } = args;
  const base = { actionId: action.id, actionClass: action.actionClass };
  if (!action.message?.trim())
    return { ...base, status: 'SKIPPED', statement: 'No message text.', factIds: [] };
  const target = partyTarget({ bundle: ctx.order, party });
  // Drafts never claim "booked" before the purchase; the driver gets the references once they exist.
  const body =
    party === 'driver' && footer.length
      ? `${action.message.trim()}\n\n${footer.join('\n')}`
      : action.message;
  const messageId = await insertMessage({
    orderId: ctx.orderId,
    party,
    partyId: target.id,
    partyName: target.name,
    fromAgent: true,
    body,
    at: ctx.simNow,
  });
  return {
    ...base,
    status: 'DONE',
    statement: `Sent to the ${party}${target.name ? ` (${target.name})` : ''}: ${body}`,
    factIds: [messageFactId({ messageId, kind: 'AGENT_MESSAGE' })],
    messageId,
  };
}

export async function executeActions(args: {
  ctx: RunContext;
  actions: CardAction[];
  changeType?: string | null;
}): Promise<Effect[]> {
  const { ctx, actions, changeType } = args;
  const effects: Effect[] = [];
  const simulated = new Map(
    await Promise.all(
      actions.map(async (action) => [action.id, await simulatedKind(action)] as const)
    )
  );
  const plan = new Map(
    planExecution({ actions, changeType, simulated: (action) => !!simulated.get(action.id) }).map(
      (step) => [step.actionId, step]
    )
  );
  // Bookings (and simulated orders/offers) first, then cancellations, so messages can carry their references.
  const isBooking = (action: CardAction) =>
    action.actionClass === 'BOOK_TRAVEL' || Boolean(simulated.get(action.id));
  const isCancel = (action: CardAction) => action.actionClass === 'CANCEL_TRAVEL';
  const ordered = [
    ...actions.filter(isBooking),
    ...actions.filter(isCancel),
    ...actions.filter((action) => !isBooking(action) && !isCancel(action)),
  ];
  for (const action of ordered) {
    const base = { actionId: action.id, actionClass: action.actionClass };
    const step = plan.get(action.id);
    const footer = referenceLines(effects);
    const failedBooking = effects.find(
      (effect) =>
        effect.status === 'FAILED' &&
        (['BOOK_TRAVEL', 'CANCEL_TRAVEL'].includes(effect.actionClass) ||
          simulated.get(effect.actionId))
    );
    // A cancellation runs only once every booking of the option went through.
    const unbooked = effects.find(
      (effect) => effect.actionClass === 'BOOK_TRAVEL' && effect.status !== 'DONE'
    );
    try {
      if (step?.mode === 'done')
        effects.push({ ...base, status: 'SKIPPED', statement: step.reason, factIds: [] });
      else if (step?.mode === 'waits')
        effects.push({
          ...base,
          status: 'WAITING',
          statement: `${action.description} ${step.reason}`,
          factIds: [],
        });
      else if (step?.mode === 'manual')
        effects.push({
          ...base,
          status: 'MANUAL',
          statement: `Needs the operator in Bahn's system: ${action.description}`,
          factIds: [],
        });
      else if (action.actionClass === 'BOOK_TRAVEL') effects.push(await book({ ctx, action }));
      else if (isCancel(action) && unbooked)
        effects.push({
          ...base,
          status: 'SKIPPED',
          statement: `Not cancelled: step ${unbooked.actionId} ${unbooked.status === 'FAILED' ? 'failed' : 'was not booked'}, so the booking it would replace stays.`,
          factIds: [],
        });
      else if (isCancel(action)) effects.push(await cancel({ ctx, action }));
      else if (simulated.get(action.id) === 'offer')
        effects.push(await sendDirectedOffer({ ctx, action }));
      else if (simulated.get(action.id) === 'roadside')
        effects.push(await orderRoadside({ ctx, action }));
      else if (
        MESSAGE_PARTY[action.actionClass] &&
        failedBooking &&
        PLAN_MESSAGES.has(action.actionClass)
      )
        effects.push({
          ...base,
          status: 'SKIPPED',
          statement: `Not sent: step ${failedBooking.actionId} failed, so this message would describe a plan that is not in place. A person decides what to say.`,
          factIds: [],
        });
      else if (MESSAGE_PARTY[action.actionClass])
        effects.push(await send({ ctx, action, party: MESSAGE_PARTY[action.actionClass], footer }));
      else
        effects.push({
          ...base,
          status: 'MANUAL',
          statement: `Needs the operator in Bahn's system: ${action.description}`,
          factIds: [],
        });
    } catch (error) {
      effects.push({ ...base, status: 'FAILED', statement: errorMessage(error), factIds: [] });
    }
  }
  // Report in the card's order, not the execution order.
  return actions.flatMap((action) => effects.filter((effect) => effect.actionId === action.id));
}

export const executeExecuteBlock: BlockExecutor = async (args) => {
  const { block, ctx } = args;
  if (block.run) return { output: await block.run(ctx) };
  const decision = latestDecision(ctx);
  if (!decision?.option) {
    const output: ExecuteOutput = { effects: [], ok: true, note: 'No approved option.' };
    return { output };
  }
  const input = {
    cardId: decision.cardId,
    optionId: decision.option.id,
    actions: decision.option.actions,
  };
  // The server refuses these too; the run checks again so a script or a stale form cannot slip past.
  const refused =
    decision.decision && decision.offered
      ? approvalProblem({ option: decision.offered, decision: decision.decision })
      : null;
  if (refused) {
    const output: ExecuteOutput = {
      cardId: decision.cardId,
      optionId: decision.option.id,
      effects: [],
      ok: false,
      refused,
    };
    return { output, input };
  }
  const effects = await executeActions({
    ctx,
    actions: decision.option.actions,
    changeType: decision.option.change?.type ?? null,
  });
  // Projects the new bahn.messages rows into facts (the ids above are their deterministic ids).
  await ctx.services.refresh();
  const output: ExecuteOutput = {
    cardId: decision.cardId,
    optionId: decision.option.id,
    effects,
    ok: effects.every((effect) => effect.status !== 'FAILED'),
  };
  return { output, input };
};
