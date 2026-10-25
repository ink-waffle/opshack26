// One sentence per Bahn operational event (ported and trimmed from the starter's describeEvent).

import { formatEuroCents, humanize } from '@/lib/control-room/format';
import type { BahnOperationalEvent } from '@/lib/generated/prisma/client';

type Changes = Record<string, unknown>;

const s = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const n = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function word(value: unknown): string {
  return humanize(s(value)).toLowerCase();
}

export type EventNames = {
  driver: (id: string | null | undefined) => string | null;
  point: (id: string | null | undefined) => string | null;
  actor: (args: { id: string | null; type: string }) => string | null;
};

export type EventSentence = { text: string; actor: string | null };

export function describeEvent(args: {
  event: BahnOperationalEvent;
  names: EventNames;
}): EventSentence {
  const { event, names } = args;
  const c = (event.changes ?? {}) as Changes;
  const actor = names.actor({ id: event.actorId, type: event.actorType });
  const byDriver = event.actorType === 'driver' ? actor : null;
  const to = event.toState;
  let text: string;

  switch (event.command) {
    case 'order.created':
      text = 'Order created';
      break;
    case 'order.status_changed':
      text = `Order status changed to ${word(to)}`;
      break;
    case 'order.cancelled':
      text = 'Order cancelled';
      break;
    case 'plan.created':
      text = `Transport plan ${n(c.version) ? `version ${n(c.version)} ` : ''}created`;
      break;
    case 'plan.activated':
      text = 'Transport plan activated';
      break;
    case 'plan.replaced':
      text = 'Transport plan replaced';
      break;
    case 'plan.completed':
      text = 'Transport plan completed';
      break;
    case 'availability.confirmed':
      text = 'Pickup availability confirmed';
      break;
    case 'offer.published': {
      const fee = formatEuroCents(n(c.fee_cents));
      text = `Driver offer published${fee ? ` at ${fee}` : ''}`;
      break;
    }
    case 'offer.accepted':
      text = `${byDriver ?? 'A driver'} accepted the offer`;
      break;
    case 'offer.withdrawn':
      text = 'Driver offer withdrawn';
      break;
    case 'assignment.booked':
      text = `${byDriver ?? 'A driver'} took the job`;
      break;
    case 'assignment.started':
      text = `${byDriver ?? 'The driver'} started the job in the app`;
      break;
    case 'assignment.completed':
      text = `${byDriver ?? 'The driver'} completed the job`;
      break;
    case 'assignment.cancelled':
      text = `Assignment cancelled${s(c.reason_code) ? `: ${word(c.reason_code)}` : ''}`;
      break;
    case 'vehicle.picked_up': {
      const where = names.point(event.targetId);
      text = `Car picked up${where ? ` at ${where}` : ''}`;
      break;
    }
    case 'vehicle.delivered': {
      const where = names.point(event.targetId);
      text = `Car delivered${where ? ` at ${where}` : ''}`;
      break;
    }
    case 'vehicle.custody_reported':
      text = `${byDriver ?? 'The driver'} reported who holds the car`;
      break;
    case 'proof.require':
      text = `${humanize(s(c.kind)) || 'Proof'} required`;
      break;
    case 'proof.submitted':
      text = `${humanize(s(c.kind)) || 'Proof'} submitted`;
      break;
    case 'proof.approved':
      text = `${humanize(s(c.kind)) || 'Proof'} approved`;
      break;
    case 'proof.rejected':
      text = `${humanize(s(c.kind)) || 'Proof'} rejected`;
      break;
    case 'expense.submitted': {
      const amount = formatEuroCents(n(c.amount_cents));
      text = `${humanize(s(c.kind)) || 'Cost'} claim submitted${amount ? `, ${amount}` : ''}`;
      break;
    }
    case 'expense.reviewed':
      text = `Cost claim ${word(to) || 'reviewed'}`;
      break;
    case 'travel.booked':
      text = `${humanize(s(c.kind)) || 'Travel'} booked`;
      break;
    case 'travel.rebooked':
      text = `${humanize(s(c.kind)) || 'Travel'} rebooked`;
      break;
    case 'travel.check_in_confirmed':
      text = 'Ferry check-in confirmed';
      break;
    case 'travel.check_in_rejected':
      text = 'Ferry check-in rejected at the gate';
      break;
    case 'travel.amendment_requested':
      text = 'Travel change requested from the carrier';
      break;
    case 'travel.arrival_reported':
      text = `${byDriver ?? 'The driver'} reported arrival`;
      break;
    case 'alert.raised':
      text = `Alert raised: ${word(c.signal) || 'needs a look'}`;
      break;
    case 'alert.acknowledged':
      text = 'Alert acknowledged';
      break;
    case 'alert.resolved':
      text = 'Alert resolved';
      break;
    case 'document.verified':
      text = `${humanize(s(c.kind)) || 'Document'} verified`;
      break;
    case 'work_item.opened':
    case 'work.opened':
      text = `Work item opened${s(c.decision_code) || s(c.kind) ? `: ${word(c.decision_code ?? c.kind)}` : ''}`;
      break;
    case 'endpoint.access_confirmed':
      text = `${humanize(s(c.boundary)) || 'Endpoint'} access confirmed`;
      break;
    case 'endpoint.contact_confirmed':
      text = `${humanize(s(c.boundary)) || 'Endpoint'} contact confirmed`;
      break;
    case 'incident.opened':
      text = `Incident opened: ${word(c.kind) || 'needs a look'}`;
      break;
    case 'pickup.vehicle_not_found':
      text = 'Driver could not find the car at pickup';
      break;
    case 'pickup.attempted':
      text = 'Pickup attempted';
      break;
    case 'pickup.window_revised':
      text = 'Pickup window revised';
      break;
    case 'delivery.window_revised':
      text = 'Delivery window revised';
      break;
    case 'delivery.promise_revised':
      text = 'Delivery promise revised';
      break;
    case 'delivery.delay_reported':
      text = 'Delivery delay reported';
      break;
    default:
      text = `${humanize(event.command)}${to ? `: ${word(to)}` : ''}`;
  }
  const named = actor ? text.includes(actor) : false;
  return { text, actor: named ? null : actor };
}
