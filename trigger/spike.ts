import { logger, metadata, task, wait } from '@trigger.dev/sdk';
import { z } from 'zod';

import { runAgent } from '@/lib/agents';
import { controlMcpServer, controlToolNames } from '@/lib/agents/controlMcp';
import { decide } from '@/lib/decisions';
import { prisma } from '@/lib/prismaClient';

// Sanity check for the dev runtime: cwd, env loading, `@/` aliases and Prisma 7 inside a task.
export const spikeProbe = task({
  id: 'spike-probe',
  run: async () => {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`select 1 as ok`;
    const result = {
      cwd: process.cwd(),
      node: process.version,
      hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY),
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      prismaOk: rows[0]?.ok === 1,
    };
    logger.info('probe', result);
    return result;
  },
});

type SpikePayload = { model?: string; tokenTimeout?: string };
type TokenPayload = { decision?: string; note?: string };

// End-to-end runtime check: Jev decision -> Claude CLI agent with our MCP tool -> waitpoint token -> resume.
export const spikeRoundtrip = task({
  id: 'spike-roundtrip',
  maxDuration: 900,
  run: async (payload: SpikePayload, { ctx }) => {
    const jev = await decide({
      state: {
        order: 'CD-420299',
        route: 'Hamburg -> Tallinn -> Helsinki',
        latestMessage:
          'Driver: the 18:30 Tallinn-Helsinki ferry is sold out, I am at the port with the car.',
      },
      questions: {
        missedFerry: {
          type: 'noul',
          instructions: 'Will the car miss its planned ferry sailing?',
          criteria: {
            true: 'The planned sailing will not carry the car.',
            false: 'The car still sails as planned.',
          },
        },
        trigger: {
          type: 'choice',
          instructions: 'Which operational trigger applies to the latest message?',
          criteria: {
            FERRY_DISRUPTION: 'Ferry missed, sold out or cancelled.',
            VEHICLE_WARNING: 'Warning light, damage or breakdown.',
            NONE: 'Nothing operational happened.',
          },
        },
        urgency: {
          type: 'score',
          instructions: 'How urgent is this?',
          criteria: ['Can wait', 'Today', 'Right now'],
        },
      },
    });
    logger.info('jev answers', {
      answers: jev.answers,
      model: jev.model,
      costUsd: jev.costUsd,
      ms: jev.durationMs,
    });

    const tools = ['get_time', 'record_note'];
    const agent = await runAgent({
      model: payload.model,
      systemPrompt:
        'You are an operations agent for a car delivery control room. Use only the provided tools. Never invent data.',
      prompt: `Order CD-420299: ${jev.answers.trigger.choice} (P=${jev.answers.trigger.confidence}). Call get_time to learn the current simulated time, record a one-sentence note with record_note, then summarise in one sentence what time it is and what happened.`,
      outputSchema: z.object({ summary: z.string(), usedTool: z.boolean() }),
      mcpServers: { control: controlMcpServer({ runId: ctx.run.id, orderId: 'CD-420299', tools }) },
      allowedTools: controlToolNames(tools),
      timeoutMs: 5 * 60_000,
    });
    logger.info('agent output', {
      output: agent.output,
      toolCalls: agent.toolCalls.map((call) => call.name),
      costUsd: agent.costUsd,
      durationMs: agent.durationMs,
      numTurns: agent.numTurns,
      model: agent.model,
    });

    const token = await wait.createToken({
      timeout: payload.tokenTimeout ?? '30m',
      tags: [`run:${ctx.run.id}`],
    });
    metadata.set('tokenId', token.id);
    logger.info('waiting for token', { tokenId: token.id, url: token.url });
    const completion = await wait.forToken<TokenPayload>(token);
    if (!completion.ok) {
      logger.warn('token timed out', { tokenId: token.id });
      return { status: 'timed_out' as const, tokenId: token.id };
    }
    logger.info('token completed', { output: completion.output });

    return {
      status: 'completed' as const,
      jev: { answers: jev.answers, costUsd: jev.costUsd },
      agent: {
        output: agent.output,
        toolCalls: agent.toolCalls.map((call) => call.name),
        costUsd: agent.costUsd,
        model: agent.model,
      },
      tokenId: token.id,
      tokenOutput: completion.output,
    };
  },
});
