import { prisma } from '@/lib/prismaClient';

function uniq(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
}

/** Order by id ('ord-00299') or reference ('CD-420299'). */
export async function findOrder(args: { ref: string }) {
  const { ref } = args;
  return prisma.bahnOrder.findFirst({ where: { OR: [{ id: ref }, { reference: ref }] } });
}

/** Orders with their customer and primary vehicle, by reference; `raw` omitted. */
export async function listOrders(
  args: { statuses?: string[]; lanes?: string[]; limit?: number } = {}
) {
  const { statuses, lanes, limit } = args;
  const orders = await prisma.bahnOrder.findMany({
    where: {
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(lanes ? { displayLane: { in: lanes } } : {}),
    },
    omit: { raw: true },
    orderBy: { reference: 'asc' },
    take: limit,
  });
  const orderIds = orders.map((order) => order.id);
  const [customers, items] = await Promise.all([
    prisma.bahnCustomer.findMany({
      where: { id: { in: uniq(orders.map((o) => o.customerId)) } },
      omit: { raw: true },
    }),
    prisma.bahnOrderItem.findMany({
      where: { orderId: { in: orderIds }, role: 'PRIMARY' },
      omit: { raw: true },
    }),
  ]);
  const vehicles = await prisma.bahnVehicle.findMany({
    where: { id: { in: uniq(items.map((item) => item.vehicleId)) } },
    omit: { raw: true },
  });
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const itemByOrder = new Map(items.map((item) => [item.orderId, item]));
  return orders.map((order) => ({
    ...order,
    customer: customerById.get(order.customerId) ?? null,
    primaryVehicle: vehicleById.get(itemByOrder.get(order.id)?.vehicleId ?? '') ?? null,
  }));
}

export type OrderListItem = Awaited<ReturnType<typeof listOrders>>[number];

/** Everything recorded about one order (by id or reference), with the active plan marked; null if unknown. */
export async function getOrderBundle(args: { ref: string }) {
  const order = await findOrder({ ref: args.ref });
  if (!order) return null;
  const id = order.id;
  const byOrder = { where: { orderId: id } };

  const [
    customer,
    items,
    plans,
    timeWindows,
    offers,
    offerExposures,
    reachChecks,
    assignments,
    steps,
    travelOptions,
    travelReservations,
    travelConfirmations,
    conversations,
    supportThreads,
    alerts,
    incidents,
    workItems,
    agentProposals,
    internalNotifications,
    events,
    endpointDetails,
    endpointClaims,
    trackingObservations,
    proofs,
    documents,
    expenses,
    custodyAssets,
    custodyReports,
    notes,
    siteVisits,
    ferryTerminalEvents,
  ] = await Promise.all([
    prisma.bahnCustomer.findUnique({ where: { id: order.customerId } }),
    prisma.bahnOrderItem.findMany(byOrder),
    prisma.bahnTransportPlan.findMany({ ...byOrder, orderBy: { version: 'asc' } }),
    prisma.bahnTimeWindow.findMany({ ...byOrder, orderBy: { startAt: 'asc' } }),
    prisma.bahnMarketOffer.findMany({
      where: { OR: [{ orderId: id }, { orderIds: { has: id } }] },
      orderBy: { publishedAt: 'asc' },
    }),
    prisma.bahnMarketOfferExposure.findMany({ ...byOrder, orderBy: { shownAt: 'asc' } }),
    prisma.bahnMarketOfferReachCheck.findMany({ ...byOrder, orderBy: { checkedAt: 'asc' } }),
    prisma.bahnWorkAssignment.findMany({ ...byOrder, orderBy: { acceptedAt: 'asc' } }),
    prisma.bahnAssignmentStep.findMany({
      ...byOrder,
      orderBy: [{ assignmentId: 'asc' }, { sequence: 'asc' }],
    }),
    prisma.bahnTravelOption.findMany({ ...byOrder, orderBy: { checkedAt: 'asc' } }),
    prisma.bahnTravelReservation.findMany({ ...byOrder, orderBy: { departureAt: 'asc' } }),
    prisma.bahnTravelConfirmation.findMany({ ...byOrder, orderBy: { reportedAt: 'asc' } }),
    prisma.bahnConversation.findMany({
      where: { OR: [{ orderId: id }, { relatedOrderIds: { has: id } }] },
      orderBy: { startedAt: 'asc' },
    }),
    prisma.bahnSupportInboxThread.findMany({
      where: { OR: [{ candidateOrderIds: { has: id } }, { linkedOrderIds: { has: id } }] },
      orderBy: { openedAt: 'asc' },
    }),
    prisma.bahnAlert.findMany({ ...byOrder, orderBy: { triggeredAt: 'asc' } }),
    prisma.bahnIncident.findMany({ ...byOrder, orderBy: { openedAt: 'asc' } }),
    prisma.bahnWorkItem.findMany({
      where: { OR: [{ orderId: id }, { relatedOrderIds: { has: id } }] },
      orderBy: { openedAt: 'asc' },
    }),
    prisma.bahnAgentProposal.findMany({ ...byOrder, orderBy: { createdAt: 'asc' } }),
    prisma.bahnInternalNotification.findMany({ ...byOrder, orderBy: { occurredAt: 'asc' } }),
    prisma.bahnOperationalEvent.findMany({
      ...byOrder,
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.bahnOrderEndpointDetail.findMany(byOrder),
    prisma.bahnEndpointClaim.findMany({ ...byOrder, orderBy: { recordedAt: 'asc' } }),
    prisma.bahnTrackingObservation.findMany({ ...byOrder, orderBy: { observedAt: 'asc' } }),
    prisma.bahnProof.findMany(byOrder),
    prisma.bahnDocument.findMany({ ...byOrder, orderBy: { updatedAt: 'asc' } }),
    prisma.bahnExpense.findMany({ ...byOrder, orderBy: { submittedAt: 'asc' } }),
    prisma.bahnCustodyAsset.findMany({ where: { OR: [{ orderId: id }, { relatedOrderId: id }] } }),
    prisma.bahnCustodyReport.findMany({ ...byOrder, orderBy: { reportedAt: 'asc' } }),
    prisma.bahnOrderNote.findMany({ ...byOrder, orderBy: { authoredAt: 'asc' } }),
    prisma.bahnSiteVisit.findMany({ ...byOrder, orderBy: { arrivedAt: 'asc' } }),
    prisma.bahnFerryTerminalEvent.findMany({ ...byOrder, orderBy: { occurredAt: 'asc' } }),
  ]);

  const planIds = plans.map((plan) => plan.id);
  const terminalIds = uniq([
    ...travelReservations.flatMap((r) => [r.originTerminalId, r.destinationTerminalId]),
    ...ferryTerminalEvents.map((event) => event.terminalId),
  ]);
  const [
    vehicles,
    points,
    segments,
    drivers,
    messages,
    supportMessages,
    custodyEvents,
    ferryTerminals,
    roadEstimates,
  ] = await Promise.all([
    prisma.bahnVehicle.findMany({
      where: { id: { in: uniq(items.map((item) => item.vehicleId)) } },
    }),
    prisma.bahnTransportPoint.findMany({
      where: { planId: { in: planIds } },
      orderBy: { sequence: 'asc' },
    }),
    prisma.bahnTransportSegment.findMany({
      where: { planId: { in: planIds } },
      orderBy: { sequence: 'asc' },
    }),
    prisma.bahnDriver.findMany({ where: { id: { in: uniq(assignments.map((a) => a.driverId)) } } }),
    prisma.bahnMessage.findMany({
      where: { conversationId: { in: conversations.map((c) => c.id) } },
      orderBy: [{ authoredAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.bahnSupportInboxMessage.findMany({
      where: { threadId: { in: supportThreads.map((t) => t.id) } },
      orderBy: { authoredAt: 'asc' },
    }),
    prisma.bahnCustodyAssetEvent.findMany({
      where: { assetId: { in: custodyAssets.map((asset) => asset.id) } },
      orderBy: { occurredAt: 'asc' },
    }),
    prisma.bahnFerryTerminal.findMany({ where: { id: { in: terminalIds } } }),
    prisma.bahnTerminalRoadEstimate.findMany({
      where: {
        OR: [
          { id: { in: uniq(travelReservations.map((r) => r.terminalRoadEstimateId)) } },
          { toTerminalId: { in: terminalIds } },
        ],
      },
    }),
  ]);

  const [addresses, sites] = await Promise.all([
    prisma.bahnAddress.findMany({
      where: {
        id: {
          in: uniq([
            order.pickupAddressId,
            order.deliveryAddressId,
            ...points.map((p) => p.addressId),
            ...endpointDetails.map((d) => d.addressId),
          ]),
        },
      },
    }),
    prisma.bahnSite.findMany({
      where: {
        id: {
          in: uniq([
            order.pickupSiteId,
            order.deliverySiteId,
            ...points.map((p) => p.siteId),
            ...endpointDetails.map((d) => d.siteId),
          ]),
        },
      },
    }),
  ]);

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
  const pointsByPlan = groupBy(points, (point) => point.planId);
  const segmentsByPlan = groupBy(segments, (segment) => segment.planId);
  const stepsByAssignment = groupBy(steps, (step) => step.assignmentId);
  const messagesByConversation = groupBy(messages, (message) => message.conversationId);
  const supportByThread = groupBy(supportMessages, (message) => message.threadId);
  const claimsByDetail = groupBy(endpointClaims, (claim) => claim.endpointDetailId ?? '');
  const custodyEventsByAsset = groupBy(custodyEvents, (event) => event.assetId ?? '');

  const plansWithRoute = plans.map((plan) => ({
    ...plan,
    isActive: plan.id === order.activePlanId,
    points: pointsByPlan.get(plan.id) ?? [],
    segments: segmentsByPlan.get(plan.id) ?? [],
  }));

  return {
    order,
    customer,
    items: items.map((item) => ({ ...item, vehicle: vehicleById.get(item.vehicleId) ?? null })),
    addresses,
    sites,
    plans: plansWithRoute,
    activePlan: plansWithRoute.find((plan) => plan.isActive) ?? null,
    timeWindows,
    offers,
    offerExposures,
    reachChecks,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      driver: driverById.get(assignment.driverId) ?? null,
      steps: stepsByAssignment.get(assignment.id) ?? [],
    })),
    travelOptions,
    travelReservations,
    travelConfirmations,
    ferryTerminals,
    ferryTerminalEvents,
    terminalRoadEstimates: roadEstimates,
    conversations: conversations.map((conversation) => ({
      ...conversation,
      messages: messagesByConversation.get(conversation.id) ?? [],
    })),
    supportThreads: supportThreads.map((thread) => ({
      ...thread,
      messages: supportByThread.get(thread.id) ?? [],
    })),
    alerts,
    incidents,
    workItems,
    agentProposals,
    internalNotifications,
    events,
    endpointDetails: endpointDetails.map((detail) => ({
      ...detail,
      claims: claimsByDetail.get(detail.id) ?? [],
    })),
    trackingObservations,
    proofs,
    documents,
    expenses,
    custodyAssets: custodyAssets.map((asset) => ({
      ...asset,
      events: custodyEventsByAsset.get(asset.id) ?? [],
    })),
    custodyReports,
    notes,
    siteVisits,
  };
}

export type OrderBundle = NonNullable<Awaited<ReturnType<typeof getOrderBundle>>>;
