// Offline eval of the watchman classifier: Jev over every inbound external message, state clipped to the message time.
// Label = an operator exception action on the same order within 60 min. Writes research/eval/watchman-eval.{md,json}.
// pnpm eval:watchman [--limit n] [--concurrency n]

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { getOrderBundle, type OrderBundle } from '@/lib/bahn';
import type { BahnMessage } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prismaClient';
import { truncate } from '@/lib/watchman/format';
import { type Classification, classify } from '@/lib/watchman/questions';
import { decideRoute, ROUTING_PARAMS } from '@/lib/watchman/routing';
import { buildOrderState, stateSize } from '@/lib/watchman/state';
import { TRIGGER_TYPES, TRIGGERS, type TriggerType } from '@/lib/watchman/taxonomy';

const INBOUND = ['driver', 'site_contact', 'customer', 'handoff_contact'];
const EXCEPTION_COMMANDS = [
  'incident.opened',
  'work_item.opened',
  'work.opened',
  'assignment.cancelled',
  'plan.replaced',
  'pickup.window_revised',
  'delivery.window_revised',
  'travel.rebooked',
  'alert.acknowledged',
  'alert.assessed',
];
const LABEL_WINDOW_MS = 60 * 60_000;
const THRESHOLDS = [0.5, 0.7, 0.9];
const OUT_DIR = join(process.cwd(), 'research/eval');

type Row = {
  messageId: string;
  orderRef: string;
  authorType: string;
  language: string;
  authoredAt: string;
  text: string;
  label: boolean;
  labelEvents: string[];
  stateBytes: number;
  classification: Omit<Classification, 'answers'> | null;
  error?: string;
};

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]);
      }
    })
  );
  return out;
}

function metrics(rows: Row[], predict: (row: Row) => boolean) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const row of rows) {
    const p = predict(row);
    if (p && row.label) tp++;
    else if (p) fp++;
    else if (row.label) fn++;
    else tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, tn, precision, recall, f1, flagged: tp + fp };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

function topLabels(row: Row, min = 0.5) {
  return (row.classification?.triggers ?? [])
    .filter((t) => t.p >= min)
    .slice(0, 3)
    .map((t) => `${t.type} ${t.p.toFixed(2)}`)
    .join(', ');
}

function decisionFor(row: Row) {
  return decideRoute({
    source: 'message',
    triggers: row.classification!.triggers,
    needsAttention: row.classification!.needsAttention,
  });
}

function routed(row: Row) {
  return row.classification ? decisionFor(row).action : 'error';
}

async function main() {
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  const concurrency = Number(arg('concurrency') ?? 6);
  const messages = await prisma.bahnMessage.findMany({
    where: {
      authorType: { in: INBOUND },
      NOT: { id: { startsWith: 'msg-sim-' } },
    },
    orderBy: { authoredAt: 'asc' },
    take: limit,
  });
  const orderIds = [...new Set(messages.map((m) => m.orderId))];
  const bundles = new Map<string, OrderBundle>();
  for (const id of orderIds) {
    const bundle = await getOrderBundle({ ref: id });
    if (bundle) bundles.set(id, bundle);
  }
  const events = await prisma.bahnOperationalEvent.findMany({
    where: { actorType: 'operator', command: { in: EXCEPTION_COMMANDS } },
    omit: { raw: true },
  });
  console.log(
    `${messages.length} inbound messages on ${orderIds.length} orders; Jev × ${concurrency}`
  );

  const startedAt = Date.now();
  const rows = await pool(messages, concurrency, async (message: BahnMessage): Promise<Row> => {
    const bundle = bundles.get(message.orderId)!;
    const conversation = bundle.conversations.find((c) => c.id === message.conversationId) ?? null;
    const at = message.authoredAt.getTime();
    const labelEvents = events
      .filter(
        (e) =>
          e.orderId === message.orderId &&
          e.recordedAt.getTime() >= at &&
          e.recordedAt.getTime() <= at + LABEL_WINDOW_MS
      )
      .map((e) => `${e.command} @${e.recordedAt.toISOString().slice(11, 16)}`);
    const state = buildOrderState({
      bundle,
      now: message.authoredAt,
      asOf: message.authoredAt,
      trigger: { kind: 'message', message, conversation },
    });
    const base = {
      messageId: message.id,
      orderRef: bundle.order.reference,
      authorType: message.authorType,
      language: message.language,
      authoredAt: message.authoredAt.toISOString(),
      text: message.body,
      label: labelEvents.length > 0,
      labelEvents,
      stateBytes: stateSize(state),
    };
    try {
      const { answers: _answers, ...classification } = await classify({ state });
      process.stdout.write('.');
      return { ...base, classification };
    } catch (error) {
      process.stdout.write('x');
      return { ...base, classification: null, error: String(error) };
    }
  });
  const wallMs = Date.now() - startedAt;
  console.log('');

  const ok = rows.filter((r) => r.classification);
  const positives = ok.filter((r) => r.label).length;
  const costUsd = ok.reduce((sum, r) => sum + (r.classification?.costUsd ?? 0), 0);
  const durations = ok.map((r) => r.classification!.durationMs);
  const sizes = rows.map((r) => r.stateBytes);

  const attention = THRESHOLDS.map((t) => ({
    t,
    ...metrics(ok, (r) => r.classification!.needsAttention >= t),
  }));
  const sweep = Array.from({ length: 19 }, (_, i) => 0.05 + i * 0.05).map((t) => ({
    t,
    ...metrics(ok, (r) => r.classification!.needsAttention >= t),
  }));
  const best = [...sweep].sort((a, b) => b.f1 - a.f1)[0];
  const routing = metrics(ok, (r) => routed(r) !== 'record');
  const anyTrigger = (t: number) =>
    metrics(ok, (r) => r.classification!.triggers.some((x) => x.type !== 'ROUTINE' && x.p >= t));

  const distribution = TRIGGER_TYPES.map((type) => {
    const ps = ok.map((r) => r.classification!.triggers.find((x) => x.type === type)?.p ?? 0);
    const top = ok.filter((r) => r.classification!.triggers[0]?.type === type).length;
    return {
      type,
      top,
      at05: ps.filter((p) => p >= 0.5).length,
      at07: ps.filter((p) => p >= 0.7).length,
      at09: ps.filter((p) => p >= 0.9).length,
      posAt07: ok.filter(
        (r) => r.label && (r.classification!.triggers.find((x) => x.type === type)?.p ?? 0) >= 0.7
      ).length,
    };
  });
  const routes = ok.reduce<Record<string, number>>((acc, r) => {
    const action = routed(r);
    acc[action] = (acc[action] ?? 0) + 1;
    return acc;
  }, {});
  const claims = ok.reduce<Record<string, number>>((acc, r) => {
    acc[r.classification!.claimType] = (acc[r.classification!.claimType] ?? 0) + 1;
    return acc;
  }, {});

  const chosen = ROUTING_PARAMS.needsAttentionThreshold;
  const misses = ok
    .filter((r) => r.label && r.classification!.needsAttention < chosen)
    .sort((a, b) => a.classification!.needsAttention - b.classification!.needsAttention);
  const falseAlarms = ok
    .filter((r) => !r.label && r.classification!.needsAttention >= chosen)
    .sort((a, b) => b.classification!.needsAttention - a.classification!.needsAttention);
  const playbookRows = ok.filter((r) => routed(r) === 'playbook');
  const triageOrders = new Set(ok.filter((r) => routed(r) === 'triage').map((r) => r.orderRef));
  const byAuthor = INBOUND.map((author) => {
    const subset = ok.filter((r) => r.authorType === author);
    return {
      author,
      n: subset.length,
      ...metrics(subset, (r) => r.classification!.needsAttention >= chosen),
    };
  });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    join(OUT_DIR, 'watchman-eval.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)
  );

  const exampleLine = (r: Row) =>
    `| ${r.orderRef} | ${r.authorType} | ${r.authoredAt.slice(5, 16).replace('T', ' ')} | ${truncate(r.text, 110).replace(/\|/g, '/')} | ${r.classification!.needsAttention.toFixed(2)} | ${topLabels(r) || '-'} | ${r.labelEvents.join(', ') || '-'} |`;

  const md = `# Watchman classifier eval

Generated by \`pnpm eval:watchman\` on ${new Date().toISOString().slice(0, 16)}Z (model ${ok[0]?.classification?.model ?? '?'}). Raw rows: \`research/eval/watchman-eval.json\`.

## Setup

- **Items:** every inbound external message in the dataset (authors: driver, site contact, customer, handoff contact): ${rows.length} messages on ${orderIds.length} orders. Simulator messages (\`msg-sim-*\`) are excluded. ${rows.length - ok.length} Jev errors.
- **Input:** the same state and questions as live \`inspect()\`: \`buildOrderState\` with \`asOf\` = the message time, so later messages, events, alerts, quotes and bookings are hidden and later status changes are rolled back. Order status, the plan and the time windows are snapshot values (some leakage remains). State size: median ${quantile(sizes, 0.5)} B, max ${Math.max(...sizes)} B.
- **Questions:** one request per message with ${TRIGGER_TYPES.length} trigger nouls (multi-label), \`needs_attention\`, \`claim_type\` and \`contradicts_records\`.
- **Label (proxy):** positive if an operator exception action on the same order is recorded within 60 min after the message (\`operational_events\`, \`actor_type = operator\`, commands ${EXCEPTION_COMMANDS.map((c) => `\`${c}\``).join(', ')}). ${positives} of ${ok.length} messages are positive (${pct(positives / ok.length)}).

## Label caveats

- **Small sample.** ${ok.length} messages and ${positives} positives: one message moves recall by ~${pct(1 / Math.max(positives, 1))}. Treat every number below as ±10 points.
- **Labels are operator behaviour, not ground truth.** An operator may have acted on an earlier message, through a channel that leaves no event, or later than 60 min. Many messages that clearly need a reply (questions, corrections) get only a \`message.sent\`, which is not an exception command, so they count as negatives. That lowers measured precision for a watchman whose job is "does someone need to act", which is broader than "an exception command followed".
- **One event can label several messages.** A burst of driver and customer messages before one \`incident.opened\` makes all of them positive.
- **Leakage is partial.** Records are clipped to the message time, but snapshot-only fields (order status, plan, windows) are not.

## needs_attention

| threshold | flagged | TP | FP | FN | precision | recall | F1 |
|---|---|---|---|---|---|---|---|
${attention.map((m) => `| ${m.t} | ${m.flagged} | ${m.tp} | ${m.fp} | ${m.fn} | ${pct(m.precision)} | ${pct(m.recall)} | ${m.f1.toFixed(2)} |`).join('\n')}

Best F1 over a 0.05–0.95 sweep: threshold ${best.t.toFixed(2)} (precision ${pct(best.precision)}, recall ${pct(best.recall)}, F1 ${best.f1.toFixed(2)}).

Other predictors against the same label:
- Any non-ROUTINE trigger ≥ 0.7: precision ${pct(anyTrigger(0.7).precision)}, recall ${pct(anyTrigger(0.7).recall)} (${anyTrigger(0.7).flagged} flagged).
- Live routing at the current defaults (playbook or triage = flagged): precision ${pct(routing.precision)}, recall ${pct(routing.recall)} (${routing.flagged} flagged). Routing outcome counts: ${Object.entries(
    routes
  )
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')}.

By author at needs_attention ≥ ${chosen}:

| author | n | flagged | precision | recall |
|---|---|---|---|---|
${byAuthor.map((a) => `| ${a.author} | ${a.n} | ${a.flagged} | ${pct(a.precision)} | ${pct(a.recall)} |`).join('\n')}

## Trigger distribution

Counts of messages per trigger type (top-1, and P ≥ 0.5 / 0.7 / 0.9); "pos@0.7" = of those at ≥ 0.7, how many are label-positive.

| trigger | label | top-1 | ≥0.5 | ≥0.7 | ≥0.9 | pos@0.7 |
|---|---|---|---|---|---|---|
${distribution.map((d) => `| ${d.type} | ${TRIGGERS[d.type as TriggerType].label} | ${d.top} | ${d.at05} | ${d.at07} | ${d.at09} | ${d.posAt07} |`).join('\n')}

Claim types: ${Object.entries(claims)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')}.

## Misses (label positive, needs_attention < ${chosen})

| order | author | time | message | needs_attention | top labels | operator action that followed |
|---|---|---|---|---|---|---|
${misses.slice(0, 10).map(exampleLine).join('\n') || '| - | | | | | | |'}

## False alarms (label negative, needs_attention ≥ ${chosen}), highest first

| order | author | time | message | needs_attention | top labels | operator action |
|---|---|---|---|---|---|---|
${falseAlarms.slice(0, 12).map(exampleLine).join('\n') || '| - | | | | | | |'}

## Playbook routes

Messages whose triggers clear a playbook threshold (CROSSING_CAPACITY ≥ ${ROUTING_PARAMS.triggers.CROSSING_CAPACITY.threshold} → missed-connection, VEHICLE_WARNING ≥ ${ROUTING_PARAMS.triggers.VEHICLE_WARNING.threshold} → vehicle-warning, PICKUP_NOT_CONFIRMED ≥ ${ROUTING_PARAMS.triggers.PICKUP_NOT_CONFIRMED.threshold} → pickup-unconfirmed):

| order | author | time | message | routed to |
|---|---|---|---|---|
${
  playbookRows
    .map(
      (r) =>
        `| ${r.orderRef} | ${r.authorType} | ${r.authoredAt.slice(5, 16).replace('T', ' ')} | ${truncate(r.text, 110).replace(/\|/g, '/')} | ${decisionFor(
          r
        )
          .playbooks.map((m) => `${m.playbookId} (${m.triggerType} ${m.p.toFixed(2)})`)
          .join(', ')} |`
    )
    .join('\n') || '| - | | | | |'
}

Escape hatch: ${ok.filter((r) => routed(r) === 'triage').length} messages on ${triageOrders.size} orders clear needs_attention without a playbook. Live, each order holds one OPEN triage card (later items are appended) and an order with an active playbook run gets the item through that run, so at most ${triageOrders.size} cards.

## Chosen defaults and why

- **needs_attention ≥ ${chosen}** (\`ROUTING_PARAMS.needsAttentionThreshold\`). It keeps recall at ${pct(attention.find((a) => a.t === 0.7)?.recall ?? 0)} with precision ${pct(attention.find((a) => a.t === 0.7)?.precision ?? 0)}; 0.9 drops recall to ${pct(attention.find((a) => a.t === 0.9)?.recall ?? 0)} while precision only moves to ${pct(attention.find((a) => a.t === 0.9)?.precision ?? 0)}, and 0.5 adds ${(attention.find((a) => a.t === 0.5)?.flagged ?? 0) - (attention.find((a) => a.t === 0.7)?.flagged ?? 0)} flagged messages for ${(attention.find((a) => a.t === 0.5)?.tp ?? 0) - (attention.find((a) => a.t === 0.7)?.tp ?? 0)} more hit(s). The F1 optimum (${best.t.toFixed(2)}) is within noise of 0.7. Most "false alarms" are customer and site questions that do need a person (release dates, documents, billing) but did not produce an exception command, so measured precision is a floor.
- **Playbook triggers ≥ 0.7** (crossing capacity, vehicle warning): the first report in each real ferry and warning case (CD-420299 07:20, CD-420322 08:04) scores above 0.9 while unrelated messages stay below 0.5; follow-ups land near 0.7 and are absorbed by the one-run-per-(order, playbook) dedupe; a playbook run is cheap to dismiss (its own preconditions re-check the records).
- **PICKUP_NOT_CONFIRMED ≥ 0.8**: from text it is easily confused with "car not found at pickup" (CD-420593 scores 0.6–0.75 and belongs to P7). The deterministic M2 monitor is the primary source (p = 1).

## Cost and latency

- Jev cost: $${costUsd.toFixed(4)} total, $${(costUsd / Math.max(ok.length, 1)).toFixed(5)} per message.
- Latency per request: median ${quantile(durations, 0.5)} ms, p90 ${quantile(durations, 0.9)} ms, max ${Math.max(...durations)} ms (${concurrency} in parallel; wall ${(wallMs / 1000).toFixed(0)} s).
`;
  await writeFile(join(OUT_DIR, 'watchman-eval.md'), md);
  console.log(md);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
