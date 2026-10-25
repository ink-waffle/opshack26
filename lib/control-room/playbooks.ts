// Playbook and block names in plain words for queue rows, run traces and "what happens next".

import type { IconName } from '@/components/ui/Icon';
import { formatTime, humanize } from '@/lib/control-room/format';
import type { BlockRun, PlaybookRun } from '@/lib/generated/prisma/client';
import { getPlaybook } from '@/lib/playbooks/registry';
import { plainText } from '@/lib/text';

const ICON: Record<string, IconName> = {
  'missed-connection': 'ferry',
  'vehicle-warning': 'warning',
  'pickup-unconfirmed': 'clock',
  'escape-hatch': 'inbox',
};

const FALLBACK_TITLE: Record<string, string> = {
  'missed-connection': 'Missed connection',
  'vehicle-warning': 'Warning light or breakdown',
  'pickup-unconfirmed': 'Pickup not confirmed',
  'escape-hatch': 'No playbook fits',
};

export type PlaybookMeta = { id: string; title: string; icon: IconName };

export function playbookMeta(id: string | null | undefined): PlaybookMeta {
  if (!id) return { id: '', title: 'Manual', icon: 'operator' };
  const definition = getPlaybook(id);
  return {
    id,
    title: definition?.title ?? FALLBACK_TITLE[id] ?? humanize(id),
    icon: ICON[id] ?? 'flow',
  };
}

export type BlockMeta = { id: string; title: string; kind: string; description: string | null };

export function blockMeta(args: { playbookId: string; blockId: string }): BlockMeta {
  const { playbookId, blockId } = args;
  const block = getPlaybook(playbookId)?.blocks.find((candidate) => candidate.id === blockId);
  return {
    id: blockId,
    title: block?.title ?? humanize(blockId),
    kind: block?.kind ?? 'deterministic',
    description: block?.description ?? null,
  };
}

const DOUBLE = new Set(['get', 'set', 'put', 'stop', 'plan', 'run']);
const VERBS = new Set([
  ...DOUBLE,
  'ask',
  'find',
  'check',
  'collect',
  'book',
  'close',
  'hand',
  'wait',
  'send',
  'search',
  'look',
  'confirm',
  'call',
  'decide',
  'gather',
  'reconcile',
  'build',
  'prepare',
  'tell',
  'notify',
  'inform',
  'compute',
  'read',
  'write',
  'recheck',
  'escalate',
  'move',
  'cancel',
  'assign',
  'offer',
  'verify',
  'review',
  'update',
  'draft',
  'schedule',
  'retry',
  'propose',
  'execute',
  'carry',
]);

function ing(word: string): string {
  if (DOUBLE.has(word)) return `${word}${word.at(-1)}ing`;
  if (word === 'carry') return 'carrying';
  if (word.endsWith('e') && !word.endsWith('ee')) return `${word.slice(0, -1)}ing`;
  return `${word}ing`;
}

/** "Ask the ferry company" → "Asking the ferry company"; non-imperative titles stay as they are. */
export function progressive(title: string): string {
  const words = title.split(' ');
  const first = words[0]?.toLowerCase();
  if (!first || !VERBS.has(first)) return title;
  const out = words.map((word, i) => {
    const lower = word.toLowerCase();
    if (i === 0) return ing(lower);
    return words[i - 1] === 'and' && VERBS.has(lower) ? ing(lower) : word;
  });
  return out.join(' ').replace(/^./, (c) => c.toUpperCase());
}

const ACTIVE_STATUSES = new Set(['DETECTED', 'GATHERING', 'OPTIONS_READY', 'EXECUTING']);

export function isActiveRun(run: Pick<PlaybookRun, 'status'>): boolean {
  return ACTIVE_STATUSES.has(run.status) || run.status === 'AWAITING_DECISION';
}

export const RUN_STATUS_WORDS: Record<string, string> = {
  DETECTED: 'Starting',
  GATHERING: 'Gathering facts',
  OPTIONS_READY: 'Options ready',
  AWAITING_DECISION: 'Waiting for your decision',
  EXECUTING: 'Carrying out',
  CLOSED: 'Done',
  ESCALATED: 'Handed to a person',
  FAILED: 'Stopped with an error',
};

/** What the run is doing right now, in one plain line. */
export function describeCurrentStep(args: {
  run: Pick<PlaybookRun, 'playbookId' | 'currentBlockId' | 'status'>;
  blockRun: Pick<BlockRun, 'blockId' | 'kind' | 'status' | 'input'> | null;
}): string {
  const { run, blockRun } = args;
  const blockId = blockRun?.blockId ?? run.currentBlockId;
  if (!blockId) return RUN_STATUS_WORDS[run.status] ?? humanize(run.status);
  const meta = blockMeta({ playbookId: run.playbookId, blockId });
  if (blockRun?.kind === 'wait' || meta.kind === 'wait') {
    const input = (blockRun?.input ?? null) as {
      until?: string;
      commitment?: { reason?: string } | null;
    } | null;
    const until = input?.until ? formatTime({ at: new Date(input.until) }) : null;
    const next = input?.commitment?.reason ? plainText(input.commitment.reason) : null;
    if (until) return `Waiting until ${until}${next ? `, before ${next}` : ''}`;
    return progressive(meta.title);
  }
  if (meta.kind === 'human') return 'Waiting for your decision';
  return progressive(meta.title);
}
