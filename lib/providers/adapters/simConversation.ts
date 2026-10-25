// Simulated driver / site / provider replies: a scripted override per order, else a haiku persona built from the bundle.

import { z } from 'zod';

import { runAgent } from '@/lib/agents';
import { getOrderBundle, type OrderBundle } from '@/lib/bahn';
import type { ConversationParty, ConversationProvider, ConversationReply } from '@/lib/providers';
import { findScriptedReply } from '@/lib/providers/scripts';

type Speaker = ConversationReply['speaker'];

function speakerFor(args: { party: ConversationParty; bundle: OrderBundle }): Speaker {
  const { party, bundle } = args;
  if (party === 'driver') {
    const assignment =
      bundle.assignments.find((a) => a.status !== 'CANCELLED') ?? bundle.assignments[0];
    return {
      type: 'driver',
      id: assignment?.driverId ?? 'driver-unknown',
      name: assignment?.driver?.displayName ?? null,
    };
  }
  if (party === 'site') {
    const site = bundle.sites.find((s) => s.id === bundle.order.pickupSiteId) ?? bundle.sites[0];
    return { type: 'site', id: site?.id ?? 'site-unknown', name: site?.name ?? null };
  }
  const provider = bundle.travelOptions[0]?.provider ?? 'Provider desk';
  return { type: 'provider', id: `provider:${provider}`, name: provider };
}

function personaPrompt(args: {
  party: ConversationParty;
  bundle: OrderBundle;
  speaker: Speaker;
  scenarioHint?: string;
}): string {
  const { party, bundle, speaker, scenarioHint } = args;
  const messages = bundle.conversations
    .flatMap((c) => c.messages)
    .filter((m) =>
      party === 'driver'
        ? m.authorType === 'driver' || m.recipientType === 'driver'
        : party === 'site'
          ? m.authorType.startsWith('site') || m.recipientType.startsWith('site')
          : false
    )
    .slice(-8)
    .map((m) => `[${m.authoredAt.toISOString()}] ${m.authorType}: ${m.body}`);
  const windows = bundle.timeWindows.map(
    (w) =>
      `${(w.raw as { purpose?: string }).purpose ?? 'WINDOW'} ${w.startAt?.toISOString()}–${w.endAt?.toISOString()}`
  );
  const reservations = bundle.travelReservations.map(
    (r) => `${r.kind} ${r.routeLabel} ${r.status} ref ${r.bookingReference}`
  );
  const assignment = bundle.assignments[0];
  const role =
    party === 'driver'
      ? `You are ${speaker.name ?? 'the driver'} (${speaker.id}), a freelance car-delivery driver${assignment?.driver?.homeCity ? ` based in ${assignment.driver.homeCity}` : ''}. You hold assignment ${assignment?.id ?? '?'} (status ${assignment?.status ?? '?'}) for order ${bundle.order.reference}.`
      : party === 'site'
        ? `You are the contact at ${speaker.name ?? 'the pickup site'} for order ${bundle.order.reference}.`
        : `You are the reservations desk of ${speaker.name}.`;
  return [
    role,
    'Reply to the operations agent in 1–3 short sentences, in English, as this person would in a chat.',
    'Stay consistent with the record below. Never claim a booking, payment, reservation or document exists unless it is listed. If you do not know something, say so. Do not give mechanical advice.',
    `Time windows: ${windows.join('; ') || 'none'}`,
    `Bookings on record: ${reservations.join('; ') || 'none'}`,
    `Earlier messages:\n${messages.join('\n') || '(none)'}`,
    scenarioHint ? `Scenario: ${scenarioHint}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function reply(args: {
  party: ConversationParty;
  question: string;
  orderRef: string;
  scenarioHint?: string;
}): Promise<ConversationReply> {
  const { party, question, orderRef, scenarioHint } = args;
  const bundle = await getOrderBundle({ ref: orderRef });
  if (!bundle) throw new Error(`Unknown order ${orderRef}`);
  const speaker = speakerFor({ party, bundle });

  const scripted = await findScriptedReply({ orderRef: bundle.order.reference, party, question });
  if (scripted)
    return {
      reply: scripted.noReply ? null : scripted.reply,
      speaker: { ...speaker, name: scripted.speaker ?? speaker.name },
      scripted: true,
      costUsd: 0,
    };

  const result = await runAgent({
    model: 'haiku',
    systemPrompt: personaPrompt({ party, bundle, speaker, scenarioHint }),
    prompt: `Message from the Bahn operations agent:\n\n${question}`,
    outputSchema: z.object({ reply: z.string().min(1).max(600) }),
    timeoutMs: 90_000,
  });
  return { reply: result.output.reply, speaker, scripted: false, costUsd: result.costUsd };
}

export const simConversation: ConversationProvider = { id: 'sim', reply };
