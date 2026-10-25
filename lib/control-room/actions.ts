'use server';

// Operator actions: decide a card (completes its Trigger.dev waitpoint), close triage, steer the sim clock.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { tasks, wait } from '@trigger.dev/sdk';
import { refresh } from 'next/cache';

import { getSimClock, HOUR_MS, setSimClock, simNow } from '@/lib/clock';
import { computeSimNow } from '@/lib/clock/math';
import { decisionRefusal } from '@/lib/control-room/decide';
import { getFactRecord } from '@/lib/control-room/records';
import type { ActionResult, FactRecordView } from '@/lib/control-room/types';
import { Prisma } from '@/lib/generated/prisma/client';
import type { DecisionPayload } from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';

const OPERATOR = 'operator';

type Intent = 'approve' | 'edit' | 'reject';

const STATUS: Record<Intent, 'APPROVED' | 'EDITED' | 'REJECTED'> = {
  approve: 'APPROVED',
  edit: 'EDITED',
  reject: 'REJECTED',
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True when U2's meta-learn task is registered (trigger/meta*.ts or lib/meta defines it). */
async function metaLearnExists(): Promise<boolean> {
  const root = process.env.CONTROL_REPO_ROOT ?? process.cwd();
  const candidates: string[] = [];
  for (const dir of ['trigger', 'lib/meta']) {
    const files = await readdir(path.join(root, dir)).catch(() => [] as string[]);
    for (const file of files) {
      if (dir === 'trigger' && !file.startsWith('meta')) continue;
      if (file.endsWith('.ts')) candidates.push(path.join(root, dir, file));
    }
  }
  for (const file of candidates) {
    const source = await readFile(file, 'utf8').catch(() => '');
    if (/id:\s*['"]meta-learn['"]/.test(source)) return true;
  }
  return false;
}

async function learnFrom(cardId: string): Promise<void> {
  try {
    if (!(await metaLearnExists())) return;
    await tasks.trigger('meta-learn', { cardId }, { idempotencyKey: `meta-learn:${cardId}` });
  } catch (error) {
    console.error('[control-room] meta-learn trigger failed', errorText(error));
  }
}

/** Approve, edit or reject a DECISION card. Form fields: cardId, intent, optionId, note, orig:<actionId>, msg:<actionId>, drop:<actionId>. */
export async function decideCard(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const cardId = field(formData, 'cardId');
  const intent = field(formData, 'intent') as Intent;
  if (!(intent in STATUS)) return { ok: false, error: 'Unknown action.' };
  const optionId = field(formData, 'optionId') || undefined;
  const note = field(formData, 'note');

  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card || card.kind !== 'DECISION') return { ok: false, error: 'This card no longer exists.' };
  if (card.status !== 'OPEN') return { ok: false, error: 'This card was already decided.' };
  if (!card.waitpointTokenId)
    return {
      ok: false,
      error: 'The agent is not waiting on this card any more, so there is nothing to resume.',
    };
  if (intent === 'reject' && !note) return { ok: false, error: 'Say why you rejected it.' };
  if (intent !== 'reject' && !optionId) return { ok: false, error: 'Choose an option first.' };

  const messages: Record<string, string> = {};
  const removeActionIds: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    if (key.startsWith('msg:') && value.trim()) messages[key.slice(4)] = value.trim();
    if (key.startsWith('drop:') && value === 'on') removeActionIds.push(key.slice(5));
  }
  const original = new Map<string, string>();
  for (const [key, value] of formData.entries())
    if (key.startsWith('orig:') && typeof value === 'string')
      original.set(key.slice(5), value.trim());
  for (const [id, text] of Object.entries(messages))
    if (original.get(id) === text) delete messages[id];

  const payload: DecisionPayload = {
    action: intent,
    ...(intent !== 'reject' ? { optionId } : {}),
    ...(intent === 'edit'
      ? {
          edits: {
            ...(Object.keys(messages).length ? { messages } : {}),
            ...(removeActionIds.length ? { removeActionIds } : {}),
          },
        }
      : {}),
    ...(note ? { note } : {}),
    decidedBy: OPERATOR,
  };
  // The same check the execute block repeats: a blocked option or an edit it cannot carry out never reaches the run.
  const refusal = decisionRefusal({ options: card.options, decision: payload });
  if (refusal) return { ok: false, error: refusal };

  const status = STATUS[intent];
  const claimed = await prisma.card.updateMany({
    where: { id: card.id, status: 'OPEN' },
    data: { status, decision: payload, decidedBy: OPERATOR, decidedAt: await simNow() },
  });
  if (claimed.count === 0) return { ok: false, error: 'This card was already decided.' };

  try {
    await wait.completeToken(card.waitpointTokenId, payload);
  } catch (error) {
    await prisma.card.updateMany({
      where: { id: card.id, status },
      data: { status: 'OPEN', decision: Prisma.DbNull, decidedBy: null, decidedAt: null },
    });
    return {
      ok: false,
      error: `Your decision did not reach the agent (${errorText(error)}). Nothing was changed; try again.`,
    };
  }

  if (intent !== 'approve') await learnFrom(card.id);
  refresh();
  return {
    ok: true,
    message:
      intent === 'reject'
        ? 'Rejected. The agent stops, and the order goes to “Worth a look” with what it found.'
        : intent === 'edit'
          ? `Sent. The agent is carrying out option ${optionId} with your edits.`
          : `Sent. The agent is carrying out option ${optionId}.`,
  };
}

/** Close a TRIAGE card: "handled" (note required) or "dismiss". */
export async function resolveTriage(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const cardId = field(formData, 'cardId');
  const intent = field(formData, 'intent');
  const note = field(formData, 'note');
  if (intent !== 'handled' && intent !== 'dismiss') return { ok: false, error: 'Unknown action.' };
  if (intent === 'handled' && !note) return { ok: false, error: 'Say what you did.' };
  const updated = await prisma.card.updateMany({
    where: { id: cardId, kind: 'TRIAGE', status: 'OPEN' },
    data: {
      status: intent === 'handled' ? 'APPROVED' : 'CANCELLED',
      decision: {
        action: intent === 'handled' ? 'handled' : 'dismissed',
        note,
        decidedBy: OPERATOR,
      },
      decidedBy: OPERATOR,
      decidedAt: await simNow(),
    },
  });
  if (updated.count === 0) return { ok: false, error: 'This card was already closed.' };
  refresh();
  return { ok: true, message: intent === 'handled' ? 'Marked as handled.' : 'Dismissed.' };
}

const SPEEDS = new Set([0, 1, 30, 120]);

export async function setClockSpeed(speed: number): Promise<ActionResult> {
  if (!SPEEDS.has(speed)) return { ok: false, error: 'Unsupported speed.' };
  await setSimClock({ speed });
  refresh();
  return { ok: true };
}

export async function advanceClock(minutes: number): Promise<ActionResult> {
  if (minutes !== 60) return { ok: false, error: 'Unsupported jump.' };
  const clock = await getSimClock();
  const now = computeSimNow({ clock });
  await setSimClock({ anchorSim: new Date(now.getTime() + HOUR_MS) });
  refresh();
  return { ok: true };
}

export async function loadFactRecord(factId: string): Promise<FactRecordView> {
  return getFactRecord({ factId });
}
