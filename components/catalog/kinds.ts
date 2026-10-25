// Block kinds and agent tools in plain words, for the catalog diagram and its side panel.

import type { FlowVariant } from '@/components/catalog/FlowCanvas';
import type { IconName } from '@/components/ui/Icon';
import type { BlockKind } from '@/lib/playbooks/types';

export type KindMeta = { label: string; plain: string; icon: IconName; variant: FlowVariant };

export const KIND_META: Record<BlockKind, KindMeta> = {
  deterministic: {
    label: 'Fixed rules',
    plain: 'Code does this the same way every time. No AI and no person is involved.',
    icon: 'flow',
    variant: 'rule',
  },
  agent: {
    label: 'AI agent',
    plain:
      'The AI agent does this, using only the tools listed below. It cites a recorded fact for every claim, and fixed rules check its answer before anyone sees it.',
    icon: 'agent',
    variant: 'agent',
  },
  wait: {
    label: 'Wait',
    plain:
      'The playbook pauses, then looks again. It never sleeps past the next commitment of the order.',
    icon: 'clock',
    variant: 'wait',
  },
  human: {
    label: 'A person decides',
    plain:
      'A person decides here. The playbook stops until the dispatcher approves, edits or rejects the decision card.',
    icon: 'operator',
    variant: 'person',
  },
  execute: {
    label: 'Carry out',
    plain:
      'Does exactly what the person approved: books travel and sends messages. Nothing here runs without that yes.',
    icon: 'check',
    variant: 'execute',
  },
};

export const KIND_ORDER: BlockKind[] = ['deterministic', 'agent', 'wait', 'human', 'execute'];

export const KIND_COUNT_LABEL: Record<BlockKind, [string, string]> = {
  deterministic: ['rule step', 'rule steps'],
  agent: ['AI agent step', 'AI agent steps'],
  wait: ['wait', 'waits'],
  human: ['decision by a person', 'decisions by a person'],
  execute: ['carry-out step', 'carry-out steps'],
};

const TOOL_TEXT: Record<string, string> = {
  get_order_context: 'Read the order: route, car, windows and people',
  list_facts: 'Look up recorded facts',
  search_ferries: 'Search ferry sailings and prices',
  search_trains: 'Search trains',
  search_hotels: 'Search hotels',
  find_roadside: 'Find roadside assistance nearby',
  ask_driver: 'Message the driver and read the reply',
  ask_site: 'Message the pickup or delivery site',
  ask_provider: 'Ask the ferry or travel company (no purchase)',
  record_interpretation: 'Write down its reading of the facts (never counts as proof)',
  get_time: 'Read the current time',
  record_note: 'Leave a note on the run',
};

export function toolText(tool: string): string {
  return TOOL_TEXT[tool] ?? tool.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export const MODEL_TEXT: Record<string, string> = {
  sonnet: 'Claude Sonnet',
  haiku: 'Claude Haiku (fast, for simple steps)',
  opus: 'Claude Opus',
};
