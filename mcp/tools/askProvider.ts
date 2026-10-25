import { z } from 'zod';

import { recordFact } from '@/lib/playbooks/facts';
import { getTravelProvider } from '@/lib/providers';
import { requireOrder, toolNow } from '@/mcp/tools/context';
import { defineTool } from '@/mcp/types';

// Plain words for the card's "what the agent did" line (ids stay in the fact).
const OUTCOME_WORDS: Record<string, string> = {
  NO_BOOKING: 'it made no booking',
  BOOKING_EXISTS: 'a booking exists',
  NOT_FOUND: 'they have no record of it',
  PENDING: 'they are still checking',
};

export const askProvider = defineTool({
  name: 'ask_provider',
  title: 'Ask the travel provider',
  description:
    'Asks the ferry/travel provider desk about an earlier booking attempt or reference (reconciliation). A definitive answer is written as an OBSERVED fact (BOOKING_RECONCILED); "still checking" is written as STATED. Free, buys nothing. Use before any retry or alternative purchase after a timed-out attempt.',
  inputSchema: {
    question: z.string().min(5).max(600).describe('What you ask the provider.'),
    reference: z
      .string()
      .optional()
      .describe(
        'The attempt (agent_proposals id), travel option id or booking reference to look up.'
      ),
  },
  handler: async (input, ctx) => {
    const bundle = await requireOrder(ctx);
    const now = await toolNow();
    const result = await getTravelProvider().reconcile({
      orderId: bundle.order.id,
      reference: input.reference ?? null,
      question: input.question,
    });
    const definitive = result.outcome !== 'PENDING';
    const subject = result.proposalId
      ? `proposal:${result.proposalId}`
      : `booking:${result.reference ?? 'unknown'}`;
    const fact = await recordFact({
      orderId: bundle.order.id,
      runId: ctx.runId,
      kind: definitive ? 'BOOKING_RECONCILED' : 'TOOL_RESULT',
      subject,
      statement: `${result.provider} (asked ${now.toISOString().slice(0, 16)}Z): ${result.statement}`,
      value: { tool: 'ask_provider', question: input.question, ...result },
      level: definitive ? 'OBSERVED' : 'STATED',
      sourceType: 'TOOL',
      sourceRef: `tool:ask_provider:${result.reference ?? result.proposalId ?? 'query'}`,
      observedAt: now,
      dedupeKey: `tool:ask_provider:${ctx.runId ?? bundle.order.id}:${subject}:${now.toISOString()}`,
    });
    return {
      summary: `Asked ${result.provider} about the earlier booking attempt: ${OUTCOME_WORDS[result.outcome] ?? result.outcome.toLowerCase()}.`,
      outcome: result.outcome,
      statement: result.statement,
      bookingReference: result.bookingReference,
      proposalId: result.proposalId,
      factId: fact.id,
      factIds: [fact.id],
    };
  },
});
