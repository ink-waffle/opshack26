// Server-side view models for the catalog: diagram layout per playbook, plain-language output and wait summaries.

import { z } from 'zod';

import type { FlowEdgeInput, FlowNodeInput } from '@/components/catalog/FlowCanvas';
import { KIND_META } from '@/components/catalog/kinds';
import { layoutGraph } from '@/components/catalog/layout';
import { ACTION_CLASSES, type Authority, authorityOf } from '@/lib/gate/actions';
import type { Amendment } from '@/lib/generated/prisma/client';
import type { OptionTemplate } from '@/lib/playbooks/templates/types';
import type { BlockDefinition, PlaybookDefinition } from '@/lib/playbooks/types';

const NODE_W = 244;
// Characters of a 15px wide-face title per line in a NODE_W box.
const TITLE_CHARS = 22;

const GATE_KEYS = ['quoteBlockMinutes', 'quoteWarnMinutes', 'earlyCustodyHours'];

/** Approved amendments that change this block: its instructions, its wait timings, or the rule check's thresholds. */
export function amendmentsForBlock(args: {
  amendments: Amendment[];
  block: BlockDefinition;
}): Amendment[] {
  const { amendments, block } = args;
  return amendments.filter((amendment) => {
    if (amendment.status !== 'APPROVED') return false;
    if (amendment.kind === 'INSTRUCTION')
      return amendment.blockId === block.id || (!amendment.blockId && block.kind === 'agent');
    const keys = Object.keys((amendment.parameters ?? {}) as Record<string, unknown>);
    return keys.some(
      (key) =>
        key.startsWith(`${block.id}.`) ||
        (block.status === 'OPTIONS_READY' && GATE_KEYS.includes(key)) ||
        (block.kind === 'human' && key === 'decisionMarginMinutes')
    );
  });
}

export function playbookDiagram(args: {
  definition: PlaybookDefinition;
  amendments: Amendment[];
}): { nodes: FlowNodeInput[]; edges: FlowEdgeInput[]; height: number } {
  const { definition, amendments } = args;
  const edges = definition.blocks.flatMap((block) =>
    block.next.map((edge, index) => ({
      id: `${block.id}->${edge.to}:${index}`,
      source: block.id,
      target: edge.to,
      // A lone unconditional edge needs no words.
      label: block.next.length > 1 || edge.when ? edge.label : undefined,
    }))
  );
  const nodeData = new Map(
    definition.blocks.map((block) => {
      const meta = KIND_META[block.kind];
      const count = amendmentsForBlock({ amendments, block }).length;
      const badges = [
        ...(block.id === definition.start
          ? [{ label: 'Start', tone: 'neutral' as const, icon: 'play' as const }]
          : []),
        ...(block.next.length === 0
          ? [
              {
                label: block.status === 'ESCALATED' ? 'Ends: a person takes over' : 'Ends',
                tone: 'neutral' as const,
              },
            ]
          : []),
        ...(count
          ? [
              {
                label: `${count} approved change${count > 1 ? 's' : ''}`,
                tone: 'ok' as const,
                icon: 'spark' as const,
              },
            ]
          : []),
      ];
      const data: FlowNodeInput['data'] = {
        title: block.title,
        kicker:
          block.kind === 'agent'
            ? `${meta.label} · ${block.model === 'haiku' ? 'Haiku' : 'Sonnet'}`
            : meta.label,
        icon: meta.icon,
        variant: block.next.length === 0 ? 'end' : meta.variant,
        badges,
      };
      return [block.id, data];
    })
  );
  // Box height from the content: padding + kicker row + wrapped title + optional badge row.
  const heightOf = (data: FlowNodeInput['data']) =>
    24 +
    24 +
    6 +
    Math.min(3, Math.ceil(data.title.length / TITLE_CHARS)) * 20 +
    (data.badges?.length ? 30 : 0);
  const layout = layoutGraph({
    nodes: definition.blocks.map((block) => ({
      id: block.id,
      width: NODE_W,
      height: heightOf(nodeData.get(block.id) as FlowNodeInput['data']),
    })),
    edges,
    direction: 'TB',
    nodesep: 36,
    ranksep: 30,
  });
  const nodes: FlowNodeInput[] = layout.nodes.map((placed) => ({
    ...placed,
    data: nodeData.get(placed.id) as FlowNodeInput['data'],
  }));
  return { nodes, edges: layout.edges, height: Math.min(1150, layout.height + 24) };
}

const FIELD_TEXT: Record<string, string> = {
  situation: 'What happened and what the decision is, in at most three lines',
  options:
    'Up to three options from its closed list, each with the quotes, candidates and exact messages it filled in',
  recommendation: 'Which option it recommends, and why',
  agentWillNot: 'What it deliberately will not do',
  attempts: 'For each failed booking attempt: whether a booking exists',
  lockReleased: 'Whether purchases may go ahead',
  summary: 'One sentence for the dispatcher',
};

function humanize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase());
}

/** What a block hands to the next steps, in plain words (never the schema itself). */
export function outputSummary(block: BlockDefinition): string[] {
  if (block.outputSchema) {
    const schema = z.toJSONSchema(block.outputSchema) as {
      properties?: Record<string, { description?: string }>;
    };
    return Object.entries(schema.properties ?? {}).map(
      ([key, value]) => FIELD_TEXT[key] ?? value.description ?? humanize(key)
    );
  }
  if (block.status === 'OPTIONS_READY')
    return [
      'Each option with its effect on the delivery promise, the driver’s chain, its cost and who must agree',
      'Any rule an option still breaks, which blocks that option',
    ];
  if (block.kind === 'human')
    return [
      'The dispatcher’s decision (approve, edit or reject), their note, and the chosen option with any edits',
    ];
  if (block.kind === 'wait') return ['When it woke up, how long it waited and why'];
  if (block.kind === 'execute')
    return ['Every booking made and message sent, each recorded as a fact with its reference'];
  if (block.next.length === 0) return ['A closing record of the run'];
  return ['What it found, for the next steps; nothing is changed in Bahn’s records'];
}

/** "Waits up to 120 min, but never past the next commitment minus 30 min." with amended values. */
export function waitPolicy(args: {
  block: BlockDefinition;
  params: Record<string, unknown>;
}): { text: string; changed: boolean } | null {
  const { block, params } = args;
  if (!block.wait) return null;
  const read = (key: string, fallback: number) => {
    const value = params[`${block.id}.${key}`];
    return typeof value === 'number' ? value : fallback;
  };
  const defaultMinutes = read('defaultMinutes', block.wait.defaultMinutes);
  const bufferMinutes = read('bufferMinutes', block.wait.bufferMinutes);
  return {
    text: `Waits up to ${defaultMinutes} min, but never past the next commitment minus ${bufferMinutes} min. The next commitment is the driver’s booked departure, a check-in cutoff or the edge of a selected time window, whichever comes first.`,
    changed:
      defaultMinutes !== block.wait.defaultMinutes || bufferMinutes !== block.wait.bufferMinutes,
  };
}

const WHO_AGREES: Record<Authority, string> = {
  AUTO: 'no approval needed',
  AUTO_NOTIFY: 'no approval needed; you are told',
  YES: 'your yes on the card',
  EVIDENCE_THEN_YES: 'evidence on file, then your yes',
  HUMAN_ONLY: 'a person’s yes, always (money)',
  BLOCKED: 'never allowed',
};

/** A template's steps in plain words: what happens and who must agree. */
export function templateSteps(template: OptionTemplate): { title: string; agrees: string }[] {
  return template.steps.map((step) => ({
    title: step.title,
    agrees: `${ACTION_CLASSES[step.actionClass].label}: ${WHO_AGREES[authorityOf(step.actionClass)]}`,
  }));
}
