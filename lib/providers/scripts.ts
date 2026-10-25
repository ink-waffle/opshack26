// Scripted replies for deterministic demos: lib/providers/scripts/<orderRef>.json, first matching entry wins.

import { readFile } from 'fs/promises';
import { join } from 'path';

import type { ConversationParty } from '@/lib/providers';

export type ScriptedReply = {
  party: ConversationParty;
  // Case-insensitive regex tested against the question.
  match: string;
  reply: string;
  // The party stays silent: the question is sent, nothing comes back.
  noReply?: boolean;
  speaker?: string;
  // provider replies: reconciliation outcome and booking reference.
  outcome?: string;
  bookingReference?: string;
};

type ScriptFile = { orderRef: string; notes?: string; replies: ScriptedReply[] };

function scriptsDir(): string {
  return join(process.env.CONTROL_REPO_ROOT ?? process.cwd(), 'lib/providers/scripts');
}

async function loadScript(orderRef: string): Promise<ScriptFile | null> {
  if (process.env.CONVERSATION_SCRIPTS === 'off') return null;
  try {
    const text = await readFile(join(scriptsDir(), `${orderRef}.json`), 'utf8');
    return JSON.parse(text) as ScriptFile;
  } catch {
    return null;
  }
}

export async function findScriptedReply(args: {
  orderRef: string;
  party: ConversationParty;
  question: string;
}): Promise<ScriptedReply | null> {
  const { orderRef, party, question } = args;
  const script = await loadScript(orderRef);
  if (!script) return null;
  return (
    script.replies.find(
      (entry) => entry.party === party && new RegExp(entry.match, 'i').test(question)
    ) ?? null
  );
}
