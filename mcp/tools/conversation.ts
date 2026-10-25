// ask_driver / ask_site: outbound message → simulated reply → both in bahn.messages → projected facts.

import { findPhrases, LIABILITY_PATTERNS, MECHANICAL_ADVICE_PATTERNS } from '@/lib/gate';
import { insertMessage, partyTarget } from '@/lib/playbooks/bahnWrites';
import { messageFactId, syncAndListFacts } from '@/lib/playbooks/facts';
import { getConversationProvider } from '@/lib/providers';
import { requireOrder, toolNow } from '@/mcp/tools/context';
import type { ToolContext } from '@/mcp/types';

const REPLY_KIND = { driver: 'DRIVER_STATEMENT', site: 'SITE_STATEMENT' } as const;

/** G4 before anything leaves: no mechanical or driving advice and no blame in an agent's message. */
export function assertNoForbiddenAdvice(text: string) {
  const hits = [
    ...findPhrases({ text, patterns: MECHANICAL_ADVICE_PATTERNS }),
    ...findPhrases({ text, patterns: LIABILITY_PATTERNS }),
  ];
  if (hits.length)
    throw new Error(
      `G4: not sent. The message contains mechanical/driving advice or blame (${hits.map((hit) => `"${hit}"`).join(', ')}). Rephrase it without that; "do not drive further" is fine.`
    );
}

export async function askParty(args: {
  ctx: ToolContext;
  party: 'driver' | 'site';
  question: string;
}) {
  const { ctx, party, question } = args;
  assertNoForbiddenAdvice(question);
  const bundle = await requireOrder(ctx);
  const now = await toolNow();
  const target = partyTarget({ bundle, party });
  const askedId = await insertMessage({
    orderId: bundle.order.id,
    party,
    partyId: target.id,
    partyName: target.name,
    fromAgent: true,
    body: question,
    at: now,
  });
  const reply = await getConversationProvider().reply({
    party,
    question,
    orderRef: bundle.order.reference,
  });
  const askedFactId = messageFactId({ messageId: askedId, kind: 'AGENT_MESSAGE' });
  const who = target.name ?? target.id;
  if (reply.reply === null) {
    await syncAndListFacts({ orderId: bundle.order.id });
    return {
      summary: `Asked the ${party} (${who}): "${question.slice(0, 120)}"; no reply.`,
      reply: null,
      speaker: { type: party, id: target.id, name: target.name },
      repliedAt: null,
      replyFactId: null,
      factIds: [askedFactId],
      note: `No reply from the ${party} so far. Do not assume an answer; report it as no reply.`,
    };
  }
  // One second later keeps the order in the thread without dating the reply after the agent's own clock.
  const repliedAt = new Date(now.getTime() + 1000);
  const replyId = await insertMessage({
    orderId: bundle.order.id,
    party,
    partyId: target.id,
    partyName: reply.speaker.name ?? target.name,
    fromAgent: false,
    body: reply.reply,
    at: repliedAt,
  });
  // Projection turns both rows into facts (AGENT_MESSAGE, then a STATED statement by the speaker).
  await syncAndListFacts({ orderId: bundle.order.id });
  const replyFactId = messageFactId({ messageId: replyId, kind: REPLY_KIND[party] });
  return {
    summary: `Asked the ${party} (${who}): "${question.slice(0, 120)}"; reply: "${reply.reply.slice(0, 200)}"`,
    reply: reply.reply,
    speaker: { type: party, id: target.id, name: reply.speaker.name ?? target.name },
    repliedAt: repliedAt.toISOString(),
    replyFactId,
    factIds: [replyFactId, askedFactId],
    note: 'The reply is a STATED fact: a statement by the speaker, not verified.',
  };
}
