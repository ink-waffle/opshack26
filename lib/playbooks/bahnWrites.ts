// Simulated writes into Bahn's system (bahn.messages), as Bahn's API would record them.

import { randomUUID } from 'crypto';

import { insertBahnRecords, type OrderBundle } from '@/lib/bahn';
import { prisma } from '@/lib/prismaClient';

export const AGENT_AUTHOR_ID = 'control-agent';

export type Party = 'driver' | 'site' | 'customer' | 'provider';

const CHANNEL: Record<Party, string> = {
  driver: 'driver_chat',
  site: 'site_chat',
  customer: 'customer_email',
  provider: 'provider_desk',
};

const BAHN_TYPE: Record<Party, string> = {
  driver: 'driver',
  site: 'site_contact',
  customer: 'customer',
  provider: 'provider',
};

/** Who a message to this party goes to: the active driver, the customer or the pickup site. */
export function partyTarget(args: { bundle: OrderBundle; party: Party }): {
  id: string;
  name: string | null;
} {
  const { bundle, party } = args;
  if (party === 'driver') {
    const assignment =
      bundle.assignments.find((a) => a.status !== 'CANCELLED') ?? bundle.assignments[0];
    return {
      id: assignment?.driverId ?? 'driver-unknown',
      name: assignment?.driver?.displayName ?? null,
    };
  }
  if (party === 'customer')
    return {
      id: bundle.customer?.id ?? bundle.order.customerId,
      name: bundle.customer?.name ?? null,
    };
  if (party === 'provider') {
    const provider = bundle.travelOptions[0]?.provider ?? 'Provider desk';
    return { id: `provider:${provider}`, name: provider };
  }
  const site = bundle.sites.find((s) => s.id === bundle.order.pickupSiteId) ?? bundle.sites[0];
  return { id: site?.id ?? 'site-unknown', name: site?.name ?? null };
}

/** The order's conversation with this party (by participants), else its first conversation, else a synthetic id. */
async function conversationFor(args: { orderId: string; party: Party }): Promise<string> {
  const { orderId, party } = args;
  const type = BAHN_TYPE[party];
  const message = await prisma.bahnMessage.findFirst({
    where: { orderId, OR: [{ authorType: type }, { recipientType: type }] },
    orderBy: { authoredAt: 'desc' },
    select: { conversationId: true },
  });
  if (message) return message.conversationId;
  const conversation = await prisma.bahnConversation.findFirst({
    where: { orderId },
    orderBy: { startedAt: 'asc' },
    select: { id: true },
  });
  return conversation?.id ?? `conv-control-${orderId}-${party}`;
}

/** Insert one bahn.messages row; returns its id. Agent → party when `fromAgent`, else party → operator desk. */
export async function insertMessage(args: {
  orderId: string;
  party: Party;
  partyId: string;
  partyName?: string | null;
  fromAgent: boolean;
  body: string;
  at: Date;
  evidenceRefs?: { id: string; table: string }[];
}): Promise<string> {
  const { orderId, party, partyId, partyName, fromAgent, body, at, evidenceRefs } = args;
  const id = `msg-ctl-${randomUUID().slice(0, 12)}`;
  const conversationId = await conversationFor({ orderId, party });
  await insertBahnRecords({
    collection: 'messages',
    records: [
      {
        id,
        order_id: orderId,
        conversation_id: conversationId,
        author_type: fromAgent ? 'agent' : BAHN_TYPE[party],
        author_id: fromAgent ? AGENT_AUTHOR_ID : partyId,
        author_name_snapshot: fromAgent ? 'Control room agent' : (partyName ?? null),
        recipient_type: fromAgent ? BAHN_TYPE[party] : 'agent',
        recipient_id: fromAgent ? partyId : AGENT_AUTHOR_ID,
        channel: CHANNEL[party],
        visibility: 'PUBLIC',
        language: 'en',
        authored_at: at.toISOString(),
        body,
        evidence_refs: evidenceRefs ?? null,
      },
    ],
  });
  return id;
}
