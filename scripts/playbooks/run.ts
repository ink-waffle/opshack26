// Runs a playbook for an order and follows it until its decision card appears and the run ends:
// pnpm playbook:run --playbook missed-connection --order CD-420299 [--trigger-type T] [--signal id] [--inline] [--no-wait]
// Default: tasks.trigger on the dev worker (`pnpm trigger:dev`). --inline: same runtime in this process, no worker.

import { runs, tasks } from '@trigger.dev/sdk';

import type { Card } from '@/lib/generated/prisma/client';
import { inlineAdapter } from '@/lib/playbooks/adapters/inline';
import { getPlaybook } from '@/lib/playbooks/registry';
import { runPlaybook } from '@/lib/playbooks/runtime';
import type { CardOptionsPayload } from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';

const TERMINAL = new Set([
  'COMPLETED',
  'CANCELED',
  'FAILED',
  'CRASHED',
  'SYSTEM_FAILURE',
  'EXPIRED',
  'TIMED_OUT',
]);

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function printCard(card: Card) {
  const payload = card.options as CardOptionsPayload | null;
  console.log(`\n=== card ${card.id} (${card.kind}, ${card.status})`);
  console.log(card.title);
  console.log(card.summary);
  console.log(
    `decide by: ${card.decideBy?.toISOString() ?? '—'} (${card.decideByReason ?? 'no reason'})`
  );
  for (const option of payload?.items ?? []) {
    const slack =
      option.slackMinutes === null ? '?' : `${Math.round(option.slackMinutes / 6) / 10} h`;
    console.log(
      `  ${option.recommended ? '*' : ' '} ${option.id}. ${option.label} | slack ${slack} | ${option.costLabel} | ${option.blocked ? `BLOCKED ${option.blocked.ruleId}: ${option.blocked.message}` : `gate ok, warnings ${option.gate.warnings.length}`}`
    );
    for (const action of option.actions)
      console.log(`      - ${action.id} ${action.actionClass}: ${action.description}`);
  }
  if (payload?.recommendation)
    console.log(
      `recommendation: ${payload.recommendation.optionId}: ${payload.recommendation.why}`
    );
  for (const line of payload?.agentWillNot ?? []) console.log(`will not: ${line}`);
  for (const line of payload?.notes ?? []) console.log(`note: ${line}`);
  if (card.waitpointTokenId) {
    const optionId = payload?.recommendation?.optionId ?? 'A';
    console.log(`\ntoken: ${card.waitpointTokenId}`);
    console.log(
      `approve: pnpm spike:complete ${card.waitpointTokenId} '${JSON.stringify({ action: 'approve', optionId, decidedBy: 'damir' })}'`
    );
  }
}

async function printBlockRuns(playbookRunId: string) {
  const blockRuns = await prisma.blockRun.findMany({
    where: { runId: playbookRunId },
    orderBy: { startedAt: 'asc' },
  });
  console.log('\nblocks:');
  for (const run of blockRuns) {
    console.log(
      `  ${run.blockId.padEnd(18)} ${run.kind.padEnd(13)} ${run.status.padEnd(9)} ${String(run.durationMs ?? '-').padStart(7)} ms  $${(run.costUsd ?? 0).toFixed(4)}${run.model ? `  ${run.model}` : ''}${run.error ? `  ERROR ${run.error}` : ''}`
    );
    // Wait blocks: the deadline-aware reason (min(default, next commitment − buffer)).
    const reason = (run.input as { reason?: string } | null)?.reason;
    if (run.kind === 'wait' && reason) console.log(`      ${reason}`);
  }
  const total = blockRuns.reduce((sum, run) => sum + (run.costUsd ?? 0), 0);
  console.log(`  total agent cost $${total.toFixed(4)}`);
}

async function followTrigger(args: { runId: string }) {
  const { runId } = args;
  let lastStatus = '';
  let lastBlock = '';
  const printed = new Set<string>();
  const deadline = Date.now() + 60 * 60_000;
  while (Date.now() < deadline) {
    const run = await runs.retrieve(runId);
    const playbookRun = await prisma.playbookRun.findFirst({ where: { triggerRunId: runId } });
    const state = `${run.status}/${playbookRun?.status ?? '-'}`;
    if (state !== lastStatus || playbookRun?.currentBlockId !== lastBlock) {
      console.log(
        `[${new Date().toISOString().slice(11, 19)}] trigger ${run.status}, playbook ${playbookRun?.status ?? '-'} @ ${playbookRun?.currentBlockId ?? '-'}`
      );
      lastStatus = state;
      lastBlock = playbookRun?.currentBlockId ?? '';
    }
    if (playbookRun) {
      const cards = await prisma.card.findMany({ where: { runId: playbookRun.id } });
      for (const card of cards)
        if ((card.waitpointTokenId || card.kind === 'TRIAGE') && !printed.has(card.id)) {
          printCard(card);
          printed.add(card.id);
        }
    }
    if (TERMINAL.has(run.status)) {
      console.log(JSON.stringify({ output: run.output, error: run.error }, null, 2));
      if (playbookRun) await printBlockRuns(playbookRun.id);
      return run.status === 'COMPLETED';
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.error('gave up after 60 minutes');
  return false;
}

async function main() {
  const playbookId = flag('playbook') ?? 'missed-connection';
  const orderId = flag('order');
  if (!orderId) throw new Error('--order <ref> is required');
  const definition = getPlaybook(playbookId);
  if (!definition) throw new Error(`Unknown playbook ${playbookId}`);
  const payload = {
    orderId,
    triggerType: flag('trigger-type') ?? definition.triggers[0] ?? null,
    signalId: flag('signal') ?? null,
  };
  const startedAt = Date.now();

  if (process.argv.includes('--inline')) {
    const watcher = setInterval(async () => {
      const cards = await prisma.card.findMany({
        where: { orderId: { not: null }, waitpointTokenId: { not: null }, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      if (cards[0] && cards[0].createdAt.getTime() >= startedAt) {
        printCard(cards[0]);
        clearInterval(watcher);
      }
    }, 3000);
    const result = await runPlaybook({ definition, payload, adapter: inlineAdapter() });
    clearInterval(watcher);
    console.log(JSON.stringify(result, null, 2));
    await printBlockRuns(result.playbookRunId);
  } else {
    const handle = await tasks.trigger(playbookId, payload);
    console.log(`triggered ${playbookId} for ${orderId}: run ${handle.id}`);
    if (process.argv.includes('--no-wait')) return;
    const ok = await followTrigger({ runId: handle.id });
    if (!ok) process.exitCode = 1;
  }
  console.log(`total wall time ${Math.round((Date.now() - startedAt) / 1000)} s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
