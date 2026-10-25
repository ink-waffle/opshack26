// Demo scenarios: pnpm sim:scenario <S1|S2|S3|S4|S6> [--order CD-…] [--direct] [--phase started|ended] [--local-tick]
// S1 ferry full / missed, S2 red warning light, S3 pickup slot passes (sim clock), S4 message no playbook covers,
// S6 missed sailing with booked hotel and return train after it (sim clock past the cutoff).

import { getOrderBundle, insertBahnRecords, type OrderBundle } from '@/lib/bahn';
import { addDays, localDate, zonedInstant } from '@/lib/chain/itinerary/places';
import { setSimClock, simNow } from '@/lib/clock';
import { cityTimezone } from '@/lib/evidence/time';
import { prisma } from '@/lib/prismaClient';
import { fmtLocal, fmtUtc } from '@/lib/watchman/format';
import type { InspectResult } from '@/lib/watchman/inspect';
import { pickupSlot } from '@/lib/watchman/state';
import { watchmanTick } from '@/lib/watchman/tick';
import {
  activeAssignment,
  arg,
  describeInspect,
  finish,
  flag,
  followRun,
  injectMessage,
  notifyWatchman,
  simId,
  type Speaker,
} from '@/scripts/simulate/shared';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// demo:reset deletes bahn.travel_reservations rows with this prefix.
const SIM_RESERVATION_PREFIX = 'res-sim-';

const vehicleOf = (bundle: OrderBundle) => {
  const vehicle = bundle.items.find((item) => item.role === 'PRIMARY')?.vehicle;
  return vehicle ? `${vehicle.make} ${vehicle.model}` : 'the car';
};

async function pick(args: { preferred: string[]; fallback: () => Promise<string | null> }) {
  const explicit = arg('order');
  if (explicit) return explicit;
  for (const ref of args.preferred) {
    const bundle = await getOrderBundle({ ref });
    if (bundle && bundle.order.status !== 'DELIVERED' && !bundle.order.cancelledAt) return ref;
  }
  const fallback = await args.fallback();
  if (!fallback) throw new Error('no suitable order found; pass --order CD-…');
  return fallback;
}

async function sendAndFollow(args: { orderRef: string; from: Speaker; text: string }) {
  const { orderRef, from, text } = args;
  console.log(`${orderRef} ← ${from}: "${text}"`);
  const injected = await injectMessage({ orderRef, from, text });
  console.log(`inserted bahn.messages ${injected.messageId} at sim ${fmtUtc(injected.authoredAt)}`);
  const { runId, via } = await notifyWatchman({
    collection: 'messages',
    id: injected.messageId,
    orderId: injected.orderId,
    direct: flag('direct'),
  });
  console.log(`watchman-inspect ${runId} (via ${via})`);
  const run = await followRun({ runId });
  console.log(describeInspect(run.output as InspectResult));
  if (run.error) console.log(run.error);
}

async function s1() {
  const now = await simNow();
  const orderRef = await pick({
    preferred: ['CD-420075', 'CD-420584', 'CD-420324'],
    fallback: async () => {
      const res = await prisma.bahnTravelReservation.findFirst({
        where: { kind: 'FERRY', status: 'BOOKED', departureAt: { gt: now } },
        orderBy: { departureAt: 'asc' },
      });
      return res?.orderId ?? null;
    },
  });
  const bundle = (await getOrderBundle({ ref: orderRef }))!;
  const ferry = bundle.travelReservations.find((r) => r.kind === 'FERRY');
  const terminal = ferry?.originTerminal ?? 'the ferry terminal';
  const sailing = ferry ? `${fmtUtc(ferry.departureAt).split(' ').at(-1)} ` : '';
  await sendAndFollow({
    orderRef: bundle.order.reference,
    from: 'driver',
    text: `I'm at ${terminal} with the ${vehicleOf(bundle)} for ${bundle.order.reference}. Staff say the ${sailing}sailing is full for vehicles and our booking is not on their list, so I can't board. I'm going to miss this ferry. What should I do?`,
  });
}

async function s2() {
  const orderRef = await pick({
    preferred: ['CD-420145', 'CD-420240', 'CD-420366'],
    fallback: async () =>
      (
        await prisma.bahnWorkAssignment.findFirst({
          where: { status: 'IN_PROGRESS' },
          orderBy: { acceptedAt: 'desc' },
        })
      )?.orderId ?? null,
  });
  const bundle = (await getOrderBundle({ ref: orderRef }))!;
  await sendAndFollow({
    orderRef: bundle.order.reference,
    from: 'driver',
    text: `A red warning light just came on in the ${vehicleOf(bundle)} (${bundle.order.reference}), it looks like the engine temperature symbol and there is a burning smell. I pulled into a fuel station on the motorway and switched the engine off.`,
  });
}

async function s4() {
  const orderRef = await pick({
    preferred: ['CD-420123', 'CD-420413', 'CD-420656'],
    fallback: async () =>
      (
        await prisma.bahnOrder.findFirst({
          where: { status: 'WAITING_FOR_PICKUP', cancelledAt: null, pickupSiteId: { not: null } },
          orderBy: { reference: 'asc' },
        })
      )?.reference ?? null,
  });
  const bundle = (await getOrderBundle({ ref: orderRef }))!;
  await sendAndFollow({
    orderRef: bundle.order.reference,
    from: 'customer',
    text: `Hello, about ${bundle.order.reference}: the buyer is asking whether you can also deliver the set of winter tyres (4 wheels on rims) that is stored at the dealer, together with the car. Is that possible, and would it cost extra?`,
  });
}

async function s3() {
  const before = await simNow();
  const phase = arg('phase') === 'started' ? 'started' : 'ended';
  let orderRef = arg('order');
  let target: Date | null = null;
  const candidates = orderRef
    ? [orderRef]
    : (
        await prisma.bahnOrder.findMany({
          where: { status: 'WAITING_FOR_PICKUP', cancelledAt: null },
          select: { reference: true },
        })
      ).map((o) => o.reference);
  for (const ref of candidates) {
    const bundle = await getOrderBundle({ ref });
    const slot = bundle && pickupSlot(bundle);
    const assigned = bundle?.assignments.some((a) => a.status === 'ASSIGNED' && !a.startedAt);
    const pickedUp = bundle?.events.some((e) => e.command === 'vehicle.picked_up');
    if (!bundle || !slot || !assigned || pickedUp || slot.startAt <= before) continue;
    const at =
      phase === 'ended'
        ? new Date(slot.endAt.getTime() + 2 * MINUTE)
        : new Date(slot.startAt.getTime() + 10 * MINUTE);
    if (!target || at < target) {
      target = at;
      orderRef = bundle.order.reference;
    }
  }
  if (!target || !orderRef) throw new Error('no WAITING_FOR_PICKUP order with an upcoming slot');
  const bundle = (await getOrderBundle({ ref: orderRef }))!;
  const slot = pickupSlot(bundle)!;
  console.log(
    `${orderRef}: pickup slot ${fmtUtc(slot.startAt)}–${fmtUtc(slot.endAt)}; moving sim clock ${before.toISOString()} → ${target.toISOString()} (slot ${phase})`
  );
  await setSimClock({ anchorSim: target });
  const startedAt = new Date();
  if (flag('local-tick')) {
    const tick = await watchmanTick();
    console.log(
      `local tick at sim ${tick.simNow}: ${tick.hits} hits, new ${tick.newHits.join(', ')}`
    );
  } else console.log('waiting for the scheduled watchman-tick (every minute)…');

  const deadline = Date.now() + 3 * MINUTE;
  while (Date.now() < deadline) {
    const signal = await prisma.signal.findFirst({
      where: {
        orderId: bundle.order.id,
        source: 'monitor',
        triggerType: 'PICKUP_NOT_CONFIRMED',
        sourceRef: `M2:${bundle.order.id}:${slot.id}`,
      },
    });
    if (signal) {
      console.log(
        `signal ${signal.id} at sim ${signal.simAt.toISOString()} (${signal.createdAt >= startedAt ? 'new' : 'existing'})`
      );
      console.log(`  routing ${JSON.stringify(signal.routing)}`);
      console.log(`undo the clock jump: pnpm clock:local --at ${before.toISOString()}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.log(
    `no PICKUP_NOT_CONFIRMED signal within 3 min; is trigger dev running? (or use --local-tick)`
  );
  console.log(`undo the clock jump: pnpm clock:local --at ${before.toISOString()}`);
  process.exitCode = 1;
}

/** The first local `hour` o'clock at least `minHours` after `after` (a hotel check-out). */
function localHourAfter(args: { after: Date; hour: number; minHours: number; timeZone: string }) {
  const { after, hour, minHours, timeZone } = args;
  const date = localDate(after, timeZone);
  const sameDay = zonedInstant(date, hour, timeZone);
  return sameDay.getTime() - after.getTime() >= minHours * HOUR
    ? sameDay
    : zonedInstant(addDays(date, 1), hour, timeZone);
}

async function s6() {
  const before = await simNow();
  const orderRef = await pick({
    preferred: ['CD-420439'],
    // A car on its way to a booked crossing that S1 and the queue story (CD-420603) do not use.
    fallback: async () => {
      const ferries = await prisma.bahnTravelReservation.findMany({
        where: {
          kind: 'FERRY',
          status: 'BOOKED',
          cancelledAt: null,
          checkInCutoffAt: { gt: before },
        },
        orderBy: { departureAt: 'asc' },
        select: { orderId: true },
      });
      const order = await prisma.bahnOrder.findFirst({
        where: {
          id: { in: ferries.map((ferry) => ferry.orderId) },
          status: 'IN_TRANSIT',
          reference: { notIn: ['CD-420075', 'CD-420603'] },
        },
        orderBy: { reference: 'asc' },
      });
      return order?.reference ?? null;
    },
  });
  const bundle = (await getOrderBundle({ ref: orderRef }))!;
  const ref = bundle.order.reference;
  const assignment = activeAssignment(bundle);
  if (!assignment) throw new Error(`${ref} has no assignment`);
  const ferry = bundle.travelReservations.find(
    (r) =>
      r.kind === 'FERRY' &&
      r.status === 'BOOKED' &&
      !r.cancelledAt &&
      r.assignmentId === assignment.id &&
      !r.id.startsWith(SIM_RESERVATION_PREFIX)
  );
  if (!ferry) throw new Error(`${ref} has no booked ferry on assignment ${assignment.id}`);
  const promise = bundle.timeWindows.find(
    (w) => w.purpose === 'CUSTOMER_DELIVERY_PROMISE' && w.isSelected
  );
  if (!promise) throw new Error(`${ref} has no selected delivery promise`);
  const delivery = bundle.addresses.find((a) => a.id === bundle.order.deliveryAddressId);
  if (!delivery) throw new Error(`${ref} has no delivery address`);
  const homeCity = assignment.driver?.homeCity ?? null;
  if (!homeCity) throw new Error(`${ref}: the driver's home city is not on record`);
  const deliveryTz = promise.timezone;
  const terminal = bundle.ferryTerminals.find((t) => t.id === ferry.originTerminalId);
  const terminalTz = terminal?.timezone ?? cityTimezone(ferry.fromCity) ?? 'UTC';
  const terminalName = ferry.originTerminal ?? terminal?.name ?? 'the ferry terminal';

  // The night after the sailing arrives: late check-in at the arrival time, check-out 11:00 local.
  const checkInAt = ferry.expectedArrivalAt;
  const checkOutAt = localHourAfter({
    after: checkInAt,
    hour: 11,
    minHours: 6,
    timeZone: deliveryTz,
  });
  // The return home after the delivery window.
  const trainAt = new Date(promise.endAt.getTime() + 30 * MINUTE);
  const trainArrivesAt = new Date(trainAt.getTime() + 3 * HOUR);
  const hotelId = simId('res');
  const trainId = simId('res');
  const bookedAt = ferry.bookedAt.toISOString();
  const common = {
    order_id: bundle.order.id,
    assignment_id: assignment.id,
    status: 'BOOKED',
    booked_at: bookedAt,
    currency: 'EUR',
    data_origin: 'SIMULATED',
    arrival_confirmation: 'UNCONFIRMED',
  };
  const records = [
    {
      ...common,
      id: hotelId,
      kind: 'HOTEL',
      booking_basis: 'DIRECT_OPERATOR_BOOKING',
      booking_reference: `HO${hotelId.slice(-8).toUpperCase()}`,
      provider: 'Lakeside Rooms',
      city: delivery.city,
      check_in_at: checkInAt.toISOString(),
      check_out_at: checkOutAt.toISOString(),
      departure_at: checkInAt.toISOString(),
      expected_arrival_at: checkOutAt.toISOString(),
      fare_cents: 9400,
      journey_state: 'BOOKED_STAY_UNCONFIRMED',
      route_label: `Driver overnight stay in ${delivery.city} after the crossing`,
    },
    {
      ...common,
      id: trainId,
      kind: 'TRAIN',
      booking_basis: 'QUOTE_ACCEPTED_BY_OPERATOR',
      booking_reference: `TR${trainId.slice(-8).toUpperCase()}`,
      provider: 'Northrail',
      from_city: delivery.city,
      to_city: homeCity,
      departure_at: trainAt.toISOString(),
      expected_arrival_at: trainArrivesAt.toISOString(),
      local_transfer_hours: 0,
      fare_cents: 5900,
      boarding_confirmation: 'UNCONFIRMED',
      journey_state: 'BOOKED_NOT_TRAVEL_CONFIRMED',
      route_label: `Return journey after handover: ${delivery.city} to ${homeCity}`,
    },
  ];
  const removed = await prisma.bahnTravelReservation.deleteMany({
    where: { orderId: bundle.order.id, id: { startsWith: SIM_RESERVATION_PREFIX } },
  });
  await insertBahnRecords({ collection: 'travel_reservations', records });
  console.log(
    `${ref}: removed ${removed.count} earlier simulated reservation(s); inserted (booked ${fmtUtc(ferry.bookedAt)}, assignment ${assignment.id}):`
  );
  console.log(
    `  ${hotelId} HOTEL ${delivery.city} ${fmtLocal(checkInAt, deliveryTz)} → ${fmtLocal(checkOutAt, deliveryTz)}`
  );
  console.log(
    `  ${trainId} TRAIN ${delivery.city} → ${homeCity} ${fmtLocal(trainAt, deliveryTz)} → ${fmtLocal(trainArrivesAt, deliveryTz)}`
  );

  // The driver can only have missed the sailing once its check-in has closed.
  const cutoff = ferry.checkInCutoffAt ?? new Date(ferry.departureAt.getTime() - 2 * HOUR);
  const target = new Date(cutoff.getTime() + 20 * MINUTE);
  if (before < target) {
    console.log(
      `moving sim clock ${before.toISOString()} → ${target.toISOString()} (20 min after the check-in cutoff)`
    );
    await setSimClock({ anchorSim: target });
  }
  const sailing = fmtLocal(ferry.departureAt, terminalTz).split(' ')[2];
  const closed = fmtLocal(cutoff, terminalTz).split(' ')[2];
  await sendAndFollow({
    orderRef: ref,
    from: 'driver',
    text: `Missed the ${sailing} sailing at ${terminalName} with the ${vehicleOf(bundle)} for ${ref}: the check-in gate closed at ${closed} while I was still in the queue, so the booking is lost. I'm still at the terminal${terminal?.city ? ` in ${terminal.city}` : ''} with the car. What do I do now?`,
  });
  if (before < target)
    console.log(`undo the clock jump: pnpm clock:local --at ${before.toISOString()}`);
}

const SCENARIOS: Record<string, () => Promise<void>> = { S1: s1, S2: s2, S3: s3, S4: s4, S6: s6 };

async function main() {
  const id = process.argv
    .slice(2)
    .find((a) => /^S\d$/i.test(a))
    ?.toUpperCase();
  const scenario = id && SCENARIOS[id];
  if (!scenario)
    throw new Error('usage: pnpm sim:scenario <S1|S2|S3|S4|S6> [--order CD-…] [--direct]');
  await scenario();
}

finish(main());
