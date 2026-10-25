// Keep-if-better backtests: replay recorded agent inputs for INSTRUCTION amendments, re-run the gate for PARAMETER ones.

import { getOrderBundle, type OrderBundle } from '@/lib/bahn';
import { computeChain } from '@/lib/chain/compute';
import { type ChainOption, type ChainResult, DEFAULT_CHAIN_PARAMETERS } from '@/lib/chain/types';
import { listOrderFacts } from '@/lib/facts';
import { projectOrderFacts } from '@/lib/facts/projection';
import {
  type BahnProposalRow,
  checkProposal,
  DEFAULT_GATE_PARAMETERS,
  fromBahnProposal,
  type GateParameters,
} from '@/lib/gate';
import type { ActionClass } from '@/lib/gate/actions';
import type { BlockRun, Fact, PlaybookRun } from '@/lib/generated/prisma/client';
import { judgeFollowsCorrection, judgeSensible } from '@/lib/meta/judge';
import {
  type AgentBlockCase,
  inCurrentShape,
  type LearningCase,
  recordedAgentInput,
} from '@/lib/meta/load';
import { applyRoutingOverrides } from '@/lib/meta/params';
import { replayAgentBlock } from '@/lib/meta/replay';
import type { Backtest, BacktestCase } from '@/lib/meta/types';
import { parameterWhitelist } from '@/lib/meta/whitelist';
import { numericOverrides } from '@/lib/playbooks/amendments';
import { checkOption } from '@/lib/playbooks/blocks/gate';
import {
  type ExpandedOption,
  expandOption,
  type OptionsAnswer,
  toChainOption,
} from '@/lib/playbooks/options';
import type {
  BlockDefinition,
  CardOption,
  CardOptionsPayload,
  DecisionPayload,
} from '@/lib/playbooks/types';
import { computeWaitDuration } from '@/lib/playbooks/waitDuration';
import { prisma } from '@/lib/prismaClient';
import { decideRoute, type TriggerScore } from '@/lib/watchman/routing';

const FOLLOWS_GAIN = 0.15;
const SENSIBLE = 0.5;
const round2 = (value: number) => Math.round(value * 100) / 100;

// ── INSTRUCTION ──

type GateVerdict = { ok: boolean; violations: { ruleId: string; text: string }[] } | null;

/** Violations the replay has that the recorded answer did not (a rule it newly breaks). */
function newViolations(args: { after: GateVerdict; baseline: GateVerdict }): string[] {
  const { after, baseline } = args;
  const known = new Set((baseline?.violations ?? []).map((v) => v.ruleId));
  return (after?.violations ?? []).filter((v) => !known.has(v.ruleId)).map((v) => v.text);
}

function gateNote(args: { after: GateVerdict; baseline: GateVerdict }): string {
  const { after, baseline } = args;
  if (after === null) return '';
  const fresh = newViolations({ after, baseline });
  if (fresh.length) return ` Rule check finds new problems: ${fresh.slice(0, 2).join('; ')}`;
  if (after.ok) return ' Every option passes the rule check.';
  return ' Rule check: no new problems (the recorded answer had the same ones).';
}

/** Facts and "now" as the run saw them when the block finished (tool facts of that run included). */
async function factsAtBlock(args: {
  run: PlaybookRun;
  finishedAt: Date | null;
}): Promise<{ facts: Fact[]; now: Date }> {
  const { run, finishedAt } = args;
  const all = run.orderId ? await listOrderFacts({ orderId: run.orderId, runId: run.id }) : [];
  const facts = finishedAt ? all.filter((fact) => fact.recordedAt <= finishedAt) : all;
  const own = facts.filter((fact) => fact.runId === run.id).map((f) => f.observedAt.getTime());
  const start = run.simStartedAt?.getTime() ?? 0;
  return { facts, now: new Date(Math.max(start, ...own)) };
}

/** The gate step's checks on an options answer built out by its templates (null when the block offers no templates). */
async function gateOnOutput(args: {
  run: PlaybookRun;
  blockRun: BlockRun;
  block: BlockDefinition;
  output: unknown;
  params: Record<string, unknown>;
}): Promise<GateVerdict> {
  const { run, blockRun, block, output, params } = args;
  const templates = block.templates;
  const parsed = block.outputSchema?.safeParse(output);
  if (!templates?.length || !parsed?.success || !run.orderId) return null;
  const bundle = await getOrderBundle({ ref: run.orderId });
  if (!bundle) return null;
  const { facts, now } = await factsAtBlock({ run, finishedAt: blockRun.finishedAt });
  const violations = (parsed.data as OptionsAnswer).options.flatMap((answered) => {
    const option = expandOption({ templates, option: answered });
    const chain = computeChain({
      bundle,
      facts,
      option: toChainOption(option.change, facts),
      now,
      parameters: numericOverrides({ params, defaults: DEFAULT_CHAIN_PARAMETERS }),
    });
    const result = checkOption({
      option,
      chain,
      facts,
      now,
      orderId: bundle.order.id,
      orderRef: bundle.order.reference,
      params,
    });
    return result.violations.map((v) => ({
      ruleId: v.ruleId,
      text: `${option.id} ${v.ruleId}: ${v.message}`,
    }));
  });
  return { ok: violations.length === 0, violations };
}

/** Up to `limit` other recorded runs of the same block (latest completed run per playbook run). */
async function regressionRuns(args: {
  target: AgentBlockCase;
  playbookId: string;
  limit: number;
}): Promise<(BlockRun & { run: PlaybookRun })[]> {
  const { target, playbookId, limit } = args;
  const rows = await prisma.blockRun.findMany({
    where: {
      blockId: target.block.id,
      kind: 'agent',
      status: 'COMPLETED',
      runId: { not: target.blockRun.runId },
      run: { playbookId },
    },
    include: { run: true },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  const seen = new Set<string>();
  // Runs recorded in an older output shape would replay that shape, not today's block.
  return rows
    .filter((row) => {
      const input = recordedAgentInput(row.input);
      if (seen.has(row.runId) || !row.transcript || !input) return false;
      if (!inCurrentShape({ input, block: target.block })) return false;
      seen.add(row.runId);
      return true;
    })
    .slice(0, limit);
}

/** Baseline = the recorded output; candidate = a replay with the amendment; plus regression replays. */
export async function backtestInstruction(args: {
  learning: LearningCase;
  target: AgentBlockCase;
  text: string;
  regressions?: number;
}): Promise<Backtest> {
  const { learning, target, text, regressions = 2 } = args;
  const block = target.block;
  const correction = learning.correction;
  const cases: BacktestCase[] = [];
  let costUsd = 0;

  const before = await judgeFollowsCorrection({
    block,
    correction,
    output: target.blockRun.output,
  });
  const replay = await replayAgentBlock({
    input: target.input,
    transcript: target.blockRun.transcript,
    amendment: text,
  });
  costUsd += replay.costUsd + before.costUsd;
  const schemaOk = block.outputSchema?.safeParse(replay.output).success ?? true;
  const after = await judgeFollowsCorrection({ block, correction, output: replay.output });
  const [gate, baselineGate] = await Promise.all(
    [replay.output, target.blockRun.output].map((output) =>
      gateOnOutput({
        run: learning.run,
        blockRun: target.blockRun,
        block,
        output,
        params: learning.params,
      })
    )
  );
  const gateFresh = newViolations({ after: gate, baseline: baselineGate });
  costUsd += after.costUsd;
  cases.push({
    kind: 'source',
    label: `${learning.orderRef ?? 'this order'}: the corrected run, replayed with the new text`,
    ref: target.blockRun.id,
    before: round2(before.p),
    after: round2(after.p),
    note: `Follows the operator's correction: ${round2(before.p)} → ${round2(after.p)}.${
      schemaOk
        ? gateNote({ after: gate, baseline: baselineGate })
        : ' The replayed answer does not match the block’s output shape.'
    }`,
    ok: schemaOk && gateFresh.length === 0 && after.p - before.p >= FOLLOWS_GAIN,
  });

  const others = await regressionRuns({
    target,
    playbookId: learning.definition.id,
    limit: regressions,
  });
  const replays = await Promise.all(
    others.map(async (other) => {
      const input = recordedAgentInput(other.input);
      if (!input) return null;
      const result = await replayAgentBlock({
        input,
        transcript: other.transcript,
        amendment: text,
      });
      const sensible = await judgeSensible({ block, output: result.output });
      const [otherGate, otherBaseline] = await Promise.all(
        [result.output, other.output].map((output) =>
          gateOnOutput({ run: other.run, blockRun: other, block, output, params: learning.params })
        )
      );
      const order = other.run.orderId
        ? await prisma.bahnOrder.findUnique({
            where: { id: other.run.orderId },
            select: { reference: true },
          })
        : null;
      return {
        other,
        result,
        sensible,
        otherGate,
        otherBaseline,
        orderRef: order?.reference ?? other.run.orderId,
      };
    })
  );
  for (const item of replays) {
    if (!item) continue;
    const { other, result, sensible, otherGate, otherBaseline, orderRef } = item;
    costUsd += result.costUsd + sensible.costUsd;
    const fresh = newViolations({ after: otherGate, baseline: otherBaseline });
    const ok = sensible.p >= SENSIBLE && fresh.length === 0;
    cases.push({
      kind: 'regression',
      label: `${orderRef}: an earlier run of the same step, replayed with the new text`,
      ref: other.id,
      before: null,
      after: round2(sensible.p),
      note: `Still a sensible answer: ${round2(sensible.p)}.${gateNote({ after: otherGate, baseline: otherBaseline })}`,
      ok,
    });
  }

  const source = cases[0];
  const regressionCases = cases.filter((c) => c.kind === 'regression');
  const broken = regressionCases.filter((c) => !c.ok).length;
  const improved = source.ok && broken === 0;
  const gateText = !schemaOk
    ? 'output shape broken'
    : gate === null
      ? 'no options to check'
      : gateFresh.length
        ? 'rule check finds new problems'
        : 'no new rule problems';
  return {
    kind: 'INSTRUCTION',
    cases,
    summary: `follows correction ${round2(before.p).toFixed(2)} → ${round2(after.p).toFixed(2)}; ${gateText}; regressions ${broken}/${regressionCases.length}`,
    improved,
    costUsd,
    ranAt: new Date().toISOString(),
  };
}

// ── PARAMETER ──

const GATE_KEYS = Object.keys(DEFAULT_GATE_PARAMETERS);

function gateParams(params: Record<string, unknown>): GateParameters {
  return {
    quoteBlockMinutes: Number(
      params.quoteBlockMinutes ?? DEFAULT_GATE_PARAMETERS.quoteBlockMinutes
    ),
    quoteWarnMinutes: Number(params.quoteWarnMinutes ?? DEFAULT_GATE_PARAMETERS.quoteWarnMinutes),
  };
}

/** C1's regression set: Bahn's 14 recorded proposals through the gate with old and new parameters. */
async function bahnProposalCases(args: {
  before: GateParameters;
  after: GateParameters;
}): Promise<{ cases: BacktestCase[]; text: string }> {
  const { before, after } = args;
  const proposals = (await prisma.bahnAgentProposal.findMany({
    orderBy: { createdAt: 'asc' },
  })) as unknown as BahnProposalRow[];
  const bundles = new Map<
    string,
    { bundle: OrderBundle; facts: ReturnType<typeof projectOrderFacts> }
  >();
  const cases: BacktestCase[] = [];
  const counts = {
    blockedBefore: 0,
    blockedAfter: 0,
    caughtBefore: 0,
    caughtAfter: 0,
    falseBefore: 0,
    falseAfter: 0,
    corrected: 0,
    approved: 0,
  };
  for (const proposal of proposals) {
    if (!bundles.has(proposal.orderId)) {
      const bundle = await getOrderBundle({ ref: proposal.orderId });
      if (bundle) bundles.set(proposal.orderId, { bundle, facts: projectOrderFacts({ bundle }) });
    }
    const loaded = bundles.get(proposal.orderId);
    if (!loaded) continue;
    const decision = (proposal.review as { decision?: string } | null)?.decision ?? null;
    const mapped = fromBahnProposal({
      proposal,
      facts: loaded.facts,
      now: proposal.createdAt,
      orderRef: loaded.bundle.order.reference,
    });
    const run = (parameters: GateParameters) =>
      checkProposal({ proposal: mapped, facts: loaded.facts, now: proposal.createdAt, parameters });
    const b = !run(before).ok;
    const a = !run(after).ok;
    const corrected = decision === 'EDITED' || decision === 'REJECTED';
    const approved = decision === 'APPROVED';
    counts.blockedBefore += Number(b);
    counts.blockedAfter += Number(a);
    if (corrected) {
      counts.corrected += 1;
      counts.caughtBefore += Number(b);
      counts.caughtAfter += Number(a);
    }
    if (approved) {
      counts.approved += 1;
      counts.falseBefore += Number(b);
      counts.falseAfter += Number(a);
    }
    cases.push({
      kind: 'bahn-proposal',
      label: `${loaded.bundle.order.reference} ${proposal.command} (${decision?.toLowerCase() ?? 'pending'})`,
      ref: proposal.id,
      before: b ? 'blocked' : 'passes',
      after: a ? 'blocked' : 'passes',
      note: b === a ? 'No change.' : a ? 'Now blocked.' : 'No longer blocked.',
      ok: !(approved && a && !b) && !(corrected && b && !a),
    });
  }
  return {
    cases,
    text: `Bahn's ${proposals.length} recorded proposals: blocked ${counts.blockedBefore} → ${counts.blockedAfter}; corrected ones caught ${counts.caughtBefore}/${counts.corrected} → ${counts.caughtAfter}/${counts.corrected}; approved ones falsely blocked ${counts.falseBefore}/${counts.approved} → ${counts.falseAfter}/${counts.approved}`,
  };
}

function rehydrateChainOption(option: unknown): ChainOption {
  const value = (option ?? { type: 'NO_CHANGE' }) as Record<string, unknown>;
  return {
    ...value,
    ...(typeof value.startAt === 'string' ? { startAt: new Date(value.startAt) } : {}),
    ...(typeof value.endAt === 'string' ? { endAt: new Date(value.endAt) } : {}),
  } as ChainOption;
}

// A recorded card option as the gate reads it; its chain option is replayed separately.
const asExpanded = (option: CardOption): ExpandedOption => ({
  id: option.id,
  label: option.label,
  detail: option.detail,
  change: { type: 'NO_CHANGE' },
  actions: option.actions.map((action) => ({
    id: action.id,
    actionClass: action.actionClass as ActionClass,
    description: action.description,
    quoteFactId: action.quoteFactId ?? null,
    message: action.message ?? null,
    target: action.target ?? null,
    replaces: action.replaces ?? [],
  })),
  factIds: option.factIds,
  reversibility: option.reversibility,
});

/** Recorded card options of this playbook through chain + gate with old and new parameters. */
async function cardOptionCases(args: {
  playbookId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): Promise<{ cases: BacktestCase[]; text: string }> {
  const { playbookId, before, after } = args;
  const cards = await prisma.card.findMany({
    where: { playbookId, kind: 'DECISION', status: { in: ['APPROVED', 'EDITED', 'REJECTED'] } },
    include: { run: true },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  const cases: BacktestCase[] = [];
  const counts = {
    options: 0,
    blockedBefore: 0,
    blockedAfter: 0,
    verdictChanges: 0,
    falseBlocks: 0,
  };
  for (const card of cards) {
    const payload = card.options as CardOptionsPayload | null;
    if (!card.run || !card.orderId || !payload?.items?.length) continue;
    const bundle = await getOrderBundle({ ref: card.orderId });
    if (!bundle) continue;
    const { facts, now } = await factsAtBlock({ run: card.run, finishedAt: card.createdAt });
    const decision = card.decision as
      (DecisionPayload & { appliedOption?: { id?: string } }) | null;
    const picked =
      card.status === 'REJECTED'
        ? null
        : (decision?.appliedOption?.id ??
          decision?.optionId ??
          payload.recommendation?.optionId ??
          null);
    for (const option of payload.items) {
      const evaluate = (params: Record<string, unknown>) => {
        const chain: ChainResult = computeChain({
          bundle,
          facts,
          option: rehydrateChainOption((option.chain as ChainResult | null)?.option),
          now,
          parameters: numericOverrides({ params, defaults: DEFAULT_CHAIN_PARAMETERS }),
        });
        const checked = checkOption({
          option: asExpanded(option),
          chain,
          facts,
          now,
          orderId: bundle.order.id,
          orderRef: bundle.order.reference,
          params,
        });
        return { blocked: checked.violations.length > 0, verdict: chain.promise.verdict };
      };
      const b = evaluate(before);
      const a = evaluate(after);
      counts.options += 1;
      counts.blockedBefore += Number(b.blocked);
      counts.blockedAfter += Number(a.blocked);
      counts.verdictChanges += Number(b.verdict !== a.verdict);
      const falseBlock = option.id === picked && a.blocked && !b.blocked;
      counts.falseBlocks += Number(falseBlock);
      cases.push({
        kind: 'card-option',
        label: `${bundle.order.reference} option ${option.id}${option.id === picked ? ' (the operator’s choice)' : ''}: ${option.label}`,
        ref: card.id,
        before: `${b.blocked ? 'blocked' : 'passes'}, promise ${b.verdict}`,
        after: `${a.blocked ? 'blocked' : 'passes'}, promise ${a.verdict}`,
        note:
          b.blocked === a.blocked && b.verdict === a.verdict
            ? 'No change.'
            : falseBlock
              ? 'The option the operator chose would now be blocked.'
              : 'Changes.',
        ok: !falseBlock,
      });
    }
  }
  return {
    cases,
    text: counts.options
      ? `${counts.options} recorded card options: blocked ${counts.blockedBefore} → ${counts.blockedAfter}, promise verdict changes ${counts.verdictChanges}, operator choices falsely blocked ${counts.falseBlocks}`
      : 'no decided cards of this playbook to replay',
  };
}

/** Recorded message signals re-routed with the old and new routing thresholds. */
async function signalCases(args: {
  parameters: Record<string, number>;
  current: Record<string, unknown>;
}): Promise<{ cases: BacktestCase[]; text: string }> {
  const { parameters, current } = args;
  const routingCurrent = Object.fromEntries(
    Object.entries(current).filter(([k]) => k.startsWith('routing.'))
  );
  const beforeParams = applyRoutingOverrides({ parameters: routingCurrent });
  const afterParams = applyRoutingOverrides({ parameters: { ...routingCurrent, ...parameters } });
  const signals = await prisma.signal.findMany({
    where: { source: 'message' },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  const cases: BacktestCase[] = [];
  let changed = 0;
  let dispatchedBefore = 0;
  let dispatchedAfter = 0;
  for (const signal of signals) {
    const answers = signal.answers as {
      triggers?: TriggerScore[];
      needsAttention?: number | null;
    } | null;
    if (!answers?.triggers) continue;
    const route = (params: typeof beforeParams) =>
      decideRoute({
        source: 'message',
        triggers: answers.triggers ?? [],
        needsAttention: answers.needsAttention ?? null,
        params,
      });
    const b = route(beforeParams);
    const a = route(afterParams);
    const describe = (d: typeof b) =>
      d.action === 'playbook' ? `→ ${d.playbooks.map((m) => m.playbookId).join(', ')}` : d.action;
    dispatchedBefore += Number(b.action === 'playbook');
    dispatchedAfter += Number(a.action === 'playbook');
    if (describe(b) === describe(a)) continue;
    changed += 1;
    cases.push({
      kind: 'signal',
      label: `Signal on ${signal.orderId ?? 'no order'} (${signal.triggerType ?? 'no trigger'})`,
      ref: signal.id,
      before: describe(b),
      after: describe(a),
      note: 'Routes differently.',
      ok: true,
    });
  }
  return {
    cases,
    text: `${signals.length} recorded message signals: playbook starts ${dispatchedBefore} → ${dispatchedAfter}, ${changed} routed differently`,
  };
}

/** Recorded waits of this playbook recomputed with the old and new timings. */
async function waitCases(args: {
  playbookId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  blockIds: string[];
}): Promise<{ cases: BacktestCase[]; text: string }> {
  const { playbookId, before, after, blockIds } = args;
  const rows = await prisma.blockRun.findMany({
    where: { kind: 'wait', blockId: { in: blockIds }, run: { playbookId } },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  const cases: BacktestCase[] = [];
  for (const row of rows) {
    const input = row.input as {
      from?: string;
      commitment?: { at: string; reason: string } | null;
    } | null;
    if (!input?.from) continue;
    const plan = (params: Record<string, unknown>) =>
      computeWaitDuration({
        defaultMinutes: Number(params[`${row.blockId}.defaultMinutes`]),
        bufferMinutes: Number(params[`${row.blockId}.bufferMinutes`]),
        simNow: new Date(input.from as string),
        commitment: input.commitment
          ? { at: new Date(input.commitment.at), reason: input.commitment.reason }
          : null,
        speed: 1,
      });
    const b = plan(before);
    const a = plan(after);
    cases.push({
      kind: 'wait',
      label: `${row.blockId} wait from ${input.from}`,
      ref: row.id,
      before: b.simMinutes,
      after: a.simMinutes,
      note: a.reason,
      ok: true,
    });
  }
  return {
    cases,
    text: cases.length
      ? `${cases.length} recorded waits: ${cases.map((c) => `${c.before} → ${c.after} min`).join(', ')}`
      : 'no recorded waits yet; applies to the next runs',
  };
}

/** Re-runs the deterministic parts with old vs new parameters; improved = no new false blocks on approved history. */
export async function backtestParameters(args: {
  learning: LearningCase;
  parameters: Record<string, number>;
}): Promise<Backtest> {
  const { learning, parameters } = args;
  const { definition, params: current } = learning;
  const specs = parameterWhitelist(definition);
  const keys = Object.keys(parameters);
  const withDefaults = Object.fromEntries(specs.map((spec) => [spec.key, spec.default]));
  const before = { ...withDefaults, ...current };
  const after = { ...before, ...parameters };
  const parts: { cases: BacktestCase[]; text: string }[] = [];
  if (keys.some((key) => GATE_KEYS.includes(key)))
    parts.push(await bahnProposalCases({ before: gateParams(before), after: gateParams(after) }));
  if (keys.some((key) => GATE_KEYS.includes(key) || key in DEFAULT_CHAIN_PARAMETERS))
    parts.push(await cardOptionCases({ playbookId: definition.id, before, after }));
  if (keys.some((key) => key.startsWith('routing.')))
    parts.push(await signalCases({ parameters, current }));
  const waitBlocks = [
    ...new Set(
      keys
        .filter((key) => /\.(defaultMinutes|bufferMinutes)$/.test(key))
        .map((key) => key.split('.')[0])
    ),
  ];
  if (waitBlocks.length)
    parts.push(await waitCases({ playbookId: definition.id, before, after, blockIds: waitBlocks }));
  if (!parts.length)
    parts.push({
      cases: [],
      text: 'nothing recorded depends on this value yet; it applies to the next runs',
    });
  const cases = parts.flatMap((part) => part.cases);
  const falseBlocks = cases.filter((c) => !c.ok).length;
  const change = keys.map((key) => `${key} ${before[key]} → ${after[key]}`).join(', ');
  return {
    kind: 'PARAMETER',
    cases,
    summary: `${change}. ${parts.map((part) => part.text).join('. ')}.`,
    improved: falseBlocks === 0,
    costUsd: 0,
    ranAt: new Date().toISOString(),
  };
}
