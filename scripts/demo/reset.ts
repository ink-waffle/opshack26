// Demo reset (LOCAL by default): `pnpm demo:reset`. Cancels live runs, wipes control.* work (runs, cards, signals,
// tool/operator facts), removes simulated Bahn writes, re-syncs facts, resets amendments, clock → 21 Oct 09:00Z paused.

import { BAHN_COLLECTIONS, BAHN_SNAPSHOT_AT } from '@/lib/bahn/collections';
import { readBahnCollection, readBahnManifest } from '@/lib/bahn/dataset';
import { countBahnTables, insertBahnRecords } from '@/lib/bahn/insert';
import { HOUR_MS, setSimClock } from '@/lib/clock';
import { syncAllOrderFacts } from '@/lib/facts';
import { prisma } from '@/lib/prismaClient';
import {
  amendmentsWithSource,
  cancelLiveTriggerRuns,
  finishScript,
  flag,
  guardDatabase,
  keptSources,
  resetDispatchKeys,
} from '@/scripts/demo/shared';

const SIMULATED_MESSAGE_PREFIXES = ['msg-ctl-', 'msg-sim-'];
const SIMULATED_CONVERSATION_PREFIX = 'conv-sim-';
const SIMULATED_RESERVATION_PREFIX = 'res-sim-';

/**
 * Keeps the oldest approved missed-connection amendment and the newest other one (set back to PROPOSED for the live approve),
 * both only with their source card still present; deletes the rest.
 */
async function resetAmendments() {
  const all = await prisma.amendment.findMany({ orderBy: { createdAt: 'asc' } });
  const sourced = await amendmentsWithSource(all);
  const approved = sourced.find(
    (amendment) => amendment.status === 'APPROVED' && amendment.playbookId === 'missed-connection'
  );
  const proposed =
    sourced
      .filter(
        (amendment) =>
          amendment.id !== approved?.id &&
          (amendment.status === 'PROPOSED' || amendment.status === 'APPROVED')
      )
      .at(-1) ?? null;
  const keep = [approved, proposed].filter((amendment) => !!amendment);
  if (proposed && proposed.status !== 'PROPOSED')
    await prisma.amendment.update({
      where: { id: proposed.id },
      data: { status: 'PROPOSED', decidedBy: null, decidedAt: null },
    });
  const deleted = await prisma.amendment.deleteMany({
    where: { id: { notIn: keep.map((amendment) => amendment.id) } },
  });
  return {
    approved: approved?.id ?? null,
    proposed: proposed?.id ?? null,
    deleted: deleted.count,
    keep,
  };
}

async function main() {
  guardDatabase({ allowProd: flag('yes-prod') });
  const startedAt = Date.now();

  // The Trigger.dev dev env belongs to the local worker; a prod reset leaves its runs alone.
  const skipTrigger = flag('skip-trigger') || flag('yes-prod');
  const cancelled = skipTrigger ? [] : await cancelLiveTriggerRuns();
  if (cancelled.length) await new Promise((resolve) => setTimeout(resolve, 2000));

  const amendments = await resetAmendments();
  // The kept amendments' source cards and their runs stay, so /meta still shows what the operator corrected.
  const kept = await keptSources(amendments.keep);
  // Their runs' hand-over cards stay too, marked handled, so the history reads "handed to a person".
  const handOvers = await prisma.card.findMany({
    where: { kind: 'TRIAGE', runId: { in: kept.runIds }, playbookId: { not: 'escape-hatch' } },
    select: { id: true },
  });
  const handOverIds = handOvers.map((card) => card.id);
  const keepCardIds = [...kept.cardIds, ...handOverIds];

  const [runRows, signalRows] = await Promise.all([
    prisma.playbookRun.findMany({ select: { orderId: true, playbookId: true } }),
    prisma.signal.findMany({ select: { orderId: true, routing: true } }),
  ]);
  const dispatched = [
    ...runRows.flatMap((run) =>
      run.orderId ? [{ orderId: run.orderId, playbookId: run.playbookId }] : []
    ),
    ...signalRows.flatMap((signal) => {
      const dispatches = (signal.routing as { dispatches?: { playbookId?: string }[] } | null)
        ?.dispatches;
      return (dispatches ?? []).flatMap((dispatch) =>
        dispatch.playbookId && signal.orderId
          ? [{ orderId: signal.orderId, playbookId: dispatch.playbookId }]
          : []
      );
    }),
  ];

  const simulatedMessages = await prisma.bahnMessage.findMany({
    where: { OR: SIMULATED_MESSAGE_PREFIXES.map((prefix) => ({ id: { startsWith: prefix } })) },
    select: { id: true },
  });
  const [
    facts,
    cards,
    keptCards,
    ,
    ,
    keptRuns,
    runs,
    signals,
    messages,
    conversations,
    reservations,
  ] = await prisma.$transaction([
    prisma.fact.deleteMany({ where: { sourceType: { not: 'BAHN_RECORD' } } }),
    prisma.card.deleteMany({ where: { id: { notIn: keepCardIds } } }),
    // Kept history moves to the morning before the snapshot, so nothing on screen is dated after "now".
    prisma.card.updateMany({
      where: { id: { in: keepCardIds } },
      data: { waitpointTokenId: null, decidedAt: new Date(BAHN_SNAPSHOT_AT.getTime() - HOUR_MS) },
    }),
    prisma.card.updateMany({
      where: { id: { in: handOverIds }, status: 'OPEN' },
      data: {
        status: 'APPROVED',
        decision: { action: 'handled', note: 'Handled before the demo started.' },
        decidedBy: 'operator',
        decidedAt: new Date(BAHN_SNAPSHOT_AT.getTime() - HOUR_MS),
      },
    }),
    prisma.playbookRun.updateMany({
      where: { id: { in: kept.runIds } },
      data: { simStartedAt: new Date(BAHN_SNAPSHOT_AT.getTime() - 3 * HOUR_MS) },
    }),
    prisma.playbookRun.updateMany({
      where: { id: { in: kept.runIds }, status: { notIn: ['CLOSED', 'ESCALATED', 'FAILED'] } },
      data: { status: 'CLOSED', closedAt: new Date() },
    }),
    prisma.playbookRun.deleteMany({ where: { id: { notIn: kept.runIds } } }),
    prisma.signal.deleteMany({}),
    prisma.bahnMessage.deleteMany({
      where: { id: { in: simulatedMessages.map((message) => message.id) } },
    }),
    prisma.bahnConversation.deleteMany({
      where: { id: { startsWith: SIMULATED_CONVERSATION_PREFIX } },
    }),
    prisma.bahnTravelReservation.deleteMany({
      where: { id: { startsWith: SIMULATED_RESERVATION_PREFIX } },
    }),
  ]);
  // The simulator bumps updated_at on existing conversations; restore them from the dataset.
  await insertBahnRecords({
    collection: 'conversations',
    records: await readBahnCollection({ collection: 'conversations' }),
    onConflict: 'replace',
  });
  const [manifest, counts] = await Promise.all([readBahnManifest(), countBahnTables()]);
  const drift = BAHN_COLLECTIONS.filter((c) => counts[c] !== manifest.tables[c]);

  const keysReset = skipTrigger ? 0 : await resetDispatchKeys(dispatched);
  const clock = await setSimClock({ anchorSim: BAHN_SNAPSHOT_AT, speed: 0 });
  const synced = await syncAllOrderFacts();
  console.log(
    JSON.stringify(
      {
        cancelledTriggerRuns: cancelled,
        deleted: {
          runs: runs.count,
          cards: cards.count,
          signals: signals.count,
          toolAndOperatorFacts: facts.count,
          simulatedMessages: messages.count,
          simulatedConversations: conversations.count,
          simulatedReservations: reservations.count,
        },
        keptCards: keptCards.count,
        keptRunsClosed: keptRuns.count,
        amendments: {
          approved: amendments.approved,
          proposed: amendments.proposed,
          deleted: amendments.deleted,
        },
        dispatchKeysReset: keysReset,
        facts: { total: synced.total, created: synced.created, pruned: synced.pruned },
        bahnMatchesManifest: drift.length === 0 ? true : drift,
        clock: { simNow: clock.anchorSim.toISOString(), speed: clock.speed },
        ms: Date.now() - startedAt,
      },
      null,
      1
    )
  );
  if (drift.length)
    console.warn(
      `bahn.* differs from the dataset in ${drift.join(', ')}: run pnpm seed:bahn:local`
    );
  console.log(
    'Note: the watchman tick (every minute) re-detects the monitor hits at 09:00 and starts their playbooks; run pnpm demo:prime next.'
  );
}

finishScript(main());
