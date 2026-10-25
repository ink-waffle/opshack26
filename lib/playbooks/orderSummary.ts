// Compact, JSON-friendly order summary for agent prompts and the get_order_context tool (no `raw`).

import type { OrderBundle } from '@/lib/bahn';
import type { Fact } from '@/lib/generated/prisma/client';

const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;

function clip(text: string, max = 280): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function summarizeOrder(bundle: OrderBundle) {
  const { order } = bundle;
  const addressById = new Map(bundle.addresses.map((address) => [address.id, address]));
  const place = (id: string | null | undefined) => {
    const address = id ? addressById.get(id) : undefined;
    return address
      ? { id: address.id, city: address.city, country: address.country, kind: address.kind }
      : null;
  };
  const primary = bundle.items.find((item) => item.role === 'PRIMARY') ?? bundle.items[0];
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    lane: order.displayLane,
    routeKind: order.routeKind,
    customer: bundle.customer
      ? { id: bundle.customer.id, name: bundle.customer.name, tier: bundle.customer.accountTier }
      : null,
    vehicle: primary?.vehicle
      ? {
          make: primary.vehicle.make,
          model: primary.vehicle.model,
          year: primary.vehicle.modelYear,
          fuel: primary.vehicle.fuel,
        }
      : null,
    pickup: place(order.pickupAddressId),
    delivery: place(order.deliveryAddressId),
    timeWindows: bundle.timeWindows.map((window) => ({
      id: window.id,
      purpose: window.purpose,
      source: window.source,
      startAt: iso(window.startAt),
      endAt: iso(window.endAt),
      timezone: window.timezone,
      selected: window.isSelected,
    })),
    assignments: bundle.assignments.map((assignment) => ({
      id: assignment.id,
      status: assignment.status,
      driver: assignment.driver
        ? {
            id: assignment.driver.id,
            name: assignment.driver.displayName,
            homeCity: assignment.driver.homeCity,
          }
        : { id: assignment.driverId },
      feeCents: assignment.feeCents,
    })),
    travelOptions: bundle.travelOptions.map((option) => ({
      id: option.id,
      kind: option.kind,
      status: option.status,
      provider: option.provider,
      from: option.fromCity,
      to: option.toCity,
      departureAt: iso(option.departureAt),
      arrivalAt: iso(option.arrivalAt),
      checkInCutoffAt: iso(option.checkInCutoffAt),
      checkedAt: iso(option.checkedAt),
      quoteCents: option.quoteCents,
      roadHoursToTerminal: option.roadTimeToTerminalHours,
      note: option.capacityNote,
    })),
    travelReservations: bundle.travelReservations.map((reservation) => ({
      id: reservation.id,
      kind: reservation.kind,
      status: reservation.status,
      route: reservation.routeLabel,
      reference: reservation.bookingReference,
      departureAt: iso(reservation.departureAt),
      expectedArrivalAt: iso(reservation.expectedArrivalAt),
      checkInCutoffAt: iso(reservation.checkInCutoffAt),
    })),
    ferryTerminals: bundle.ferryTerminals.map((terminal) => ({
      id: terminal.id,
      name: terminal.name,
      city: terminal.city,
    })),
    agentProposals: bundle.agentProposals.map((proposal) => {
      const raw = proposal.raw as {
        execution?: { status?: string; error?: string; attempted_at?: string } | null;
      };
      return {
        id: proposal.id,
        command: proposal.command,
        status: proposal.status,
        createdAt: iso(proposal.createdAt),
        execution: raw.execution ?? null,
      };
    }),
    openAlerts: bundle.alerts
      .filter((alert) => !alert.resolvedAt)
      .map((alert) => ({
        id: alert.id,
        signal: alert.signal,
        severity: alert.severity,
        summary: clip(alert.summary),
      })),
    endpoints: bundle.endpointDetails.map((detail) => ({
      id: detail.id,
      boundary: detail.boundary,
      contactStatus: detail.contactStatus,
      accessStatus: detail.accessStatus,
    })),
    recentMessages: bundle.conversations
      .flatMap((conversation) => conversation.messages)
      .sort((a, b) => a.authoredAt.getTime() - b.authoredAt.getTime())
      .slice(-12)
      .map((message) => ({
        id: message.id,
        at: iso(message.authoredAt),
        from: `${message.authorType}:${message.authorId}`,
        to: `${message.recipientType}:${message.recipientId}`,
        channel: message.channel,
        body: clip(message.body),
      })),
  };
}

export type OrderSummary = ReturnType<typeof summarizeOrder>;

/** Facts as agents see them: id, kind, level, one sentence, when, source (value only when small). */
export function compactFacts(facts: Fact[]) {
  return facts.map((fact) => {
    const value = fact.value === null ? undefined : JSON.stringify(fact.value);
    return {
      id: fact.id,
      kind: fact.kind,
      level: fact.level,
      statement: fact.statement,
      observedAt: fact.observedAt.toISOString(),
      source: fact.sourceRef,
      ...(value && value.length <= 400 ? { value: fact.value } : {}),
    };
  });
}
