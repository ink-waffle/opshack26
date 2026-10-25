// Compact order identity for queue rows and headers: reference, car, customer, route.

import { humanize } from '@/lib/control-room/format';
import { prisma } from '@/lib/prismaClient';

export type OrderSummary = {
  id: string;
  ref: string;
  status: string;
  statusLabel: string;
  car: string | null;
  plate: string | null;
  customer: string | null;
  from: string | null;
  to: string | null;
  route: string | null;
};

const STATUS_WORDS: Record<string, string> = {
  NEW: 'New, not yet staffed',
  WAITING_FOR_PICKUP: 'Waiting for pickup',
  IN_TRANSIT: 'On the road',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function orderStatusLabel(status: string): string {
  return STATUS_WORDS[status] ?? humanize(status);
}

export const CLOSED_ORDER_STATUSES = ['DELIVERED', 'CANCELLED'];

/** Summaries by bahn order id; pass undefined to load every order. */
export async function orderSummaries(args: { ids?: string[] }): Promise<Map<string, OrderSummary>> {
  const { ids } = args;
  const orders = await prisma.bahnOrder.findMany({
    where: ids ? { id: { in: ids } } : {},
    select: {
      id: true,
      reference: true,
      status: true,
      customerId: true,
      pickupAddressId: true,
      deliveryAddressId: true,
    },
    orderBy: { reference: 'asc' },
  });
  const orderIds = orders.map((o) => o.id);
  const [items, customers, addresses] = await Promise.all([
    prisma.bahnOrderItem.findMany({
      where: { orderId: { in: orderIds }, role: 'PRIMARY' },
      select: { orderId: true, vehicleId: true },
    }),
    prisma.bahnCustomer.findMany({
      where: { id: { in: [...new Set(orders.map((o) => o.customerId))] } },
      select: { id: true, name: true },
    }),
    prisma.bahnAddress.findMany({
      where: {
        id: { in: [...new Set(orders.flatMap((o) => [o.pickupAddressId, o.deliveryAddressId]))] },
      },
      select: { id: true, city: true },
    }),
  ]);
  const vehicles = await prisma.bahnVehicle.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.vehicleId))] } },
    select: { id: true, make: true, model: true, registration: true },
  });
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const vehicleByOrder = new Map(items.map((i) => [i.orderId, vehicleById.get(i.vehicleId)]));
  const customerById = new Map(customers.map((c) => [c.id, c.name]));
  const cityById = new Map(addresses.map((a) => [a.id, a.city]));
  return new Map(
    orders.map((order) => {
      const vehicle = vehicleByOrder.get(order.id);
      const from = cityById.get(order.pickupAddressId) ?? null;
      const to = cityById.get(order.deliveryAddressId) ?? null;
      return [
        order.id,
        {
          id: order.id,
          ref: order.reference,
          status: order.status,
          statusLabel: orderStatusLabel(order.status),
          car: vehicle ? `${vehicle.make} ${vehicle.model}` : null,
          plate: vehicle?.registration ?? null,
          customer: customerById.get(order.customerId) ?? null,
          from,
          to,
          route: from && to ? `${from} → ${to}` : (from ?? to),
        },
      ];
    })
  );
}
