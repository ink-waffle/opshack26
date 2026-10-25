import { prisma } from '@/lib/prismaClient';

function minDate(dates: (Date | null | undefined)[]): Date | null {
  const times = dates.filter((date): date is Date => !!date).map((date) => date.getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}

function maxDate(dates: (Date | null | undefined)[]): Date | null {
  const times = dates.filter((date): date is Date => !!date).map((date) => date.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

/** A driver's non-cancelled assignments (the duty chain) ordered by start, with steps, route legs and travel. */
export async function getDriverDuties(args: { driverId: string; includeCompleted?: boolean }) {
  const { driverId, includeCompleted = true } = args;
  const excluded = includeCompleted ? ['CANCELLED'] : ['CANCELLED', 'COMPLETED'];
  const [driver, assignments] = await Promise.all([
    prisma.bahnDriver.findUnique({ where: { id: driverId } }),
    prisma.bahnWorkAssignment.findMany({
      where: { driverId, cancelledAt: null, status: { notIn: excluded } },
      orderBy: { acceptedAt: 'asc' },
    }),
  ]);
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const segmentIds = assignments.flatMap((assignment) => assignment.segmentIds);

  const [orders, steps, segments, reservations] = await Promise.all([
    prisma.bahnOrder.findMany({
      where: { id: { in: [...new Set(assignments.map((a) => a.orderId))] } },
      omit: { raw: true },
    }),
    prisma.bahnAssignmentStep.findMany({
      where: { assignmentId: { in: assignmentIds } },
      orderBy: [{ assignmentId: 'asc' }, { sequence: 'asc' }],
    }),
    prisma.bahnTransportSegment.findMany({
      where: { id: { in: segmentIds } },
      orderBy: { sequence: 'asc' },
    }),
    prisma.bahnTravelReservation.findMany({
      where: { assignmentId: { in: assignmentIds } },
      orderBy: { departureAt: 'asc' },
    }),
  ]);
  const pointIds = [
    ...new Set(segments.flatMap((segment) => [segment.fromPointId, segment.toPointId])),
  ];
  const [points, windows] = await Promise.all([
    prisma.bahnTransportPoint.findMany({ where: { id: { in: pointIds } } }),
    prisma.bahnTimeWindow.findMany({ where: { pointId: { in: pointIds }, isSelected: true } }),
  ]);
  const addresses = await prisma.bahnAddress.findMany({
    where: { id: { in: [...new Set(points.map((point) => point.addressId))] } },
  });

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const addressById = new Map(addresses.map((address) => [address.id, address]));
  const pointById = new Map(
    points.map((point) => [
      point.id,
      { ...point, address: addressById.get(point.addressId) ?? null },
    ])
  );

  const duties = assignments.map((assignment) => {
    const dutySteps = steps.filter((step) => step.assignmentId === assignment.id);
    const dutySegments = segments
      .filter((segment) => assignment.segmentIds.includes(segment.id))
      .map((segment) => ({
        ...segment,
        from: pointById.get(segment.fromPointId) ?? null,
        to: pointById.get(segment.toPointId) ?? null,
      }));
    const dutyPointIds = new Set(
      dutySegments.flatMap((segment) => [segment.fromPointId, segment.toPointId])
    );
    const dutyWindows = windows.filter(
      (window) => window.pointId && dutyPointIds.has(window.pointId)
    );
    const startAt =
      minDate(dutySteps.map((s) => s.scheduledStartAt ?? s.scheduledEndAt ?? s.completedAt)) ??
      minDate(dutyWindows.map((w) => w.startAt)) ??
      assignment.startedAt;
    const endAt =
      maxDate(dutySteps.map((s) => s.scheduledEndAt ?? s.scheduledStartAt ?? s.completedAt)) ??
      maxDate(dutyWindows.map((w) => w.endAt)) ??
      assignment.completedAt;
    return {
      assignment,
      order: orderById.get(assignment.orderId) ?? null,
      steps: dutySteps,
      segments: dutySegments,
      selectedWindows: dutyWindows,
      reservations: reservations.filter(
        (reservation) => reservation.assignmentId === assignment.id
      ),
      startAt,
      endAt,
    };
  });
  duties.sort(
    (a, b) =>
      (a.startAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.startAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
  );
  return { driver, duties };
}

export type DriverDuties = Awaited<ReturnType<typeof getDriverDuties>>;
export type DriverDuty = DriverDuties['duties'][number];
