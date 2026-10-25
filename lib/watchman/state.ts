import type { OrderBundle } from '@/lib/bahn';
import { renderLadderForDecisions } from '@/lib/evidence';
import type { BahnConversation, BahnMessage } from '@/lib/generated/prisma/client';
import {
  fmtAt,
  fmtDuration,
  fmtLocal,
  fmtNow,
  fmtRel,
  fmtUtc,
  hoursBetween,
  money,
  truncate,
} from '@/lib/watchman/format';
import { MONITOR_LABELS, type MonitorHit } from '@/lib/watchman/monitors';

// Compact, typed order state for Jev. Wording makes evidence levels explicit (quoted ≠ booked ≠ checked in).

export type TriggerItem =
  | { kind: 'message'; message: BahnMessage; conversation: BahnConversation | null }
  | { kind: 'record'; collection: string; id: string; record: Record<string, unknown> | null }
  | { kind: 'monitor'; hit: MonitorHit };

export type WatchmanState = {
  now: string;
  trigger: Record<string, unknown>;
  order: Record<string, unknown>;
  route: string[];
  pickup: string;
  promise: string;
  deadlines: string[];
  assignments: string[];
  travel: string[];
  tracking: string;
  endpoints: string[];
  openIssues: string[];
  recentEvents: string[];
  messages: string[];
  evidenceRules: string;
};

export type Commitment = { at: Date; reason: string };

const INBOUND_AUTHORS = new Set(['driver', 'site_contact', 'customer', 'handoff_contact']);

export function isInboundMessage(message: Pick<BahnMessage, 'authorType'>): boolean {
  return INBOUND_AUTHORS.has(message.authorType);
}

const before = (date: Date | null | undefined, asOf: Date) =>
  !date || date.getTime() <= asOf.getTime();
const after = (date: Date | null | undefined, asOf: Date) =>
  !!date && date.getTime() > asOf.getTime();

/** The bundle as it looked at `asOf`: later records dropped, later status changes rolled back. */
export function clipBundle(args: { bundle: OrderBundle; asOf: Date }): OrderBundle {
  const { bundle, asOf } = args;
  return {
    ...bundle,
    assignments: bundle.assignments
      .filter((a) => before(a.acceptedAt, asOf))
      .map((a) => {
        const cancelled = !!a.cancelledAt && !after(a.cancelledAt, asOf);
        const completed = !!a.completedAt && !after(a.completedAt, asOf);
        const started = !!a.startedAt && !after(a.startedAt, asOf);
        return {
          ...a,
          status: cancelled
            ? 'CANCELLED'
            : completed
              ? 'COMPLETED'
              : started
                ? 'IN_PROGRESS'
                : 'ASSIGNED',
          cancelledAt: cancelled ? a.cancelledAt : null,
          completedAt: completed ? a.completedAt : null,
          startedAt: started ? a.startedAt : null,
        };
      }),
    travelOptions: bundle.travelOptions.filter((o) => before(o.checkedAt, asOf)),
    travelReservations: bundle.travelReservations.filter((r) => before(r.bookedAt, asOf)),
    travelConfirmations: bundle.travelConfirmations.filter((c) => before(c.reportedAt, asOf)),
    ferryTerminalEvents: bundle.ferryTerminalEvents.filter((e) => before(e.occurredAt, asOf)),
    conversations: bundle.conversations
      .filter((c) => before(c.startedAt, asOf))
      .map((c) => ({ ...c, messages: c.messages.filter((m) => before(m.authoredAt, asOf)) })),
    alerts: bundle.alerts
      .filter((a) => before(a.triggeredAt, asOf))
      .map((a) =>
        after(a.resolvedAt, asOf) || (a.status === 'ACKNOWLEDGED' && after(a.acknowledgedAt, asOf))
          ? {
              ...a,
              status: before(a.acknowledgedAt, asOf) && a.acknowledgedAt ? 'ACKNOWLEDGED' : 'OPEN',
              resolvedAt: null,
            }
          : a
      ),
    incidents: bundle.incidents
      .filter((i) => before(i.openedAt, asOf))
      .map((i) => (after(i.resolvedAt, asOf) ? { ...i, status: 'OPEN', resolvedAt: null } : i)),
    workItems: bundle.workItems
      .filter((w) => before(w.openedAt, asOf))
      .map((w) => (after(w.closedAt, asOf) ? { ...w, status: 'OPEN', closedAt: null } : w)),
    agentProposals: bundle.agentProposals.filter((p) => before(p.createdAt, asOf)),
    events: bundle.events.filter((e) => before(e.recordedAt, asOf)),
    trackingObservations: bundle.trackingObservations.filter((t) => before(t.receivedAt, asOf)),
    endpointDetails: bundle.endpointDetails.map((d) => ({
      ...d,
      claims: d.claims.filter((c) => before(c.recordedAt, asOf)),
    })),
    siteVisits: bundle.siteVisits.filter((v) => before(v.arrivedAt, asOf)),
    notes: bundle.notes.filter((n) => before(n.authoredAt, asOf)),
  };
}

function pointLabel(args: { bundle: OrderBundle; pointId: string }): string {
  const { bundle, pointId } = args;
  const point = bundle.activePlan?.points.find((p) => p.id === pointId);
  if (!point) return pointId;
  const address = bundle.addresses.find((a) => a.id === point.addressId);
  const site = bundle.sites.find((s) => s.id === point.siteId);
  return `${address?.city ?? '?'} (${address?.country ?? '?'})${site ? ` ${site.name}` : ''}`;
}

function boundaryPoint(args: { bundle: OrderBundle; boundary: 'PICKUP' | 'DELIVERY' }) {
  return args.bundle.activePlan?.points.find((p) => p.orderBoundary === args.boundary) ?? null;
}

export function pickupSlot(bundle: OrderBundle) {
  const point = boundaryPoint({ bundle, boundary: 'PICKUP' });
  const selected = bundle.timeWindows.filter(
    (w) => w.isSelected && w.purpose === 'SELECTED_PICKUP_SLOT'
  );
  return selected.find((w) => w.pointId === point?.id) ?? selected[0] ?? null;
}

export function promiseWindow(bundle: OrderBundle) {
  const point = boundaryPoint({ bundle, boundary: 'DELIVERY' });
  const selected = bundle.timeWindows.filter(
    (w) => w.isSelected && w.purpose === 'CUSTOMER_DELIVERY_PROMISE'
  );
  return selected.find((w) => w.pointId === point?.id) ?? selected[0] ?? null;
}

function windowText(args: { start: Date; end: Date; timezone: string; now: Date }) {
  const { start, end, timezone, now } = args;
  const endLocal = fmtLocal(end, timezone).split(' ')[2];
  const local = `${fmtLocal(start, timezone).replace(` ${timezone}`, '')}–${endLocal} ${timezone}`;
  const where =
    start > now
      ? `starts ${fmtRel(start, now)}`
      : end > now
        ? `started ${fmtDuration(now.getTime() - start.getTime())} ago, ends ${fmtRel(end, now)}`
        : `ended ${fmtDuration(now.getTime() - end.getTime())} ago`;
  return `${local} (${fmtUtc(start)}–${fmtUtc(end)}); ${where}`;
}

const SOURCE_WORDING: Record<string, string> = {
  CUSTOMER: 'agreed with the customer',
  OPS: 'set by Bahn ops, not customer-approved',
  SYSTEM: 'system estimate, not customer-approved',
  SITE: 'stated by the site',
};

function pickupText(args: { bundle: OrderBundle; now: Date }): string {
  const { bundle, now } = args;
  const slot = pickupSlot(bundle);
  const point = boundaryPoint({ bundle, boundary: 'PICKUP' });
  const picked = bundle.events.find(
    (e) => e.command === 'vehicle.picked_up' && (!point || e.targetId === point.id)
  );
  const attempted = bundle.events.find((e) => e.command === 'pickup.attempted');
  const parts = [
    slot
      ? `Selected pickup slot ${windowText({ start: slot.startAt, end: slot.endAt, timezone: slot.timezone, now })}, ${SOURCE_WORDING[slot.source] ?? `source ${slot.source}`}.`
      : 'No selected pickup slot.',
    picked
      ? `PICKED UP: pickup event ${fmtAt(picked.recordedAt, now)} (driver app).`
      : 'No pickup event recorded.',
    attempted ? `Pickup attempted ${fmtAt(attempted.recordedAt, now)} without collection.` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

function promiseText(args: { bundle: OrderBundle; now: Date }): string {
  const { bundle, now } = args;
  const promise = promiseWindow(bundle);
  const delivered = bundle.events.find((e) => e.command === 'vehicle.delivered');
  const parts = [
    promise
      ? `Delivery promise ${windowText({ start: promise.startAt, end: promise.endAt, timezone: promise.timezone, now })}, ${SOURCE_WORDING[promise.source] ?? `source ${promise.source}`}.`
      : 'No delivery promise recorded.',
    promise?.commitmentDeadlineAt
      ? `Outer commitment deadline ${fmtUtc(promise.commitmentDeadlineAt)} (${promise.deadlineSource ?? 'source unknown'}).`
      : '',
    delivered ? `DELIVERED: delivery event ${fmtAt(delivered.recordedAt, now)}.` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

/** Upcoming hard commitments (pickup slot, unchecked ferry cutoffs, paid departures, promise), earliest first. */
export function upcomingCommitments(args: { bundle: OrderBundle; now: Date }): Commitment[] {
  const { bundle, now } = args;
  const list: Commitment[] = [];
  const slot = pickupSlot(bundle);
  const pickedUp = bundle.events.some((e) => e.command === 'vehicle.picked_up');
  if (slot && !pickedUp && slot.startAt > now)
    list.push({
      at: slot.startAt,
      reason: `pickup slot starts (${fmtLocal(slot.startAt, slot.timezone)})`,
    });
  for (const r of bundle.travelReservations) {
    if (r.status !== 'BOOKED' || r.cancelledAt) continue;
    if (r.kind === 'FERRY' && r.checkInCutoffAt && r.checkInCutoffAt > now)
      list.push({
        at: r.checkInCutoffAt,
        reason: `check-in cutoff of booked ferry ${r.routeLabel}`,
      });
    else if ((r.kind === 'TRAIN' || r.kind === 'FLIGHT') && r.departureAt > now)
      list.push({
        at: r.departureAt,
        reason: `departure of the paid ${r.kind.toLowerCase()} ${r.routeLabel}`,
      });
  }
  const promise = promiseWindow(bundle);
  const delivered = bundle.events.some((e) => e.command === 'vehicle.delivered');
  if (promise && !delivered && promise.startAt > now)
    list.push({
      at: promise.startAt,
      reason: `delivery promise window opens (${fmtLocal(promise.startAt, promise.timezone)})`,
    });
  return list.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function travelLines(args: { bundle: OrderBundle; now: Date }): string[] {
  const { bundle, now } = args;
  const lines: string[] = [];
  for (const r of bundle.travelReservations) {
    const cutoff = r.checkInCutoffAt ? `; check-in cutoff ${fmtAt(r.checkInCutoffAt, now)}` : '';
    const gate =
      r.kind === 'FERRY'
        ? `; check-in ${r.checkInConfirmation ?? 'UNCONFIRMED'}, boarding ${r.boardingConfirmation ?? 'UNCONFIRMED'}`
        : '';
    lines.push(
      `${r.kind} ${r.routeLabel} dep ${fmtAt(r.departureAt, now)}, arr ${fmtUtc(r.expectedArrivalAt)}: ${r.status} (ref ${r.bookingReference}, booked ${fmtRel(r.bookedAt, now)}${r.fareCents ? `, ${money(r.fareCents, r.currency)}` : ''})${cutoff}${gate}.`
    );
  }
  for (const o of bundle.travelOptions) {
    const booking = bundle.travelReservations.find((r) => r.sourceOptionId === o.id);
    const state =
      o.status === 'SOLD_OUT'
        ? 'SOLD OUT'
        : `QUOTED ${money(o.quoteCents, o.currency) ?? '(no price)'}`;
    const age = hoursBetween(o.checkedAt, now);
    lines.push(
      `${o.kind} ${o.fromCity}→${o.toCity} dep ${fmtUtc(o.departureAt)}, arr ${fmtUtc(o.arrivalAt)}: ${state} as of a check ${fmtDuration(now.getTime() - o.checkedAt.getTime())} ago${age > 1.5 ? ' (stale, re-check before relying on it)' : ''}; ${booking ? `booked as ${booking.id}` : 'NOT booked'}.`
    );
  }
  for (const e of bundle.ferryTerminalEvents) {
    lines.push(
      `Gate ${e.kind ?? 'event'} ${e.occurredAt ? fmtAt(e.occurredAt, now) : ''}${e.reason ? `: ${e.reason}` : ''} (terminal record).`
    );
  }
  for (const c of bundle.travelConfirmations.slice(-3))
    lines.push(
      `Driver report${c.reportedAt ? ` ${fmtAt(c.reportedAt, now)}` : ''} (${c.kind ?? 'travel'}): ${truncate(c.report ?? '', 140)} (REPORTED, not verified).`
    );
  return lines;
}

function trackingText(args: { bundle: OrderBundle; now: Date }): string {
  const { bundle, now } = args;
  const last = [...bundle.trackingObservations].sort(
    (a, b) => b.observedAt.getTime() - a.observedAt.getTime()
  )[0];
  if (!last) return 'No tracking observation recorded.';
  return `Last tracking observation ${fmtAt(last.observedAt, now)} (received ${fmtRel(last.receivedAt, now)}), quality ${last.locationQuality}, ${Math.round(last.progressFraction * 100)}% of the leg, ${last.distanceRemainingKm} km remaining; tracking ETA ${fmtUtc(last.estimatedDeliveryAt)} is a coarse estimate, not a promise or a location fix.`;
}

function speaker(args: { bundle: OrderBundle; message: BahnMessage }): string {
  const { bundle, message } = args;
  const driver = bundle.assignments.find((a) => a.driverId === message.authorId)?.driver;
  const name =
    message.authorNameSnapshot ??
    driver?.displayName ??
    (message.authorType === 'customer' ? bundle.customer?.name : null);
  return `${message.authorType}${name ? ` ${name}` : ''}`;
}

function messageLine(args: { bundle: OrderBundle; message: BahnMessage; now: Date; max: number }) {
  const { bundle, message, now, max } = args;
  const tags = [
    message.channel,
    message.visibility === 'INTERNAL' ? 'internal note' : null,
    message.language !== 'en' ? message.language : null,
  ].filter(Boolean);
  return `${fmtAt(message.authoredAt, now)} ${speaker({ bundle, message })} → ${message.recipientType} [${tags.join(', ')}]: "${truncate(message.body, max)}"`;
}

function openIssueLines(args: { bundle: OrderBundle; now: Date }): string[] {
  const { bundle, now } = args;
  const lines: string[] = [];
  for (const a of bundle.alerts.filter((a) => a.status === 'OPEN' || a.status === 'ACKNOWLEDGED'))
    lines.push(
      `Alert ${a.signal} (${a.severity}, ${a.status}${a.owner ? `, owner ${a.owner}` : ''}) since ${fmtAt(a.triggeredAt, now)}: ${truncate(a.summary, 200)}`
    );
  for (const i of bundle.incidents.filter((i) => !i.resolvedAt))
    lines.push(
      `Incident ${i.kind ?? '?'} ${i.status ?? ''}${i.reportedSymptom ? `: ${i.reportedSymptom}` : ''}${i.locationVerified === false ? ' (location not verified)' : ''}`
    );
  for (const w of bundle.workItems.filter((w) => w.status !== 'DONE'))
    lines.push(
      `Work item ${w.kind} (${w.priority}, owner ${w.owner}, due ${fmtAt(w.dueAt, now)}): ${truncate(w.summary, 160)} Next: ${truncate(w.nextAction, 160)}`
    );
  for (const p of bundle.agentProposals.filter(
    (p) => p.status !== 'EXECUTED' && p.status !== 'REJECTED'
  )) {
    const execution = p.execution as { status?: string; error?: string } | null;
    lines.push(
      `Agent proposal ${p.command} ${p.status}${execution?.status ? ` (execution ${execution.status}${execution.error ? `: ${truncate(String(execution.error), 80)}` : ''})` : ''}: ${truncate(p.summary, 140)}`
    );
  }
  for (const c of bundle.conversations.filter((c) => c.status === 'OPEN' && c.waitingOn))
    lines.push(
      `Conversation ${c.category} waiting on ${c.waitingOn}${c.nextCheckAt ? `, next check ${fmtAt(c.nextCheckAt, now)}` : ''}`
    );
  return lines;
}

function triggerSection(args: { bundle: OrderBundle; trigger: TriggerItem; now: Date }) {
  const { bundle, trigger, now } = args;
  if (trigger.kind === 'message') {
    const { message, conversation } = trigger;
    return {
      kind: 'inbound message',
      from: `${speaker({ bundle, message })} (${message.authorId})`,
      at: fmtAt(message.authoredAt, now),
      channel: message.channel,
      language: message.language,
      thread: conversation ? `${conversation.category} (${conversation.status})` : null,
      text: truncate(message.body, 1500),
    };
  }
  if (trigger.kind === 'monitor')
    return {
      kind: 'time monitor',
      monitor: `${trigger.hit.monitor}: ${MONITOR_LABELS[trigger.hit.monitor]}`,
      finding: trigger.hit.summary,
    };
  const { raw: _raw, ...record } = trigger.record ?? {};
  return {
    kind: 'new record',
    record: `${trigger.collection}:${trigger.id}`,
    content: truncate(JSON.stringify(record), 900),
  };
}

// Built once from the single evidence ladder (lib/evidence) so Jev and the agents read the same rules.
const EVIDENCE_RULES = renderLadderForDecisions();

/** Builds the compact state for one order around the triggering item. */
export function buildOrderState(args: {
  bundle: OrderBundle;
  now: Date;
  trigger: TriggerItem;
  asOf?: Date;
  maxMessages?: number;
}): WatchmanState {
  const { now, trigger, asOf, maxMessages = 8 } = args;
  const bundle = asOf ? clipBundle({ bundle: args.bundle, asOf }) : args.bundle;
  const { order, customer } = bundle;
  const primary = bundle.items.find((item) => item.role === 'PRIMARY')?.vehicle;
  const tradeIn = bundle.items.find((item) => item.role !== 'PRIMARY')?.vehicle;
  const triggerMessageId = trigger.kind === 'message' ? trigger.message.id : null;

  const messages = bundle.conversations
    .flatMap((c) => c.messages)
    .sort((a, b) => a.authoredAt.getTime() - b.authoredAt.getTime());
  const recent = messages.slice(-maxMessages);

  const segments = bundle.activePlan?.segments ?? [];
  const route = segments.map(
    (s) =>
      `${s.sequence}. ${pointLabel({ bundle, pointId: s.fromPointId })} → ${pointLabel({ bundle, pointId: s.toPointId })} by ${s.transportMode.toLowerCase()} (${s.distanceKm} km, ${s.status})`
  );

  return {
    now: fmtNow(now),
    trigger: triggerSection({ bundle, trigger, now }),
    order: {
      reference: order.reference,
      status: order.status,
      lane: order.displayLane,
      routeKind: order.routeKind,
      readiness: order.readinessStatus,
      ...(order.cancelledAt ? { cancelled: fmtAt(order.cancelledAt, now) } : {}),
      customer: customer ? `${customer.name} (${customer.accountTier}, ${customer.country})` : null,
      vehicle: primary
        ? `${primary.make} ${primary.model} ${primary.modelYear}, ${primary.fuel}, VIN ${primary.syntheticVin ?? 'not recorded'}, plate ${primary.registration ?? 'not recorded'}`
        : null,
      ...(tradeIn ? { tradeIn: `${tradeIn.make} ${tradeIn.model} ${tradeIn.modelYear}` } : {}),
    },
    route,
    pickup: pickupText({ bundle, now }),
    promise: promiseText({ bundle, now }),
    deadlines: upcomingCommitments({ bundle, now })
      .slice(0, 4)
      .map((c) => `${fmtAt(c.at, now)}: ${c.reason}`),
    assignments: bundle.assignments.map((a) => {
      const positioning = a.positioning as { assessment?: string } | null;
      return `${a.id}: driver ${a.driver?.displayName ?? '?'} (${a.driverId}, home ${a.driver?.homeCity ?? '?'}), ${a.status}${a.startedAt ? `, started ${fmtRel(a.startedAt, now)}` : ', not started'}${a.cancelledAt ? `, cancelled ${fmtRel(a.cancelledAt, now)}${a.cancellationReason ? ` (${a.cancellationReason})` : ''}` : ''}${positioning?.assessment ? `, positioning ${positioning.assessment}` : ''}`;
    }),
    travel: travelLines({ bundle, now }),
    tracking: trackingText({ bundle, now }),
    endpoints: bundle.endpointDetails.map(
      (d) =>
        `${d.boundary}: contact ${d.contactStatus}${d.contactName ? ` (${d.contactName}, ${d.contactRole})` : ''}, access ${d.accessStatus}, last confirmed by ${d.lastConfirmedSource ?? 'nobody'}${d.claims.length ? `; ${d.claims.length} claim(s), latest ${d.claims.at(-1)?.sourceType ?? '?'} ${d.claims.at(-1)?.resolutionStatus ?? ''}` : ''}`
    ),
    openIssues: openIssueLines({ bundle, now }),
    recentEvents: bundle.events
      .slice(-6)
      .map(
        (e) =>
          `${fmtUtc(e.recordedAt)} ${e.actorType} ${e.command}${e.toState ? ` → ${e.toState}` : ''}`
      ),
    messages: recent.map(
      (message) =>
        `${messageLine({ bundle, message, now, max: message.id === triggerMessageId ? 120 : 280 })}${message.id === triggerMessageId ? ' ◀ TRIGGERING ITEM' : ''}`
    ),
    evidenceRules: EVIDENCE_RULES,
  };
}

export function stateSize(state: WatchmanState): number {
  return Buffer.byteLength(JSON.stringify(state), 'utf8');
}
