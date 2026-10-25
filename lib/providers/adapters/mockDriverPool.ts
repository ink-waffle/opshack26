// Mock backup-driver pool: active bahn.drivers near the pickup with no overlapping duty, seeded reach and likelihood.

import { prisma } from '@/lib/prismaClient';
import type { BackupCandidate, DriverPoolProvider } from '@/lib/providers';
import { between, pickOne, seededRandom } from '@/lib/providers/seeded';

const LIKELIHOOD = ['HIGH', 'MEDIUM', 'MEDIUM', 'LOW'] as const;

/** Busy spans of drivers' open assignments: their orders' selected pickup slot start → promise end. */
async function busySpans(driverIds: string[]): Promise<Map<string, { from: Date; to: Date }[]>> {
  const assignments = await prisma.bahnWorkAssignment.findMany({
    where: {
      driverId: { in: driverIds },
      cancelledAt: null,
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
    },
    select: { driverId: true, orderId: true },
  });
  const windows = await prisma.bahnTimeWindow.findMany({
    where: {
      orderId: { in: [...new Set(assignments.map((assignment) => assignment.orderId))] },
      isSelected: true,
      purpose: { in: ['SELECTED_PICKUP_SLOT', 'CUSTOMER_DELIVERY_PROMISE'] },
    },
    select: { orderId: true, purpose: true, startAt: true, endAt: true },
  });
  const spans = new Map<string, { from: Date; to: Date }[]>();
  for (const assignment of assignments) {
    const own = windows.filter((window) => window.orderId === assignment.orderId);
    const slot = own.find((window) => window.purpose === 'SELECTED_PICKUP_SLOT');
    const promise = own.find((window) => window.purpose === 'CUSTOMER_DELIVERY_PROMISE');
    if (!slot && !promise) continue;
    const span = {
      from: (slot ?? promise)!.startAt,
      to: (promise ?? slot)!.endAt,
    };
    spans.set(assignment.driverId, [...(spans.get(assignment.driverId) ?? []), span]);
  }
  return spans;
}

async function findBackups(args: {
  pickupCity: string;
  pickupCountry: string;
  busyFrom: Date;
  busyUntil: Date;
  excludeDriverIds: string[];
  limit?: number;
}): Promise<BackupCandidate[]> {
  const { pickupCity, pickupCountry, busyFrom, busyUntil, excludeDriverIds, limit = 3 } = args;
  const drivers = await prisma.bahnDriver.findMany({
    where: { active: true, homeCountry: pickupCountry, id: { notIn: excludeDriverIds } },
    select: { id: true, displayName: true, homeCity: true, homeCountry: true },
    orderBy: { id: 'asc' },
  });
  const spans = await busySpans(drivers.map((driver) => driver.id));
  const free = drivers.filter(
    (driver) =>
      !(spans.get(driver.id) ?? []).some((span) => span.from < busyUntil && span.to > busyFrom)
  );
  const sameCity = (city: string) => city.toLowerCase() === pickupCity.toLowerCase();
  const ranked = free
    .map((driver) => {
      const random = seededRandom(`${driver.id}:${pickupCity}:${busyFrom.toISOString()}`);
      const near = sameCity(driver.homeCity);
      return {
        driverId: driver.id,
        name: driver.displayName,
        homeCity: driver.homeCity,
        homeCountry: driver.homeCountry,
        proximity: near ? ('SAME_CITY' as const) : ('SAME_COUNTRY' as const),
        reachMinutes: near
          ? between({ min: 20, max: 55, random })
          : between({ min: 180, max: 480, random }),
        likelihood: pickOne({ items: LIKELIHOOD, random }),
        activeDuties: (spans.get(driver.id) ?? []).length,
        basis: `Mock pool: active ${driver.homeCountry} driver based in ${driver.homeCity}; no open duty between the pickup and the delivery promise in Bahn's records; travel time is a rough guess (no route check). Not asked, no offer sent.`,
      };
    })
    .sort(
      (a, b) =>
        Number(b.proximity === 'SAME_CITY') - Number(a.proximity === 'SAME_CITY') ||
        LIKELIHOOD.indexOf(a.likelihood) - LIKELIHOOD.indexOf(b.likelihood) ||
        a.reachMinutes - b.reachMinutes
    );
  return ranked.slice(0, limit);
}

export const mockDriverPool: DriverPoolProvider = { id: 'mock', findBackups };
