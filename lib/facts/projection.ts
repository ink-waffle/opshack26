// Pure projection: one OrderBundle → facts with level, source and a deterministic dedupeKey/id.

import type { OrderBundle } from '@/lib/bahn/orders';
import { type EvidenceLevel, FACT_KINDS, type FactKind } from '@/lib/evidence/ladder';
import {
  addHours,
  cityTimezone,
  formatLocal,
  formatMoney,
  formatWindow,
  toIso,
} from '@/lib/evidence/time';
import { bahnDedupeKey, factIdFor } from '@/lib/facts/ids';
import type { FactValue, ProjectedFact } from '@/lib/facts/types';
import type { Prisma } from '@/lib/generated/prisma/client';

type Ctx = {
  bundle: OrderBundle;
  orderId: string;
  orderRef: string;
  pickupTz: string;
  deliveryTz: string;
  out: ProjectedFact[];
};

type AddArgs = {
  collection: string;
  recordId: string;
  kind: FactKind;
  subject: string;
  statement: string;
  value: FactValue;
  level?: EvidenceLevel;
  observedAt: Date | null | undefined;
  suffix?: string;
  // The order the record is filed on; undefined = this order, null = no order (shared, e.g. sites).
  homeOrderId?: string | null;
};

function clean(value: FactValue): Prisma.JsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}

function add(ctx: Ctx, args: AddArgs): void {
  const {
    collection,
    recordId,
    kind,
    subject,
    statement,
    value,
    level,
    observedAt,
    suffix,
    homeOrderId,
  } = args;
  const shared = homeOrderId !== undefined && homeOrderId !== ctx.orderId;
  const dedupeKey = bahnDedupeKey({
    collection,
    recordId,
    kind,
    suffix,
    scopeOrderId: shared ? ctx.orderId : null,
  });
  ctx.out.push({
    id: factIdFor(dedupeKey),
    orderId: ctx.orderId,
    runId: null,
    kind,
    subject,
    statement,
    value: clean({ ...value, recordId }),
    level: level ?? FACT_KINDS[kind].level,
    sourceType: 'BAHN_RECORD',
    sourceRef: `bahn.${collection}:${recordId}`,
    dedupeKey,
    observedAt: observedAt ?? ctx.bundle.order.createdAt,
  });
}

function at(date: Date | null | undefined, timeZone: string | null | undefined): string {
  return date ? formatLocal({ at: date, timeZone }) : 'an unrecorded time';
}

function quote(text: string | null | undefined, max = 280): string {
  const body = (text ?? '').replace(/\s+/g, ' ').trim();
  return `“${body.length > max ? `${body.slice(0, max - 1)}…` : body}”`;
}

function lower(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().replace(/_/g, ' ');
}

function projectOrder(ctx: Ctx): void {
  const { order, customer } = ctx.bundle;
  const cancelled = order.cancelledAt
    ? `, cancelled ${at(order.cancelledAt, ctx.pickupTz)} (${lower(order.cancellationReason)})`
    : '';
  add(ctx, {
    collection: 'orders',
    recordId: order.id,
    kind: 'ORDER_STATUS',
    subject: `order:${ctx.orderRef}`,
    statement: `Order ${ctx.orderRef} is ${order.status} (lane ${order.displayLane}, readiness ${order.readinessStatus})${cancelled}; customer ${customer?.name ?? order.customerId} (${customer?.accountTier ?? 'tier unknown'}).`,
    value: {
      reference: order.reference,
      status: order.status,
      displayLane: order.displayLane,
      readinessStatus: order.readinessStatus,
      routeKind: order.routeKind,
      customerId: order.customerId,
      customerName: customer?.name ?? null,
      accountTier: customer?.accountTier ?? null,
      cancelledAt: toIso(order.cancelledAt),
    },
    observedAt: order.updatedAt,
  });
  for (const item of ctx.bundle.items) {
    const vehicle = item.vehicle;
    if (!vehicle) continue;
    add(ctx, {
      collection: 'order_items',
      recordId: item.id,
      kind: 'VEHICLE_IDENTITY',
      subject: `vehicle:${vehicle.id}`,
      statement: `${item.role === 'PRIMARY' ? 'Car' : 'Second car (trade-in)'} on the order: ${vehicle.make} ${vehicle.model} ${vehicle.modelYear} (${lower(vehicle.fuel)}), VIN ${vehicle.syntheticVin ?? 'not supplied'}, plate ${vehicle.registration ?? 'not recorded'}.`,
      value: {
        vehicleId: vehicle.id,
        role: item.role,
        make: vehicle.make,
        model: vehicle.model,
        modelYear: vehicle.modelYear,
        fuel: vehicle.fuel,
        vin: vehicle.syntheticVin,
        registration: vehicle.registration,
        cmrMode: item.cmrMode,
      },
      observedAt: order.createdAt,
    });
  }
}

const WINDOW_KIND: Record<string, FactKind> = {
  CUSTOMER_DELIVERY_PROMISE: 'PROMISE_WINDOW',
  SELECTED_PICKUP_SLOT: 'SLOT_WINDOW',
  SELECTED_DELIVERY_SLOT: 'SLOT_WINDOW',
  REQUESTED_PICKUP_SLOT: 'REQUESTED_WINDOW',
  REQUESTED_DELIVERY_SLOT: 'REQUESTED_WINDOW',
  PICKUP_AVAILABILITY: 'AVAILABILITY_WINDOW',
};

const WINDOW_LABEL: Record<string, string> = {
  CUSTOMER_DELIVERY_PROMISE: 'Delivery promise',
  SELECTED_PICKUP_SLOT: 'Selected pickup slot',
  SELECTED_DELIVERY_SLOT: 'Selected delivery slot',
  REQUESTED_PICKUP_SLOT: 'Requested pickup slot (a wish, not agreed)',
  REQUESTED_DELIVERY_SLOT: 'Requested delivery slot (a wish, not agreed)',
  PICKUP_AVAILABILITY: 'Stated pickup availability',
};

function projectWindows(ctx: Ctx): void {
  for (const window of ctx.bundle.timeWindows) {
    const kind = WINDOW_KIND[window.purpose];
    if (!kind) continue;
    const outside = ['CUSTOMER', 'SITE'].includes(window.source);
    const level: EvidenceLevel =
      kind === 'PROMISE_WINDOW' || kind === 'SLOT_WINDOW'
        ? outside
          ? 'BOOKED'
          : 'PLANNED'
        : FACT_KINDS[kind].level;
    const approval =
      (kind === 'PROMISE_WINDOW' || kind === 'SLOT_WINDOW') && !outside
        ? ' (selected by Bahn, not customer approval)'
        : '';
    const value = {
      windowId: window.id,
      purpose: window.purpose,
      source: window.source,
      isSelected: window.isSelected,
      startAt: toIso(window.startAt),
      endAt: toIso(window.endAt),
      timezone: window.timezone,
      pointId: window.pointId,
    };
    add(ctx, {
      collection: 'time_windows',
      recordId: window.id,
      kind,
      subject: `order:${ctx.orderRef}`,
      statement: `${WINDOW_LABEL[window.purpose]}: ${formatWindow({ startAt: window.startAt, endAt: window.endAt, timeZone: window.timezone })}, source ${window.source}${approval}${window.isSelected ? '' : ', not selected'}.`,
      value,
      level,
      observedAt: window.statedAt ?? ctx.bundle.order.createdAt,
    });
    if (window.commitmentDeadlineAt) {
      add(ctx, {
        collection: 'time_windows',
        recordId: window.id,
        kind: 'HARD_DEADLINE',
        subject: `order:${ctx.orderRef}`,
        statement: `Hard deadline ${at(window.commitmentDeadlineAt, window.timezone)} (source ${window.deadlineSource ?? 'unknown'}); distinct from the target window and from any ETA.`,
        value: {
          ...value,
          deadlineAt: toIso(window.commitmentDeadlineAt),
          deadlineSource: window.deadlineSource,
        },
        level: window.deadlineSource === 'CUSTOMER_AGREEMENT' ? 'BOOKED' : 'PLANNED',
        observedAt: window.deadlineStatedAt ?? window.statedAt,
      });
    }
  }
}

function modeLabel(kind: string): string {
  return kind === 'FERRY' ? 'ferry' : kind.toLowerCase();
}

function projectTravelOptions(ctx: Ctx): void {
  for (const option of ctx.bundle.travelOptions) {
    const isFerry = option.kind === 'FERRY';
    const soldOut = option.status === 'SOLD_OUT';
    const kind: FactKind = isFerry ? (soldOut ? 'FERRY_SOLD_OUT' : 'FERRY_QUOTE') : 'TRAVEL_QUOTE';
    const fromTz = cityTimezone(option.fromCity) ?? ctx.pickupTz;
    const toTz = cityTimezone(option.toCity) ?? ctx.deliveryTz;
    const route = `${option.provider} ${modeLabel(option.kind)} ${option.fromCity} → ${option.toCity}, departs ${at(option.departureAt, fromTz)}, arrives ${at(option.arrivalAt, toTz)}${option.checkInCutoffAt ? `, check-in cutoff ${at(option.checkInCutoffAt, fromTz)}` : ''}`;
    const statement = soldOut
      ? `Sold out at the check ${at(option.checkedAt, fromTz)}: ${route}; space can reappear on a recheck.`
      : `Quote only, not booked: ${route}, ${formatMoney({ cents: option.quoteCents, currency: option.currency })}; checked ${at(option.checkedAt, fromTz)}.`;
    add(ctx, {
      collection: 'travel_options',
      recordId: option.id,
      kind,
      subject: `${modeLabel(option.kind)}:${option.id}`,
      statement,
      value: {
        travelOptionId: option.id,
        mode: option.kind,
        status: option.status,
        provider: option.provider,
        fromCity: option.fromCity,
        toCity: option.toCity,
        departureAt: toIso(option.departureAt),
        arrivalAt: toIso(option.arrivalAt),
        checkInCutoffAt: toIso(option.checkInCutoffAt),
        checkedAt: toIso(option.checkedAt),
        quoteCents: option.quoteCents,
        currency: option.currency,
        capacityNote: option.capacityNote,
        roadTimeToTerminalHours: option.roadTimeToTerminalHours,
        localTransferHours: option.localTransferHours,
        assignmentId: option.assignmentId,
      },
      observedAt: option.checkedAt,
    });
  }
}

function projectReservations(ctx: Ctx): void {
  const reportedReservations = new Set(ctx.bundle.travelConfirmations.map((c) => c.reservationId));
  const terminalName = new Map(ctx.bundle.ferryTerminals.map((t) => [t.id, t.name ?? t.id]));
  for (const res of ctx.bundle.travelReservations) {
    const kind: FactKind =
      res.kind === 'FERRY'
        ? 'FERRY_BOOKING'
        : res.kind === 'HOTEL'
          ? 'HOTEL_BOOKING'
          : 'TRAVEL_BOOKING';
    const status = res.cancelledAt ? 'CANCELLED' : res.status;
    const fromTz = cityTimezone(res.fromCity ?? res.city) ?? ctx.pickupTz;
    const toTz = cityTimezone(res.toCity) ?? ctx.deliveryTz;
    const money = formatMoney({ cents: res.fareCents, currency: res.currency });
    const head = status === 'BOOKED' ? 'Booked' : `Reservation ${status}`;
    let statement: string;
    if (kind === 'HOTEL_BOOKING') {
      statement = `${head}: hotel ${res.provider ?? ''} in ${res.city ?? 'unknown city'}, check-in ${at(res.checkInAt, fromTz)}, check-out ${at(res.checkOutAt, fromTz)}, ${money}, ref ${res.bookingReference}; does not prove the driver stayed.`;
    } else if (kind === 'FERRY_BOOKING') {
      const origin =
        (res.originTerminalId && terminalName.get(res.originTerminalId)) ??
        res.originTerminal ??
        res.fromCity;
      const destination =
        (res.destinationTerminalId && terminalName.get(res.destinationTerminalId)) ??
        res.destinationTerminal ??
        res.toCity;
      statement = `${head}: ferry ${origin ?? '?'} → ${destination ?? '?'}, departs ${at(res.departureAt, fromTz)}, arrives ${at(res.expectedArrivalAt, toTz)}${res.checkInCutoffAt ? `, check-in cutoff ${at(res.checkInCutoffAt, fromTz)}` : ''}, ref ${res.bookingReference}; check-in ${lower(res.checkInConfirmation ?? 'unconfirmed')}, boarding ${lower(res.boardingConfirmation ?? 'unconfirmed')}. A booking is not boarding.`;
    } else {
      statement = `${head}: ${modeLabel(res.kind)} ${res.fromCity ?? '?'} → ${res.toCity ?? '?'}, departs ${at(res.departureAt, fromTz)}, arrives ${at(res.expectedArrivalAt, toTz)}, ${money}, ref ${res.bookingReference}; a ticket does not prove travel.`;
    }
    const value = {
      reservationId: res.id,
      mode: res.kind,
      status,
      bookingReference: res.bookingReference,
      provider: res.provider,
      fromCity: res.fromCity,
      toCity: res.toCity,
      city: res.city,
      departureAt: toIso(res.departureAt),
      arrivalAt: toIso(res.expectedArrivalAt),
      checkInCutoffAt: toIso(res.checkInCutoffAt),
      checkInAt: toIso(res.checkInAt),
      checkOutAt: toIso(res.checkOutAt),
      fareCents: res.fareCents,
      currency: res.currency,
      assignmentId: res.assignmentId,
      sourceOptionId: res.sourceOptionId,
      bookingBasis: res.bookingBasis,
      checkInConfirmation: res.checkInConfirmation,
      boardingConfirmation: res.boardingConfirmation,
      journeyState: res.journeyState ?? res.snapshotJourneyState,
      replacesReservationId: res.replacesReservationId,
      originTerminalId: res.originTerminalId,
      destinationTerminalId: res.destinationTerminalId,
      itineraryGroupId: res.itineraryGroupId,
      legSequence: res.legSequence,
      cancelledAt: toIso(res.cancelledAt),
    };
    add(ctx, {
      collection: 'travel_reservations',
      recordId: res.id,
      kind,
      subject: `${modeLabel(res.kind)}:${res.id}`,
      statement,
      value,
      observedAt: res.bookedAt,
    });
    const driverReported =
      res.boardingConfirmation === 'DRIVER_REPORTED' ||
      res.arrivalConfirmation === 'DRIVER_REPORTED';
    if (driverReported && !reportedReservations.has(res.id)) {
      add(ctx, {
        collection: 'travel_reservations',
        recordId: res.id,
        kind: 'TRAVEL_REPORT',
        suffix: 'driver-reported',
        subject: `${modeLabel(res.kind)}:${res.id}`,
        statement: `The driver reported ${res.boardingConfirmation === 'DRIVER_REPORTED' ? 'boarding' : 'arrival'} on ${modeLabel(res.kind)} ref ${res.bookingReference}; a driver report, not a carrier record.`,
        value,
        observedAt: res.departureAt,
      });
    }
    const amendment = res.amendmentRequest as Record<string, unknown> | null;
    if (amendment && typeof amendment === 'object') {
      const requestedAt =
        typeof amendment.requested_at === 'string' ? new Date(amendment.requested_at) : null;
      add(ctx, {
        collection: 'travel_reservations',
        recordId: res.id,
        kind: 'TRAVEL_AMENDMENT_REQUESTED',
        suffix: 'amendment',
        subject: `${modeLabel(res.kind)}:${res.id}`,
        statement: `Amendment requested on ref ${res.bookingReference} (${lower(String(amendment.requested_change ?? 'change'))}) ${at(requestedAt, fromTz)}; status ${String(amendment.status ?? 'unknown')}, not a confirmed change.`,
        value: { reservationId: res.id, ...amendment },
        observedAt: requestedAt,
      });
    }
  }
}

function projectGateAndTravelReports(ctx: Ctx): void {
  const terminals = new Map(ctx.bundle.ferryTerminals.map((t) => [t.id, t]));
  for (const event of ctx.bundle.ferryTerminalEvents) {
    const terminal = event.terminalId ? terminals.get(event.terminalId) : undefined;
    add(ctx, {
      collection: 'ferry_terminal_events',
      recordId: event.id,
      kind: 'GATE_SCAN',
      subject: `ferry:${event.reservationId ?? event.id}`,
      statement: `Gate reader at ${terminal?.name ?? event.terminalId ?? 'the terminal'}: ${lower(event.kind)} ${at(event.occurredAt, terminal?.timezone)}${event.reason ? ` (${event.reason})` : ''}, receipt ${event.receiptReference ?? 'none'}.${event.kind === 'CHECK_IN_ACCEPTED' ? ' Check-in is not boarding.' : ''}`,
      value: {
        scanKind: event.kind,
        reservationId: event.reservationId,
        terminalId: event.terminalId,
        reason: event.reason,
        receiptReference: event.receiptReference,
        source: event.source,
        occurredAt: toIso(event.occurredAt),
      },
      observedAt: event.occurredAt,
    });
  }
  for (const report of ctx.bundle.travelConfirmations) {
    add(ctx, {
      collection: 'travel_confirmations',
      recordId: report.id,
      kind: 'TRAVEL_REPORT',
      subject: `driver:${report.reporterDriverId ?? 'unknown'}`,
      statement: `Driver ${report.reporterDriverId ?? '?'} reported (${lower(report.kind)}) ${at(report.reportedAt, ctx.pickupTz)}: ${quote(report.report)}; a driver report, not a carrier record.`,
      value: {
        reservationId: report.reservationId,
        reportKind: report.kind,
        driverId: report.reporterDriverId,
        report: report.report,
      },
      observedAt: report.reportedAt,
    });
  }
}

const EXPOSURE_LEVEL: Record<string, EvidenceLevel> = {
  SHOWN: 'PLANNED',
  NOTIFIED: 'OBSERVED',
  VIEWED: 'OBSERVED',
  REJECTED: 'OBSERVED',
  EXPIRED: 'OBSERVED',
  ACCEPTED: 'BOOKED',
};

function projectDispatch(ctx: Ctx): void {
  for (const offer of ctx.bundle.offers) {
    const tail = [
      offer.acceptedAt ? `accepted ${at(offer.acceptedAt, ctx.pickupTz)}` : null,
      offer.withdrawnAt ? `withdrawn ${at(offer.withdrawnAt, ctx.pickupTz)}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    add(ctx, {
      collection: 'market_offers',
      homeOrderId: offer.orderId,
      recordId: offer.id,
      kind: 'OFFER_PUBLISHED',
      subject: `offer:${offer.id}`,
      statement: `Offer ${offer.id} (${lower(offer.type)}, ${lower(offer.visibility)}) published ${at(offer.publishedAt, ctx.pickupTz)} at ${formatMoney({ cents: offer.feeCents, currency: offer.currency })}; status ${offer.status}${tail ? `, ${tail}` : ''}. An offer is not an assignment.`,
      value: {
        offerId: offer.id,
        status: offer.status,
        type: offer.type,
        visibility: offer.visibility,
        feeCents: offer.feeCents,
        currency: offer.currency,
        publishedAt: toIso(offer.publishedAt),
        expiresAt: toIso(offer.expiresAt),
        acceptedAt: toIso(offer.acceptedAt),
        withdrawnAt: toIso(offer.withdrawnAt),
        segmentIds: offer.segmentIds,
        orderIds: offer.orderIds,
      },
      observedAt: offer.publishedAt,
    });
  }
  for (const exposure of ctx.bundle.offerExposures) {
    const status = exposure.status ?? 'SHOWN';
    add(ctx, {
      collection: 'market_offer_exposures',
      recordId: exposure.id,
      kind: 'OFFER_EXPOSURE',
      subject: `driver:${exposure.driverId ?? 'unknown'}`,
      statement: `Directed offer ${exposure.offerId} to driver ${exposure.driverId}: shown ${at(exposure.shownAt, ctx.pickupTz)}, notified ${at(exposure.notifiedAt, ctx.pickupTz)}, viewed ${at(exposure.viewedAt, ctx.pickupTz)}; outcome ${status}.`,
      value: {
        exposureId: exposure.id,
        offerId: exposure.offerId,
        driverId: exposure.driverId,
        status,
        shownAt: toIso(exposure.shownAt),
        notifiedAt: toIso(exposure.notifiedAt),
        viewedAt: toIso(exposure.viewedAt),
        decidedAt: toIso(exposure.decidedAt),
        expiresAt: toIso(exposure.expiresAt),
      },
      level: EXPOSURE_LEVEL[status] ?? 'PLANNED',
      observedAt: exposure.decidedAt ?? exposure.viewedAt ?? exposure.shownAt,
    });
  }
  for (const assignment of ctx.bundle.assignments) {
    const driver = assignment.driver;
    const base = {
      assignmentId: assignment.id,
      driverId: assignment.driverId,
      driverName: driver?.displayName ?? null,
      homeCity: driver?.homeCity ?? null,
      status: assignment.status,
      feeCents: assignment.feeCents,
      currency: assignment.currency,
      acceptedAt: toIso(assignment.acceptedAt),
      startedAt: toIso(assignment.startedAt),
      completedAt: toIso(assignment.completedAt),
      cancelledAt: toIso(assignment.cancelledAt),
      segmentIds: assignment.segmentIds,
      sourceOfferId: assignment.sourceOfferId,
    };
    const subject = `driver:${assignment.driverId}`;
    add(ctx, {
      collection: 'work_assignments',
      recordId: assignment.id,
      kind: 'DRIVER_ASSIGNED',
      subject,
      statement: `Driver ${assignment.driverId} (${driver?.displayName ?? 'name unknown'}, home ${driver?.homeCity ?? 'unknown'}) accepted assignment ${assignment.id} ${at(assignment.acceptedAt, ctx.pickupTz)}; now ${assignment.status}, fee ${formatMoney({ cents: assignment.feeCents, currency: assignment.currency })}. Assigned is not collected.`,
      value: base,
      observedAt: assignment.acceptedAt,
    });
    if (assignment.startedAt) {
      add(ctx, {
        collection: 'work_assignments',
        recordId: assignment.id,
        kind: 'ASSIGNMENT_STARTED',
        subject,
        statement: `Driver ${assignment.driverId} started assignment ${assignment.id} in the app ${at(assignment.startedAt, ctx.pickupTz)}; started is not collected.`,
        value: base,
        observedAt: assignment.startedAt,
      });
    }
    if (assignment.cancelledAt) {
      add(ctx, {
        collection: 'work_assignments',
        recordId: assignment.id,
        kind: 'ASSIGNMENT_CANCELLED',
        subject,
        statement: `Assignment ${assignment.id} (driver ${assignment.driverId}) was cancelled ${at(assignment.cancelledAt, ctx.pickupTz)} (${lower(assignment.cancellationReason)}).`,
        value: { ...base, cancellationReason: assignment.cancellationReason },
        observedAt: assignment.cancelledAt,
      });
      if (assignment.cancellationPayoutDecision) {
        add(ctx, {
          collection: 'work_assignments',
          recordId: assignment.id,
          kind: 'PAYOUT_DECISION',
          subject,
          statement: `Payout decision on the cancelled assignment ${assignment.id}: ${assignment.cancellationPayoutDecision}. PAYOUT_DUE is not paid.`,
          value: { ...base, payoutDecision: assignment.cancellationPayoutDecision },
          observedAt: assignment.cancelledAt,
        });
      }
    }
    const positioning = assignment.positioning as Record<string, any> | null;
    if (positioning && typeof positioning === 'object') {
      const releaseTz = cityTimezone(positioning.planned_release_city) ?? ctx.pickupTz;
      const eta = positioning.previous_delivery_eta_at
        ? new Date(positioning.previous_delivery_eta_at)
        : null;
      const nextStart = positioning.next_pickup_start_at
        ? new Date(positioning.next_pickup_start_at)
        : null;
      add(ctx, {
        collection: 'work_assignments',
        recordId: assignment.id,
        kind: 'POSITIONING_PLAN',
        subject,
        statement: `Positioning projection for driver ${assignment.driverId}: previous duty ${positioning.previous_order_id ?? '?'} releases in ${positioning.planned_release_city ?? '?'} around ${at(eta, releaseTz)} (tracking estimate), next pickup ${positioning.next_pickup_city ?? '?'} ${at(nextStart, cityTimezone(positioning.next_pickup_city) ?? ctx.pickupTz)}; travel ${lower(positioning.travel_commitment_status)}, assessment ${lower(positioning.assessment)}. A planned release city is not a location.`,
        value: {
          assignmentId: assignment.id,
          driverId: assignment.driverId,
          assessment: positioning.assessment ?? null,
          previousAssignmentId: positioning.previous_assignment_id ?? null,
          previousOrderId: positioning.previous_order_id ?? null,
          plannedReleaseCity: positioning.planned_release_city ?? null,
          previousDeliveryEtaAt: positioning.previous_delivery_eta_at ?? null,
          nextPickupCity: positioning.next_pickup_city ?? null,
          nextPickupStartAt: positioning.next_pickup_start_at ?? null,
          travelCommitmentStatus: positioning.travel_commitment_status ?? null,
          positioningReservationIds: positioning.positioning_reservation_ids ?? [],
          matchingQuoteIds: positioning.matching_quote_ids ?? [],
          driverReportedEarliestDepartureAt:
            positioning.driver_reported_earliest_departure_at ?? null,
          driverReportMessageId: positioning.driver_report_message_id ?? null,
        },
        observedAt: positioning.driver_reported_at
          ? new Date(positioning.driver_reported_at)
          : assignment.acceptedAt,
      });
    }
  }
}

function projectEvents(ctx: Ctx): void {
  const points = new Map(ctx.bundle.plans.flatMap((plan) => plan.points).map((p) => [p.id, p]));
  const addresses = new Map(ctx.bundle.addresses.map((a) => [a.id, a]));
  for (const event of ctx.bundle.events) {
    const changes = (event.changes ?? {}) as Record<string, any>;
    const occurredAt = changes.occurred_at ? new Date(changes.occurred_at) : event.recordedAt;
    const point = points.get(event.targetId);
    const address = point ? addresses.get(point.addressId) : undefined;
    const place = address ? `${address.name}, ${address.city}` : event.targetId;
    const base = {
      eventId: event.id,
      command: event.command,
      actorType: event.actorType,
      actorId: event.actorId,
      targetType: event.targetType,
      targetId: event.targetId,
      changes,
    };
    if (event.command === 'vehicle.picked_up') {
      add(ctx, {
        collection: 'operational_events',
        recordId: event.id,
        kind: 'PICKUP_EVENT',
        subject: `order:${ctx.orderRef}`,
        statement: `Driver app recorded the car collected at ${place} ${at(occurredAt, address?.timezone ?? ctx.pickupTz)} (driver ${event.actorId}). It does not prove key count, papers or a CMR signature.`,
        value: { ...base, pointRole: point?.role ?? null, city: address?.city ?? null },
        observedAt: occurredAt,
      });
    } else if (event.command === 'vehicle.delivered') {
      const transfer = point?.role === 'TRANSFER';
      add(ctx, {
        collection: 'operational_events',
        recordId: event.id,
        kind: 'DELIVERY_EVENT',
        subject: `order:${ctx.orderRef}`,
        statement: `Driver app recorded the car delivered at ${place}${transfer ? ' (an intermediate transfer point, not the final handover)' : ''} ${at(occurredAt, address?.timezone ?? ctx.deliveryTz)} (driver ${event.actorId}). It does not prove a signed handover or who received it.`,
        value: { ...base, pointRole: point?.role ?? null, city: address?.city ?? null },
        observedAt: occurredAt,
      });
    } else if (
      event.actorType === 'customer' &&
      [
        'delivery.promise_revised',
        'delivery.promise_recorded',
        'order.cancellation_confirmed',
      ].includes(event.command)
    ) {
      add(ctx, {
        collection: 'operational_events',
        recordId: event.id,
        kind: 'CUSTOMER_APPROVAL',
        subject: `customer:${event.actorId}`,
        statement: `Customer ${event.actorId} recorded ${lower(event.command.replace('.', ' '))} ${at(event.recordedAt, ctx.deliveryTz)} via ${lower(event.source)}.`,
        value: base,
        observedAt: event.recordedAt,
      });
    } else if (/window_revised$|window\.selected$|_window\.selected$/.test(event.command)) {
      const approved = changes.customer_confirmation_message_id
        ? ' with a linked customer confirmation message'
        : '';
      add(ctx, {
        collection: 'operational_events',
        recordId: event.id,
        kind: 'WINDOW_REVISED',
        subject: `order:${ctx.orderRef}`,
        statement: `${event.actorId ?? 'An operator'} recorded ${lower(event.command.replace('.', ' '))} ${at(event.recordedAt, ctx.pickupTz)}${approved}${changes.customer_approval_recorded === false ? ' (customer approval not recorded)' : ''}.`,
        value: base,
        observedAt: event.recordedAt,
      });
    }
  }
  for (const visit of ctx.bundle.siteVisits) {
    add(ctx, {
      collection: 'site_visits',
      recordId: visit.id,
      kind: 'PICKUP_ATTEMPT',
      subject: `site:${visit.siteId ?? 'unknown'}`,
      statement: `Driver arrived at ${visit.siteId ?? 'the site'} ${at(visit.arrivedAt, ctx.pickupTz)}${visit.leftAt ? `, left ${at(visit.leftAt, ctx.pickupTz)}` : ''}; outcome ${lower(visit.outcome)}${visit.verifiedBySite ? ' (confirmed by the site)' : ' (not confirmed by the site)'}. A visit is not a collection.`,
      value: {
        visitId: visit.id,
        siteId: visit.siteId,
        outcome: visit.outcome,
        verifiedBySite: visit.verifiedBySite,
        arrivedAt: toIso(visit.arrivedAt),
        leftAt: toIso(visit.leftAt),
        assignmentId: visit.assignmentId,
      },
      observedAt: visit.arrivedAt,
    });
  }
}

function projectTracking(ctx: Ctx): void {
  for (const obs of ctx.bundle.trackingObservations) {
    const source = obs.source === 'driver_app' ? 'App' : 'Schedule-inferred';
    add(ctx, {
      collection: 'tracking_observations',
      recordId: obs.id,
      kind: 'TRACKING_OBSERVATION',
      subject: `driver-app:${obs.assignmentId}`,
      statement: `${source} ${lower(obs.locationQuality)} estimate at ${at(obs.observedAt, ctx.pickupTz)} (received ${at(obs.receivedAt, ctx.pickupTz)}): ${obs.distanceRemainingKm} km left, ${Math.round(obs.progressFraction * 100)}% done, estimated delivery ${at(obs.estimatedDeliveryAt, ctx.deliveryTz)}; an estimate, not a verified location.`,
      value: {
        observationId: obs.id,
        assignmentId: obs.assignmentId,
        source: obs.source,
        locationQuality: obs.locationQuality,
        observationKind: obs.observationKind,
        distanceRemainingKm: obs.distanceRemainingKm,
        progressFraction: obs.progressFraction,
        estimatedDeliveryAt: toIso(obs.estimatedDeliveryAt),
        observedAt: toIso(obs.observedAt),
        receivedAt: toIso(obs.receivedAt),
        reservationId: obs.reservationId,
        contextNote: obs.contextNote,
      },
      observedAt: obs.observedAt,
    });
  }
}

const SPEAKER_KIND: Record<string, FactKind> = {
  driver: 'DRIVER_STATEMENT',
  customer: 'CUSTOMER_STATEMENT',
  site_contact: 'SITE_STATEMENT',
  handoff_contact: 'HANDOFF_STATEMENT',
  agent: 'AGENT_MESSAGE',
};

const WAIT_LIMIT =
  /\b(?:can|could|will) (?:only )?wait (?:for )?(?:another |an extra |a further )?(\d{1,3}) ?(minutes|mins|min|hours|hour|h)\b/i;

function projectMessages(ctx: Ctx): void {
  for (const conversation of ctx.bundle.conversations) {
    for (const message of conversation.messages) {
      const kind: FactKind =
        message.authorType === 'operator'
          ? message.visibility === 'INTERNAL'
            ? 'OPERATOR_NOTE'
            : 'OPERATOR_MESSAGE'
          : (SPEAKER_KIND[message.authorType] ?? 'OPERATOR_NOTE');
      const tz =
        message.authorType === 'customer' || message.authorType === 'handoff_contact'
          ? ctx.deliveryTz
          : ctx.pickupTz;
      const when = at(message.authoredAt, tz);
      const name = message.authorNameSnapshot ? ` (${message.authorNameSnapshot})` : '';
      const speaker =
        kind === 'OPERATOR_NOTE'
          ? `Internal note by ${message.authorId}`
          : kind === 'OPERATOR_MESSAGE'
            ? `${message.authorId} wrote to the ${lower(message.recipientType)}`
            : kind === 'AGENT_MESSAGE'
              ? `Agent ${message.authorId} wrote to the ${lower(message.recipientType)}`
              : `${message.authorType === 'site_contact' ? 'Site contact' : message.authorType === 'handoff_contact' ? 'Handoff contact' : message.authorType === 'driver' ? 'Driver' : 'Customer'} ${message.authorId}${name} said`;
      const subject = ['driver', 'customer', 'site_contact', 'handoff_contact'].includes(
        message.authorType
      )
        ? `${message.authorType === 'site_contact' ? 'site' : message.authorType === 'handoff_contact' ? 'handoff' : message.authorType}:${message.authorId}`
        : `order:${ctx.orderRef}`;
      const value = {
        messageId: message.id,
        conversationId: message.conversationId,
        filedOnOrderId: message.orderId,
        authorType: message.authorType,
        authorId: message.authorId,
        authorName: message.authorNameSnapshot,
        recipientType: message.recipientType,
        recipientId: message.recipientId,
        channel: message.channel,
        visibility: message.visibility,
        language: message.language,
        body: message.body,
        authoredAt: toIso(message.authoredAt),
      };
      add(ctx, {
        collection: 'messages',
        homeOrderId: message.orderId,
        recordId: message.id,
        kind,
        subject,
        statement: `${speaker} (${lower(message.channel)}, ${when}): ${quote(message.body)}`,
        value,
        observedAt: message.authoredAt,
      });
      const limit = message.authorType === 'driver' ? WAIT_LIMIT.exec(message.body) : null;
      if (limit) {
        const amount = Number(limit[1]);
        const hours = /^h/i.test(limit[2]) ? amount : amount / 60;
        const until = addHours({ at: message.authoredAt, hours });
        add(ctx, {
          collection: 'messages',
          homeOrderId: message.orderId,
          recordId: message.id,
          kind: 'DRIVER_STATED_LIMIT',
          subject,
          statement: `Driver ${message.authorId} said they can wait until about ${at(until, tz)} (${quote(limit[0], 80)}); a statement, not a commitment.`,
          value: { ...value, at: until.toISOString(), quote: limit[0] },
          observedAt: message.authoredAt,
        });
      }
    }
  }
  for (const thread of ctx.bundle.supportThreads) {
    const linked = thread.linkedOrderIds.includes(ctx.orderId);
    for (const message of thread.messages) {
      add(ctx, {
        collection: 'support_inbox_messages',
        homeOrderId: null,
        recordId: message.id,
        kind: 'INBOX_MESSAGE',
        subject: `inbox:${thread.id}`,
        statement: `Support inbox (${lower(thread.linkState)}${linked ? ', linked to this order' : ', candidate match only, not a link'}): ${message.authorType} ${message.authorId} wrote ${at(message.authoredAt, ctx.pickupTz)}: ${quote(message.body)}`,
        value: {
          messageId: message.id,
          threadId: thread.id,
          linkState: thread.linkState,
          linked,
          candidateOrderIds: thread.candidateOrderIds,
          authorType: message.authorType,
          authorId: message.authorId,
          body: message.body,
        },
        observedAt: message.authoredAt,
      });
    }
  }
  for (const note of ctx.bundle.notes) {
    add(ctx, {
      collection: 'order_notes',
      recordId: note.id,
      kind: 'OPERATOR_NOTE',
      subject: `order:${ctx.orderRef}`,
      statement: `Order note (${lower(note.purpose)}) by ${note.authorId ?? 'unknown'} ${at(note.authoredAt, ctx.pickupTz)}: ${quote(note.body)}`,
      value: { noteId: note.id, purpose: note.purpose, authorId: note.authorId, body: note.body },
      observedAt: note.authoredAt,
    });
  }
}

const ORDER_SPECIFIC_SOURCES = new Set([
  'CUSTOMER_AND_HANDOFF_CONTACT',
  'DIRECT_HANDOFF_CONTACT_REPLY',
  'HANDOFF_ACCESS_REPLY',
  'SITE_ACCESS_REPLY',
  'SITE_CONTACT_REPLY',
]);

function projectEndpoints(ctx: Ctx): void {
  for (const detail of ctx.bundle.endpointDetails) {
    const source = detail.lastConfirmedSource ?? detail.statedBy;
    const orderSpecific = ORDER_SPECIFIC_SOURCES.has(detail.lastConfirmedSource ?? '');
    const boundary = detail.boundary === 'PICKUP' ? 'Pickup' : 'Delivery';
    const value = {
      endpointDetailId: detail.id,
      boundary: detail.boundary,
      accessStatus: detail.accessStatus,
      contactStatus: detail.contactStatus,
      contactName: detail.contactName,
      contactRole: detail.contactRole,
      contactHandle: detail.contactHandle,
      accessInstruction: detail.accessInstruction,
      lastConfirmedSource: detail.lastConfirmedSource,
      lastConfirmedAt: toIso(detail.lastConfirmedAt),
      statedBy: detail.statedBy,
      orderSpecific,
      siteId: detail.siteId,
    };
    const confirmedBasis =
      detail.accessStatus === 'CONFIRMED'
        ? orderSpecific
          ? ` (order-specific, source ${source})`
          : ` (source ${source}: a standard instruction, not a call about this car)`
        : '';
    add(ctx, {
      collection: 'order_endpoint_details',
      recordId: detail.id,
      kind: 'ENDPOINT_ACCESS',
      subject: `endpoint:${detail.boundary}`,
      statement: `${boundary} access ${detail.accessStatus}${confirmedBasis}: ${quote(detail.accessInstruction, 200)}`,
      value,
      observedAt: detail.lastConfirmedAt ?? detail.statedAt,
    });
    add(ctx, {
      collection: 'order_endpoint_details',
      recordId: detail.id,
      kind: 'ENDPOINT_CONTACT',
      subject: `endpoint:${detail.boundary}`,
      statement: `${boundary} contact ${detail.contactName ?? 'not recorded'} (${detail.contactRole}) is ${detail.contactStatus}${detail.contactStatus === 'CONFIRMED' ? ` (source ${source}${orderSpecific ? ', order-specific' : ''})` : ''}.`,
      value,
      observedAt: detail.lastConfirmedAt ?? detail.statedAt,
    });
    for (const claim of detail.claims) {
      add(ctx, {
        collection: 'endpoint_claims',
        recordId: claim.id,
        kind: 'ENDPOINT_CLAIM',
        subject: `endpoint:${detail.boundary}`,
        statement: `Claim about the ${lower(claim.field)} from ${lower(claim.sourceType)} (${lower(claim.confidence)}): ${quote(claim.claim, 200)}; resolution ${lower(claim.resolutionStatus ?? 'open')}.`,
        value: {
          claimId: claim.id,
          endpointDetailId: detail.id,
          field: claim.field,
          sourceType: claim.sourceType,
          sourceId: claim.sourceId,
          confidence: claim.confidence,
          resolutionStatus: claim.resolutionStatus,
          claim: claim.claim,
        },
        level: claim.resolutionStatus === 'VERIFIED' ? 'VERIFIED' : 'STATED',
        observedAt: claim.resolvedAt ?? claim.recordedAt,
      });
    }
  }
  for (const site of ctx.bundle.sites) {
    add(ctx, {
      collection: 'sites',
      homeOrderId: null,
      recordId: site.id,
      kind: 'SITE_PROFILE',
      subject: `site:${site.id}`,
      statement: `Site ${site.name} (${site.city}) standing procedure: ${lower(site.handoverMode)}, release rule ${lower(site.releaseDocumentRule)}${site.requiresSignedRelease ? ', signed release required' : ''}, ${site.advanceNoticeMinutes} min notice; the standard procedure, not an order-specific confirmation.`,
      value: {
        siteId: site.id,
        name: site.name,
        city: site.city,
        timezone: site.timezone,
        handoverMode: site.handoverMode,
        releaseDocumentRule: site.releaseDocumentRule,
        requiresSignedRelease: site.requiresSignedRelease,
        advanceNoticeMinutes: site.advanceNoticeMinutes,
        openingHours: site.openingHours,
        pickupAccessNote: site.pickupAccessNote,
        deliveryAccessNote: site.deliveryAccessNote,
      },
      observedAt: ctx.bundle.order.createdAt,
    });
  }
}

const PROOF_LEVEL: Record<string, EvidenceLevel> = {
  REQUIRED: 'PLANNED',
  SUBMITTED: 'OBSERVED',
  REJECTED: 'OBSERVED',
  APPROVED: 'VERIFIED',
  WAIVED: 'VERIFIED',
};

const DOCUMENT_LEVEL: Record<string, EvidenceLevel> = {
  REQUESTED: 'REQUESTED',
  PREPARED: 'PLANNED',
  MISSING: 'PLANNED',
  SIGNED: 'OBSERVED',
  VERIFIED: 'VERIFIED',
};

const DOCUMENT_CAVEAT: Record<string, string> = {
  PREPARED: 'prepared is not signed',
  MISSING: 'required but nothing is filed',
  REQUESTED: 'requested, not received',
  SIGNED: 'SIGNED does not mean the receiver signed',
  VERIFIED: 'verified by an operator',
};

function projectEvidence(ctx: Ctx): void {
  for (const proof of ctx.bundle.proofs) {
    add(ctx, {
      collection: 'proofs',
      recordId: proof.id,
      kind: 'PROOF',
      subject: `proof:${proof.id}`,
      statement: `${lower(proof.kind)} ${proof.status}${proof.fileCount ? ` (${proof.fileCount} files)` : ''}${proof.reviewNote ? `: ${quote(proof.reviewNote, 160)}` : ''}; photos show condition, not when or by whom damage happened.`,
      value: {
        proofId: proof.id,
        proofKind: proof.kind,
        status: proof.status,
        fileCount: proof.fileCount,
        pointId: proof.pointId,
        submittedAt: toIso(proof.submittedAt),
        reviewedAt: toIso(proof.reviewedAt),
        requiredBy: toIso(proof.requiredBy),
        reviewNote: proof.reviewNote,
      },
      level: PROOF_LEVEL[proof.status] ?? 'PLANNED',
      observedAt: proof.reviewedAt ?? proof.submittedAt ?? ctx.bundle.order.createdAt,
    });
  }
  for (const doc of ctx.bundle.documents) {
    const scope = doc.signatureScope ? `, signature scope ${doc.signatureScope}` : '';
    add(ctx, {
      collection: 'documents',
      recordId: doc.id,
      kind: 'DOCUMENT',
      subject: `document:${doc.id}`,
      statement: `${lower(doc.kind)}${doc.medium ? ` (${lower(doc.medium)})` : ''} is ${doc.status}${scope}; ${DOCUMENT_CAVEAT[doc.status] ?? 'see the document'}${doc.signatureScope === 'BOTH' ? '; two marks, receiver name not verified' : ''}.`,
      value: {
        documentId: doc.id,
        docKind: doc.kind,
        status: doc.status,
        medium: doc.medium,
        signatureScope: doc.signatureScope,
        fileCount: doc.fileCount,
        pointId: doc.pointId,
      },
      level: DOCUMENT_LEVEL[doc.status] ?? 'PLANNED',
      observedAt: doc.updatedAt,
    });
  }
  for (const asset of ctx.bundle.custodyAssets) {
    add(ctx, {
      collection: 'custody_assets',
      homeOrderId: asset.orderId,
      recordId: asset.id,
      kind: 'CUSTODY_ASSET',
      subject: `custody:${asset.id}`,
      statement: `${asset.label ?? lower(asset.kind)}: holder claim ${lower(asset.holderRole) || 'unknown'} ${asset.holderId ?? ''} (${lower(asset.holderBasis)}), status ${lower(asset.status)}${asset.nextAction ? `; next: ${asset.nextAction}` : ''}.`,
      value: {
        assetId: asset.id,
        assetKind: asset.kind,
        status: asset.status,
        holderRole: asset.holderRole,
        holderId: asset.holderId,
        holderBasis: asset.holderBasis,
        physicalHandoverVerifiedAt: toIso(asset.physicalHandoverVerifiedAt),
        followupDueAt: toIso(asset.followupDueAt),
      },
      level: asset.physicalHandoverVerifiedAt ? 'VERIFIED' : 'STATED',
      observedAt: asset.events.at(-1)?.occurredAt ?? ctx.bundle.order.createdAt,
    });
  }
  for (const report of ctx.bundle.custodyReports) {
    add(ctx, {
      collection: 'custody_reports',
      recordId: report.id,
      kind: 'CUSTODY_REPORT',
      subject: `driver:${report.driverId ?? 'unknown'}`,
      statement: `Driver ${report.driverId ?? '?'} reported custody ${at(report.reportedAt, ctx.pickupTz)}: ${lower(report.reportedSecurity)}; location evidence ${lower(report.locationEvidenceStatus)}. A statement, not continuous observation.`,
      value: {
        reportId: report.id,
        driverId: report.driverId,
        reportedSecurity: report.reportedSecurity,
        locationEvidenceStatus: report.locationEvidenceStatus,
        continuityEvidenceStatus: report.continuityEvidenceStatus,
        sourceMessageId: report.sourceMessageId,
      },
      observedAt: report.reportedAt,
    });
  }
}

const EXPENSE_LEVEL: Record<string, EvidenceLevel> = {
  SUBMITTED: 'STATED',
  SUPERSEDED: 'STATED',
  APPROVED: 'VERIFIED',
  REJECTED: 'VERIFIED',
};

function projectWork(ctx: Ctx): void {
  for (const alert of ctx.bundle.alerts) {
    const value = {
      alertId: alert.id,
      signal: alert.signal,
      severity: alert.severity,
      status: alert.status,
      owner: alert.owner,
      summary: alert.summary,
      evidenceRefs: alert.evidenceRefs,
      nextAction: alert.nextAction,
      assignmentId: alert.assignmentId,
    };
    add(ctx, {
      collection: 'alerts',
      recordId: alert.id,
      kind: 'ALERT',
      subject: `alert:${alert.id}`,
      statement: `Alert ${alert.signal} (${alert.severity}) raised ${at(alert.triggeredAt, ctx.pickupTz)}: ${quote(alert.summary, 200)}; a reason to look, not a diagnosis.`,
      value,
      observedAt: alert.triggeredAt,
    });
    if (alert.acknowledgedAt) {
      add(ctx, {
        collection: 'alerts',
        recordId: alert.id,
        kind: 'ALERT_ACKNOWLEDGED',
        subject: `alert:${alert.id}`,
        statement: `Alert ${alert.signal} acknowledged by ${alert.owner ?? 'an operator'} ${at(alert.acknowledgedAt, ctx.pickupTz)}${alert.acknowledgementReason ? `: ${quote(alert.acknowledgementReason, 200)}` : ''}; the risk is not gone.`,
        value,
        observedAt: alert.acknowledgedAt,
      });
    }
    if (alert.resolvedAt) {
      add(ctx, {
        collection: 'alerts',
        recordId: alert.id,
        kind: 'ALERT_RESOLVED',
        subject: `alert:${alert.id}`,
        statement: `Alert ${alert.signal} resolved ${at(alert.resolvedAt, ctx.pickupTz)}${alert.resolutionReason ? `: ${quote(alert.resolutionReason, 200)}` : ''}.`,
        value: { ...value, resolutionEvidenceRefs: alert.resolutionEvidenceRefs },
        observedAt: alert.resolvedAt,
      });
    }
  }
  for (const incident of ctx.bundle.incidents) {
    add(ctx, {
      collection: 'incidents',
      recordId: incident.id,
      kind: 'INCIDENT',
      subject: `incident:${incident.id}`,
      statement: `Incident ${incident.kind} opened ${at(incident.openedAt, ctx.pickupTz)} (${lower(incident.status)}, owner ${incident.owner ?? 'none'})${incident.reportedSymptom ? `; reported symptom ${quote(incident.reportedSymptom, 120)}` : ''}${incident.reportedStopText ? `; reported stop ${quote(incident.reportedStopText, 120)}` : ''}${incident.locationVerified === false ? '; location unverified' : ''}.`,
      value: {
        incidentId: incident.id,
        incidentKind: incident.kind,
        status: incident.status,
        owner: incident.owner,
        reportedSymptom: incident.reportedSymptom,
        reportedStopText: incident.reportedStopText,
        locationVerified: incident.locationVerified,
        recoveryDecision: incident.recoveryDecision,
        assignmentId: incident.assignmentId,
      },
      observedAt: incident.openedAt,
    });
  }
  for (const item of ctx.bundle.workItems) {
    add(ctx, {
      collection: 'work_items',
      homeOrderId: item.orderId,
      recordId: item.id,
      kind: 'WORK_ITEM',
      subject: `work:${item.id}`,
      statement: `Work item ${item.kind} (${item.priority}) opened ${at(item.openedAt, ctx.pickupTz)}, owner ${item.owner}, due ${at(item.dueAt, ctx.pickupTz)}, ${item.status}: ${quote(item.summary, 160)} Next: ${quote(item.nextAction, 200)}. An owner does not mean anyone read it.`,
      value: {
        workItemId: item.id,
        workKind: item.kind,
        status: item.status,
        priority: item.priority,
        owner: item.owner,
        dueAt: toIso(item.dueAt),
        nextAction: item.nextAction,
      },
      observedAt: item.openedAt,
    });
  }
  for (const expense of ctx.bundle.expenses) {
    add(ctx, {
      collection: 'expenses',
      recordId: expense.id,
      kind: 'EXPENSE',
      subject: `expense:${expense.id}`,
      statement: `${expense.payer === 'BAHN' ? 'Bahn-paid' : `Driver ${expense.driverId ?? ''}`} ${lower(expense.kind)} cost ${formatMoney({ cents: expense.amountCents, currency: expense.currency })} is ${expense.status}${expense.reviewNote ? ` (${quote(expense.reviewNote, 140)})` : ''}; approved is not paid.`,
      value: {
        expenseId: expense.id,
        expenseKind: expense.kind,
        status: expense.status,
        amountCents: expense.amountCents,
        currency: expense.currency,
        isEur: expense.currency === 'EUR',
        payer: expense.payer,
        driverId: expense.driverId,
        reservationId: expense.reservationId,
        assignmentId: expense.assignmentId,
        receiptState: expense.receiptState,
        submittedAt: toIso(expense.submittedAt),
        reviewedAt: toIso(expense.reviewedAt),
      },
      level: EXPENSE_LEVEL[expense.status] ?? 'STATED',
      observedAt: expense.reviewedAt ?? expense.submittedAt,
    });
  }
}

const BOOKING_COMMAND = /^travel\.(book|rebook)/;

function projectProposals(ctx: Ctx): void {
  for (const proposal of ctx.bundle.agentProposals) {
    const payload = (proposal.proposedPayload ?? {}) as Record<string, unknown>;
    const review = proposal.review as Record<string, any> | null;
    const execution = proposal.execution as Record<string, any> | null;
    const base = {
      proposalId: proposal.id,
      command: proposal.command,
      agentId: proposal.proposedByAgentId,
      status: proposal.status,
      targetType: proposal.targetType,
      targetId: proposal.targetId,
      payload,
    };
    add(ctx, {
      collection: 'agent_proposals',
      recordId: proposal.id,
      kind: 'AGENT_PROPOSAL',
      subject: `proposal:${proposal.id}`,
      statement: `${proposal.proposedByAgentId} proposed ${proposal.command} ${at(proposal.createdAt, ctx.pickupTz)}: ${quote(proposal.summary, 160)}; now ${proposal.status}. Proposal text proves nothing changed.`,
      value: { ...base, evidenceRefs: proposal.evidenceRefs as Prisma.JsonValue },
      observedAt: proposal.createdAt,
    });
    if (review?.decision) {
      const reviewedAt = review.reviewed_at ? new Date(review.reviewed_at) : null;
      add(ctx, {
        collection: 'agent_proposals',
        recordId: proposal.id,
        kind: 'PROPOSAL_REVIEW',
        subject: `proposal:${proposal.id}`,
        statement: `${review.reviewer_id ?? 'An operator'} ${review.decision} ${proposal.command} ${at(reviewedAt, ctx.pickupTz)}${review.decision_note ? `: ${quote(review.decision_note, 200)}` : ''}${review.decision === 'APPROVED' ? '. Approved is not executed.' : '.'}`,
        value: {
          ...base,
          decision: review.decision,
          reviewerId: review.reviewer_id ?? null,
          note: review.decision_note ?? null,
          finalPayload: review.final_payload ?? null,
        },
        observedAt: reviewedAt,
      });
    }
    if (execution?.status) {
      const attemptedAt = execution.attempted_at ? new Date(execution.attempted_at) : null;
      const value = {
        ...base,
        executionStatus: execution.status,
        attemptedAt: toIso(attemptedAt),
        error: execution.error ?? null,
        effectEventIds: execution.effect_event_ids ?? [],
        travelOptionId: (payload.travel_option_id as string | undefined) ?? null,
      };
      if (execution.status === 'SUCCEEDED') {
        add(ctx, {
          collection: 'agent_proposals',
          recordId: proposal.id,
          kind: 'PROPOSAL_EXECUTED',
          subject: `proposal:${proposal.id}`,
          statement: `${proposal.command} executed ${at(attemptedAt, ctx.pickupTz)} (effect events ${(execution.effect_event_ids ?? []).join(', ') || 'none'}).`,
          value,
          observedAt: attemptedAt,
        });
      } else {
        const booking = BOOKING_COMMAND.test(proposal.command);
        add(ctx, {
          collection: 'agent_proposals',
          recordId: proposal.id,
          kind: booking ? 'BOOKING_OUTCOME_UNKNOWN' : 'EXECUTION_FAILED',
          subject: `proposal:${proposal.id}`,
          statement: booking
            ? `Booking attempt ${proposal.command}${value.travelOptionId ? ` for ${value.travelOptionId}` : ''} failed ${at(attemptedAt, ctx.pickupTz)}: ${quote(execution.error, 200)}. Outcome unknown: reconcile with the provider before any retry or alternative purchase.`
            : `${proposal.command} failed ${at(attemptedAt, ctx.pickupTz)}: ${quote(execution.error, 200)}. Reconcile before retrying.`,
          value,
          observedAt: attemptedAt,
        });
      }
    }
  }
}

/** Every fact the bundle supports; deterministic (same bundle → same ids, keys and order). */
export function projectOrderFacts(args: { bundle: OrderBundle }): ProjectedFact[] {
  const { bundle } = args;
  const addressTz = (id: string | null | undefined) =>
    bundle.addresses.find((a) => a.id === id)?.timezone;
  const pickupWindow = bundle.timeWindows.find(
    (w) => w.purpose === 'SELECTED_PICKUP_SLOT' && w.isSelected
  );
  const promise = bundle.timeWindows.find(
    (w) => w.purpose === 'CUSTOMER_DELIVERY_PROMISE' && w.isSelected
  );
  const ctx: Ctx = {
    bundle,
    orderId: bundle.order.id,
    orderRef: bundle.order.reference,
    pickupTz: pickupWindow?.timezone ?? addressTz(bundle.order.pickupAddressId) ?? 'UTC',
    deliveryTz: promise?.timezone ?? addressTz(bundle.order.deliveryAddressId) ?? 'UTC',
    out: [],
  };
  projectOrder(ctx);
  projectWindows(ctx);
  projectTravelOptions(ctx);
  projectReservations(ctx);
  projectGateAndTravelReports(ctx);
  projectDispatch(ctx);
  projectEvents(ctx);
  projectTracking(ctx);
  projectMessages(ctx);
  projectEndpoints(ctx);
  projectEvidence(ctx);
  projectWork(ctx);
  projectProposals(ctx);
  const seen = new Set<string>();
  return ctx.out.filter((fact) => {
    if (seen.has(fact.dedupeKey ?? fact.id)) return false;
    seen.add(fact.dedupeKey ?? fact.id);
    return true;
  });
}
