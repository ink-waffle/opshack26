import { getMessage, getOrderBundle, isBahnCollection, type OrderBundle } from '@/lib/bahn';
import { simNow } from '@/lib/clock';
import { listOrderFacts, syncOrderFacts } from '@/lib/facts';
import type { Prisma } from '@/lib/generated/prisma/client';
import { resolveRoutingParams } from '@/lib/meta/params';
import { prisma } from '@/lib/prismaClient';
import {
  type DispatchOutcome,
  dispatchPlaybook,
  findActiveRun,
  openTriageCard,
  openUnreadCard,
} from '@/lib/watchman/dispatch';
import { type MonitorHit, parseMonitorKey, runMonitors } from '@/lib/watchman/monitors';
import { type Classification, classify } from '@/lib/watchman/questions';
import {
  decideRoute,
  isAcknowledgement,
  ROUTING_PARAMS,
  type RoutingDecision,
  type RoutingParams,
  type SignalSource,
  type TriageContext,
} from '@/lib/watchman/routing';
import {
  buildOrderState,
  isInboundMessage,
  type TriggerItem,
  type WatchmanState,
} from '@/lib/watchman/state';

// inspect(): state → Jev → control.signals row → route (playbook task, TRIAGE card or record only).

export type InspectArgs = {
  kind: SignalSource;
  // message: bahn.messages id; record: '<collection>:<id>'; monitor: the hit key 'M2:<orderId>:<ref>'.
  ref: string;
  orderId?: string;
  // Re-inspect even if this exact item already has a signal.
  force?: boolean;
  params?: RoutingParams;
};

export type RoutingRecord = RoutingDecision & {
  dispatches: DispatchOutcome[];
  card?: { cardId: string; status: 'created' | 'appended' };
  // Triage items on an order with an active playbook run go to that run instead of a card.
  attachedRunId?: string;
  error?: string;
};

export type InspectResult = {
  signalId: string | null;
  orderId: string | null;
  skipped?: string;
  triggerType?: string | null;
  routing?: RoutingRecord;
  monitorSignals?: InspectResult[];
};

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

// Signals stamped after `now` belong to a sim future that was rolled back (clock reset) and do not count.
async function existingSignal(args: { source: SignalSource; sourceRef: string; now?: Date }) {
  const { source, sourceRef, now } = args;
  return prisma.signal.findFirst({
    where: { source, sourceRef, ...(now ? { simAt: { lte: now } } : {}) },
  });
}

/** Projects the order's facts (lib/facts) and returns their ids, the triggering record's fact first. */
async function gatherFactIds(args: { orderId: string; now: Date; sourceRef: string }) {
  const { orderId, now, sourceRef } = args;
  try {
    await syncOrderFacts({ orderId });
    const facts = await listOrderFacts({ orderId, observedBefore: now });
    const recordId = sourceRef.includes(':') ? sourceRef.split(':').slice(1).join(':') : sourceRef;
    const own = facts.filter((f) => f.sourceRef.endsWith(`:${recordId}`));
    const rest = facts.filter((f) => !own.includes(f)).reverse();
    return [...own, ...rest].slice(0, 40).map((f) => f.id);
  } catch (error) {
    console.warn(`[watchman] facts unavailable for ${orderId}: ${String(error)}`);
    return [];
  }
}

function answersRecord(classification: Classification | null, error?: string) {
  if (!classification) return { error };
  const { answers, triggers, ...rest } = classification;
  return { ...rest, triggers, raw: answers };
}

/** Writes the signal, then runs the routing side effects and stores their outcome on it. */
async function recordAndRoute(args: {
  bundle: OrderBundle;
  source: SignalSource;
  sourceRef: string;
  trigger: TriggerItem;
  state: WatchmanState;
  classification: Classification | null;
  decision: RoutingDecision;
  now: Date;
  params: RoutingParams;
  error?: string;
}): Promise<InspectResult> {
  const { bundle, source, sourceRef, trigger, state, classification, decision, now, params } = args;
  const { error } = args;
  const routing: RoutingRecord = { ...decision, dispatches: [], ...(error ? { error } : {}) };
  const signal = await prisma.signal.create({
    data: {
      orderId: bundle.order.id,
      source,
      sourceRef,
      triggerType: decision.triggerType,
      probability: decision.probability,
      state: toJson(state),
      answers: toJson(answersRecord(classification, error)),
      routing: toJson(routing),
      simAt: now,
    },
  });

  if (decision.action === 'playbook') {
    // One playbook per signal (R1 M4): two plans for one message could book twice; the runner-up is recorded only.
    const [best, ...rest] = decision.playbooks;
    if (best)
      routing.dispatches.push(
        await dispatchPlaybook({
          match: best,
          orderId: bundle.order.id,
          orderRef: bundle.order.reference,
          signalId: signal.id,
          params,
        })
      );
    for (const match of rest)
      routing.dispatches.push({
        playbookId: match.playbookId,
        triggerType: match.triggerType,
        status: 'not_dispatched',
        reason: `one playbook per signal: ${best?.playbookId} takes this one`,
      });
  } else if (error && (source === 'message' || source === 'record')) {
    // The decision model failed: nobody has read this item, so a person must (and a retry skips it).
    routing.card = await openUnreadCard({
      bundle,
      trigger,
      error,
      signalId: signal.id,
      now,
      factIds: await gatherFactIds({ orderId: bundle.order.id, now, sourceRef }),
    });
  } else if (decision.action === 'triage' && classification) {
    // An order already worked by a playbook gets the item through that run, not a second card.
    const run = await findActiveRun({ orderId: bundle.order.id, orderRef: bundle.order.reference });
    if (run) routing.attachedRunId = run.id;
    else
      routing.card = await openTriageCard({
        bundle,
        trigger,
        classification,
        decision,
        signalId: signal.id,
        now,
        factIds: await gatherFactIds({ orderId: bundle.order.id, now, sourceRef }),
      });
  }
  if (routing.dispatches.length || routing.card || routing.attachedRunId)
    await prisma.signal.update({ where: { id: signal.id }, data: { routing: toJson(routing) } });
  console.info(
    `[watchman] ${bundle.order.reference} ${source}:${sourceRef} → ${decision.action} ${decision.triggerType ?? ''} (${decision.reason})${routing.dispatches.map((d) => ` [${d.playbookId}: ${d.status}${d.triggerRunId ? ` ${d.triggerRunId}` : ''}]`).join('')}${routing.card ? ` [card ${routing.card.cardId} ${routing.card.status}]` : ''}`
  );
  return {
    signalId: signal.id,
    orderId: bundle.order.id,
    triggerType: decision.triggerType,
    routing,
  };
}

/** Signals one deterministic monitor hit (p = 1, no Jev): playbook if one exists, else signal only. */
export async function processMonitorHit(args: {
  hit: MonitorHit;
  bundle?: OrderBundle;
  now?: Date;
  params?: RoutingParams;
}): Promise<InspectResult> {
  const { hit, params = ROUTING_PARAMS } = args;
  const now = args.now ?? (await simNow());
  if (await existingSignal({ source: 'monitor', sourceRef: hit.key, now }))
    return { signalId: null, orderId: hit.orderId, skipped: 'monitor hit already signalled' };
  const bundle = args.bundle ?? (await getOrderBundle({ ref: hit.orderId }));
  if (!bundle) return { signalId: null, orderId: hit.orderId, skipped: 'order not found' };
  const decision = decideRoute({
    source: 'monitor',
    triggers: [{ type: hit.triggerType, p: 1 }],
    needsAttention: null,
    params,
  });
  return recordAndRoute({
    bundle,
    source: 'monitor',
    sourceRef: hit.key,
    trigger: { kind: 'monitor', hit },
    state: buildOrderState({ bundle, now, trigger: { kind: 'monitor', hit } }),
    classification: null,
    decision: { ...decision, reason: `${hit.monitor}: ${decision.reason}` },
    now,
    params,
  });
}

/** Runs every monitor for one order now and signals the new hits. */
export async function runOrderMonitors(args: {
  bundle: OrderBundle;
  now: Date;
  params?: RoutingParams;
}): Promise<InspectResult[]> {
  const { bundle, now, params } = args;
  const results: InspectResult[] = [];
  for (const hit of runMonitors({ bundle, now }))
    results.push(await processMonitorHit({ hit, bundle, now, params }));
  return results.filter((result) => result.signalId);
}

async function classifyAndRoute(args: {
  bundle: OrderBundle;
  source: SignalSource;
  sourceRef: string;
  trigger: TriggerItem;
  now: Date;
  params: RoutingParams;
}): Promise<InspectResult> {
  const { bundle, source, sourceRef, trigger, now, params } = args;
  const state = buildOrderState({ bundle, now, trigger });
  let classification: Classification | null = null;
  let error: string | undefined;
  try {
    classification = await classify({ state, sessionId: `watchman:${bundle.order.id}` });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  const context: TriageContext = {
    orderClosed:
      !!bundle.order.cancelledAt ||
      ['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(bundle.order.status),
    acknowledgement: trigger.kind === 'message' && isAcknowledgement(trigger.message.body),
  };
  const decision = classification
    ? decideRoute({
        source,
        triggers: classification.triggers,
        needsAttention: classification.needsAttention,
        params,
        context,
      })
    : decideRoute({ source, triggers: [], needsAttention: null, params });
  const result = await recordAndRoute({
    bundle,
    source,
    sourceRef,
    trigger,
    state,
    classification,
    decision: error
      ? { ...decision, reason: `could not classify it: the decision model failed (${error})` }
      : decision,
    now,
    params,
    error,
  });
  if (error)
    throw new Error(`watchman: Jev failed for ${sourceRef} (signal ${result.signalId}): ${error}`);
  return result;
}

async function inspectMessage(args: InspectArgs & { now: Date; params: RoutingParams }) {
  const { now, params, force } = args;
  const id = args.ref.replace(/^messages:/, '');
  const found = await getMessage({ id });
  if (!found) throw new Error(`watchman: message ${id} not found`);
  const { message, conversation } = found;
  if (!isInboundMessage(message))
    return {
      signalId: null,
      orderId: message.orderId,
      skipped: `${message.authorType} message is outbound`,
    };
  if (!force && (await existingSignal({ source: 'message', sourceRef: id })))
    return { signalId: null, orderId: message.orderId, skipped: 'message already inspected' };
  const bundle = await getOrderBundle({ ref: message.orderId });
  if (!bundle) throw new Error(`watchman: order ${message.orderId} not found`);
  return classifyAndRoute({
    bundle,
    source: 'message',
    sourceRef: id,
    trigger: { kind: 'message', message, conversation },
    now,
    params,
  });
}

async function inspectRecord(args: InspectArgs & { now: Date; params: RoutingParams }) {
  const { ref, now, params, force } = args;
  const [collection, ...rest] = ref.split(':');
  const id = rest.join(':');
  if (!isBahnCollection(collection) || !id)
    throw new Error(`watchman: record ref must be '<collection>:<id>', got ${ref}`);
  if (collection === 'messages') return inspectMessage({ ...args, ref: id });
  const rows = await prisma.$queryRawUnsafe<{ raw: Record<string, unknown> }[]>(
    `SELECT raw FROM "bahn"."${collection}" WHERE id = $1`,
    id
  );
  const record = rows[0]?.raw ?? null;
  if (!record) throw new Error(`watchman: ${ref} not found`);
  const orderId = args.orderId ?? (typeof record.order_id === 'string' ? record.order_id : null);
  if (!orderId) return { signalId: null, orderId: null, skipped: `${ref} has no order` };
  const bundle = await getOrderBundle({ ref: orderId });
  if (!bundle) throw new Error(`watchman: order ${orderId} not found`);
  // A new record can make a time monitor fire before the next tick.
  const monitorSignals = await runOrderMonitors({ bundle, now, params });
  if (!force && (await existingSignal({ source: 'record', sourceRef: ref })))
    return { signalId: null, orderId, skipped: 'record already inspected', monitorSignals };
  const result = await classifyAndRoute({
    bundle,
    source: 'record',
    sourceRef: ref,
    trigger: { kind: 'record', collection, id, record },
    now,
    params,
  });
  return { ...result, monitorSignals };
}

async function inspectMonitor(args: InspectArgs & { now: Date; params: RoutingParams }) {
  const { ref, now, params } = args;
  const { orderId } = parseMonitorKey(ref);
  const bundle = await getOrderBundle({ ref: orderId });
  if (!bundle) throw new Error(`watchman: order ${orderId} not found`);
  const hit = runMonitors({ bundle, now }).find((h) => h.key === ref);
  if (!hit)
    return { signalId: null, orderId, skipped: `${ref} does not fire at ${now.toISOString()}` };
  return processMonitorHit({ hit, bundle, now, params });
}

/** Watchman entry point for one new message, record or monitor hit. */
export async function inspect(args: InspectArgs): Promise<InspectResult> {
  const now = await simNow();
  // Approved routing amendments (meta-system) override ROUTING_PARAMS.
  const params = args.params ?? (await resolveRoutingParams());
  if (args.kind === 'message') return inspectMessage({ ...args, now, params });
  if (args.kind === 'record') return inspectRecord({ ...args, now, params });
  return inspectMonitor({ ...args, now, params });
}
