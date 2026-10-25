// Playbook run lifecycle: create/load the run row, check preconditions, walk the graph persisting block_runs.

import { getOrderBundle } from '@/lib/bahn';
import { deriveDecideBy } from '@/lib/chain/compute';
import { simNow } from '@/lib/clock';
import type { PlaybookRun, RunStatus } from '@/lib/generated/prisma/client';
import type { RuntimeAdapter } from '@/lib/playbooks/adapters';
import { loadApprovedAmendments, resolveParams } from '@/lib/playbooks/amendments';
import { BLOCK_EXECUTORS } from '@/lib/playbooks/blocks';
import type { ExecuteOutput } from '@/lib/playbooks/blocks/execute';
import { latestDecision } from '@/lib/playbooks/blocks/human';
import { createTriageCard, handOver, type HandOverReason } from '@/lib/playbooks/cards';
import { syncAndListFacts } from '@/lib/playbooks/facts';
import { getBlock, walkGraph } from '@/lib/playbooks/interpreter';
import { errorMessage, toJson } from '@/lib/playbooks/json';
import type {
  BlockDefinition,
  PlaybookDefinition,
  PlaybookPayload,
  RunContext,
} from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';

export type RunPlaybookResult = {
  playbookRunId: string;
  status: RunStatus;
  path: string[];
  error?: string;
};

const TERMINAL: RunStatus[] = ['CLOSED', 'ESCALATED', 'FAILED'];

function statusOnEntry(block: BlockDefinition): RunStatus | null {
  if (block.status && !TERMINAL.includes(block.status)) return block.status;
  if (block.kind === 'human') return 'AWAITING_DECISION';
  if (block.kind === 'execute') return 'EXECUTING';
  return null;
}

async function createOrLoadRun(args: {
  definition: PlaybookDefinition;
  payload: PlaybookPayload;
  triggerRunId: string | null;
}): Promise<PlaybookRun> {
  const { definition, payload, triggerRunId } = args;
  const existing = payload.playbookRunId
    ? await prisma.playbookRun.findUnique({ where: { id: payload.playbookRunId } })
    : triggerRunId
      ? await prisma.playbookRun.findFirst({ where: { triggerRunId } })
      : null;
  if (existing)
    return prisma.playbookRun.update({
      where: { id: existing.id },
      data: { triggerRunId: triggerRunId ?? existing.triggerRunId },
    });
  return prisma.playbookRun.create({
    data: {
      playbookId: definition.id,
      orderId: payload.orderId,
      triggerType: payload.triggerType ?? null,
      signalId: payload.signalId ?? null,
      status: 'DETECTED',
      triggerRunId,
      simStartedAt: await simNow(),
      context: toJson({ payload }),
    },
  });
}

async function finish(args: {
  runId: string;
  status: RunStatus;
  currentBlockId?: string | null;
  result?: unknown;
  error?: string;
}) {
  const { runId, status, currentBlockId, result, error } = args;
  await prisma.playbookRun.update({
    where: { id: runId },
    data: {
      status,
      ...(currentBlockId !== undefined ? { currentBlockId } : {}),
      ...(result !== undefined ? { result: toJson(result) } : {}),
      ...(error ? { error } : {}),
      closedAt: TERMINAL.includes(status) ? new Date() : null,
    },
  });
}

/** An agent or runtime error in words a dispatcher can act on. */
export function plainError(error: unknown): string {
  const text = errorMessage(error);
  const timeout = text.match(/timed out after (\d+) ?ms/i);
  if (timeout)
    return `the agent took longer than ${Math.round(Number(timeout[1]) / 60_000)} min and was stopped`;
  if (/rate.?limit|\b429\b|overloaded|usage limit/i.test(text))
    return 'the AI service refused more work for now (rate limit)';
  if (/MCP servers failed/i.test(text)) return 'the agent’s tools did not start';
  if (/produced no result|run failed/i.test(text)) return 'the agent ended without an answer';
  if (/Invalid decision payload/i.test(text)) return 'the decision it received could not be read';
  const line =
    text
      .split('\n')
      .find((part) => part.trim())
      ?.trim() ?? 'unknown error';
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}

const clipText = (text: string, max = 160) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Why the run ended without carrying out a decision, in plain words, for the hand-over card. */
async function handOverText(args: {
  ctx: RunContext;
  definition: PlaybookDefinition;
  lastBlockId: string | null;
  error?: unknown;
}): Promise<{ reason: HandOverReason; title: string; lines: string[]; factIds: string[] }> {
  const { ctx, definition, lastBlockId, error } = args;
  const ref = ctx.orderRef;
  const blockTitle = definition.blocks.find((block) => block.id === lastBlockId)?.title;
  const decided = latestDecision(ctx);
  const card = decided?.cardId
    ? await prisma.card.findUnique({ where: { id: decided.cardId } })
    : null;
  const cardFacts = card?.factIds ?? [];
  const booked = ctx.facts.filter((fact) => fact.runId === ctx.run.id && fact.level === 'BOOKED');
  const bookedLine = booked.length
    ? `Already booked before it stopped: ${booked.map((fact) => clipText(fact.statement, 90)).join('; ')}.`
    : 'Nothing was booked.';
  const executed = ctx.outputs.execute as ExecuteOutput | undefined;
  if (error)
    return {
      reason: 'failed',
      title: `${ref}: agent stopped, ${definition.title.toLowerCase()} not finished`,
      lines: [
        `The agent stopped${blockTitle ? ` at “${blockTitle}”` : ''}: ${plainError(error)}.`,
        `${ctx.agentActions.length ? `It had made ${ctx.agentActions.length} lookups. ` : ''}${bookedLine}`,
        'A person takes it from here; the run’s steps are on the order page.',
      ],
      factIds: cardFacts,
    };
  if (executed?.refused)
    return {
      reason: 'refused',
      title: `${ref}: your decision was not carried out`,
      lines: [executed.refused, 'A person takes it from here.'],
      factIds: cardFacts,
    };
  if (decided?.expired) {
    const why = (card?.decision as { reason?: unknown } | null)?.reason;
    return {
      reason: 'expired',
      title: `${ref}: nobody decided in time`,
      lines: [
        `${typeof why === 'string' ? why : 'Nobody decided before the card’s deadline'}; the card “${card?.title ?? definition.title}” expired.`,
        'Nothing was booked or sent. The options are still on the expired card for reference.',
        'The order needs a person now.',
      ],
      factIds: cardFacts,
    };
  }
  if (decided?.decision?.action === 'reject') {
    const note = decided.decision.note?.trim();
    return {
      reason: 'rejected',
      title: `${ref}: options rejected, a person takes it`,
      lines: [
        `Rejected by ${decided.decision.decidedBy}${note ? ` with this note: “${clipText(note)}”` : '.'}`,
        'The agent did nothing further. What it found is on the rejected card and below.',
      ],
      factIds: cardFacts,
    };
  }
  return {
    reason: 'stopped',
    title: `${ref}: ${definition.title.toLowerCase()} handed over`,
    lines: [
      `The playbook stopped${blockTitle ? ` at “${blockTitle}”` : ''} without a plan to carry out.`,
      bookedLine,
    ],
    factIds: cardFacts,
  };
}

/** Every run that ends without carrying out a decision leaves a card in front of a person. */
async function handOverRun(args: {
  ctx: RunContext;
  definition: PlaybookDefinition;
  lastBlockId: string | null;
  error?: unknown;
}) {
  const { ctx, definition } = args;
  try {
    const text = await handOverText(args);
    const { decideBy } = deriveDecideBy({ bundle: ctx.order, facts: ctx.facts, now: ctx.simNow });
    const runFacts = ctx.facts.filter((fact) => fact.runId === ctx.run.id).map((fact) => fact.id);
    await handOver({
      runId: ctx.run.id,
      orderId: ctx.orderId,
      playbookId: definition.id,
      reason: text.reason,
      title: text.title,
      summary: text.lines.join('\n'),
      factIds: [...text.factIds, ...runFacts],
      decideBy: decideBy?.at ?? null,
      decideByReason: decideBy?.label ?? null,
      at: ctx.simNow,
    });
  } catch (cause) {
    ctx.services.log(`hand-over card failed: ${errorMessage(cause)}`);
  }
}

export async function runPlaybook(args: {
  definition: PlaybookDefinition;
  payload: PlaybookPayload;
  adapter: RuntimeAdapter;
  triggerRunId?: string | null;
}): Promise<RunPlaybookResult> {
  const { definition, payload, adapter, triggerRunId = null } = args;
  let run = await createOrLoadRun({ definition, payload, triggerRunId });
  const path: string[] = [];
  let ctx: RunContext | null = null;
  try {
    const bundle = await getOrderBundle({ ref: payload.orderId });
    if (!bundle) {
      await createTriageCard({
        runId: run.id,
        orderId: payload.orderId,
        playbookId: definition.id,
        title: `Order ${payload.orderId} not found`,
        summary: `The ${definition.title} playbook was started for ${payload.orderId}, but Bahn has no such order.`,
      });
      await finish({ runId: run.id, status: 'ESCALATED', result: { reason: 'order not found' } });
      return { playbookRunId: run.id, status: 'ESCALATED', path };
    }
    if (run.orderId !== bundle.order.id)
      run = await prisma.playbookRun.update({
        where: { id: run.id },
        data: { orderId: bundle.order.id },
      });
    // One live run per order and playbook: when two dispatches race (tick vs prime, a reset vs playbook:run), the newer steps aside.
    const older = payload.playbookRunId
      ? null
      : await prisma.playbookRun.findFirst({
          where: {
            id: { not: run.id },
            orderId: { in: [bundle.order.id, bundle.order.reference] },
            playbookId: definition.id,
            status: { notIn: TERMINAL },
            OR: [
              { createdAt: { lt: run.createdAt } },
              { createdAt: run.createdAt, id: { lt: run.id } },
            ],
          },
        });
    if (older) {
      await prisma.playbookRun.delete({ where: { id: run.id } });
      adapter.log(`duplicate of playbook run ${older.id}; this run steps aside`);
      return { playbookRunId: older.id, status: older.status, path, error: 'duplicate' };
    }

    const amendments = await loadApprovedAmendments({ playbookId: definition.id });
    const runCtx: RunContext = {
      run,
      playbook: definition,
      payload,
      orderId: bundle.order.id,
      orderRef: bundle.order.reference,
      order: bundle,
      facts: await syncAndListFacts({ orderId: bundle.order.id }),
      outputs: {},
      params: resolveParams({ definition, amendments }),
      instructions: amendments.filter((amendment) => amendment.kind === 'INSTRUCTION'),
      agentActions: [],
      simNow: await simNow(),
      services: {
        refresh: async () => {
          const [order, facts, now] = await Promise.all([
            getOrderBundle({ ref: runCtx.orderId }),
            syncAndListFacts({ orderId: runCtx.orderId }),
            simNow(),
          ]);
          if (order) runCtx.order = order;
          runCtx.facts = facts;
          runCtx.simNow = now;
        },
        rerunAgent: async ({ blockId, feedback }) => {
          const block = getBlock({ definition, blockId });
          const output = await executeAndPersist({ block, ctx: runCtx, adapter, feedback });
          runCtx.outputs[blockId] = output;
          return output;
        },
        log: adapter.log,
      },
    };
    ctx = runCtx;

    const failed: string[] = [];
    for (const precondition of definition.preconditions) {
      const ok = await precondition.check(runCtx).catch(() => false);
      if (!ok) failed.push(precondition.description);
    }
    if (failed.length) {
      await createTriageCard({
        runId: run.id,
        orderId: runCtx.orderId,
        playbookId: definition.id,
        title: `${runCtx.orderRef}: ${definition.title} does not fit`,
        summary: `Routed here by ${payload.triggerType ?? 'a signal'}, but: ${failed.join('; ')}.\nA person should look at the order.`,
        factIds: runCtx.facts.slice(-20).map((fact) => fact.id),
      });
      await finish({ runId: run.id, status: 'ESCALATED', result: { failedPreconditions: failed } });
      return { playbookRunId: run.id, status: 'ESCALATED', path };
    }

    await finish({ runId: run.id, status: 'GATHERING', currentBlockId: definition.start });
    const walk = await walkGraph({
      definition,
      ctx: runCtx,
      executeBlock: async ({ block }) => {
        path.push(block.id);
        return executeAndPersist({ block, ctx: runCtx, adapter });
      },
    });
    if (walk.status === 'ESCALATED')
      await handOverRun({ ctx: runCtx, definition, lastBlockId: walk.lastBlockId });
    await finish({
      runId: run.id,
      status: walk.status,
      currentBlockId: walk.lastBlockId,
      result: { path: walk.path, final: runCtx.outputs[walk.lastBlockId] ?? null },
    });
    return { playbookRunId: run.id, status: walk.status, path: walk.path };
  } catch (error) {
    await finish({ runId: run.id, status: 'FAILED', error: errorMessage(error), result: { path } });
    if (ctx) await handOverRun({ ctx, definition, lastBlockId: path.at(-1) ?? null, error });
    else
      await createTriageCard({
        runId: run.id,
        orderId: run.orderId,
        playbookId: definition.id,
        title: `${payload.orderId}: ${definition.title} could not start`,
        summary: `The run stopped before its first step: ${plainError(error)}.\nA person should look at the order.`,
      }).catch(() => undefined);
    throw error;
  }
}

async function executeAndPersist(args: {
  block: BlockDefinition;
  ctx: RunContext;
  adapter: RuntimeAdapter;
  feedback?: string;
}): Promise<unknown> {
  const { block, ctx, adapter, feedback } = args;
  const entryStatus = statusOnEntry(block);
  await prisma.playbookRun.update({
    where: { id: ctx.run.id },
    data: { currentBlockId: block.id, ...(entryStatus ? { status: entryStatus } : {}) },
  });
  const blockRun = await prisma.blockRun.create({
    data: { runId: ctx.run.id, blockId: block.id, kind: block.kind, status: 'RUNNING' },
  });
  const startedAt = Date.now();
  adapter.log(`block ${block.id} (${block.kind}) started`);
  try {
    const result = await BLOCK_EXECUTORS[block.kind]({
      block,
      ctx,
      adapter,
      blockRunId: blockRun.id,
      feedback,
    });
    await prisma.blockRun.update({
      where: { id: blockRun.id },
      data: {
        status: 'COMPLETED',
        output: toJson(result.output),
        ...(result.input !== undefined ? { input: toJson(result.input) } : {}),
        ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
        ...(result.model ? { model: result.model } : {}),
        durationMs: Date.now() - startedAt,
        finishedAt: new Date(),
      },
    });
    adapter.log(`block ${block.id} completed`, {
      ms: Date.now() - startedAt,
      costUsd: result.costUsd ?? 0,
    });
    return result.output;
  } catch (error) {
    await prisma.blockRun.update({
      where: { id: blockRun.id },
      data: {
        status: 'FAILED',
        error: errorMessage(error),
        durationMs: Date.now() - startedAt,
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
