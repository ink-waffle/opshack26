// Plain-language titles and speaker words shared by the queue, card and order pages (pure).

import { cleanAgentText, stripOrderRef } from '@/lib/control-room/format';
import type { Card } from '@/lib/generated/prisma/client';
import { TRIGGERS } from '@/lib/watchman/taxonomy';

const SPEAKER: Record<string, string> = {
  driver: 'Driver',
  customer: 'Customer',
  site_contact: 'Site',
  handoff_contact: 'Receiver',
  operator: 'Ops',
  agent: 'Agent',
};

export function speakerWord(authorType: string): string {
  return SPEAKER[authorType] ?? authorType;
}

/** A triage card's title: what the watchman read in the message ("Driver cannot make the pickup"). */
export function triageTitle(args: { card: Card; triggerType: string | null }): string {
  const { card, triggerType } = args;
  const trigger = triggerType
    ? (TRIGGERS as Record<string, { label: string } | undefined>)[triggerType]
    : undefined;
  if (trigger) return trigger.label;
  return stripOrderRef(card.title.replace(/^CD-\d+\s*·\s*[^:]+:\s*/u, ''));
}

/**
 * A plain title saying what is wrong. Generic runtime titles ("…needs a decision") give way to the summary's
 * first sentence, which then leaves the "what happened" lines.
 */
export function decisionTitle(args: { title: string; summary: string; now?: Date }): {
  title: string;
  lines: string[];
} {
  const title = stripOrderRef(cleanAgentText(args.title, args.now));
  const summary = cleanAgentText(args.summary, args.now);
  if (!/needs a decision$/i.test(title)) return { title, lines: splitSummary(summary) };
  const first = summary.match(/^[^.!?\n]+[.!?]?/)?.[0]?.trim() ?? '';
  if (!first || first.length > 110) return { title, lines: splitSummary(summary) };
  const rest = summary.slice(first.length).trim();
  return { title: first.replace(/\.$/, ''), lines: rest ? splitSummary(rest) : [] };
}

function splitSummary(summary: string): string[] {
  const lines = summary
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(0, 3);
  // Split only where a sentence ends ("EUR 387.00" and "14.30" stay whole).
  return (lines[0] ?? '')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
