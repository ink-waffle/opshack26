// Serializable view of a playbook for the catalog UI: graph, plain-language texts, rules, instructions, amendments.

import type { Amendment } from '@/lib/generated/prisma/client';
import { loadApprovedAmendments } from '@/lib/playbooks/amendments';
import { readPlaybookFile, readSharedRules } from '@/lib/playbooks/prompt';
import { getPlaybook, listPlaybooks } from '@/lib/playbooks/registry';
import type { BlockKind, PlaybookDefinition } from '@/lib/playbooks/types';

export type CatalogBlock = {
  id: string;
  kind: BlockKind;
  title: string;
  description: string;
  instructionsPath: string | null;
  // Markdown of instructions/<block>.md (agent blocks).
  instructions: string | null;
  tools: string[];
  model: string | null;
  wait: { defaultMinutes: number; bufferMinutes: number } | null;
  next: { to: string; label: string; conditional: boolean }[];
  amendments: Amendment[];
};

export type CatalogPlaybook = {
  id: string;
  title: string;
  summary: string;
  triggers: string[];
  start: string;
  params: { key: string; default: unknown; description: string }[];
  preconditions: { id: string; description: string }[];
  rules: string;
  sharedRules: string;
  blocks: CatalogBlock[];
  // Approved amendments for the whole playbook (blockId null).
  amendments: Amendment[];
};

async function describe(definition: PlaybookDefinition): Promise<CatalogPlaybook> {
  const [rules, sharedRules, amendments] = await Promise.all([
    readPlaybookFile({ definition, file: 'rules.md' }).catch(() => ''),
    readSharedRules().catch(() => ''),
    loadApprovedAmendments({ playbookId: definition.id }),
  ]);
  const blocks = await Promise.all(
    definition.blocks.map(async (block) => ({
      id: block.id,
      kind: block.kind,
      title: block.title,
      description: block.description,
      instructionsPath: block.instructions ?? null,
      instructions: block.instructions
        ? await readPlaybookFile({ definition, file: block.instructions }).catch(() => null)
        : null,
      tools: block.tools ?? [],
      model: block.kind === 'agent' ? (block.model ?? 'sonnet') : null,
      wait: block.wait ?? null,
      next: block.next.map((edge) => ({
        to: edge.to,
        label: edge.label,
        conditional: !!edge.when,
      })),
      amendments: amendments.filter((amendment) => amendment.blockId === block.id),
    }))
  );
  return {
    id: definition.id,
    title: definition.title,
    summary: definition.summary,
    triggers: definition.triggers,
    start: definition.start,
    params: Object.entries(definition.params ?? {}).map(([key, param]) => ({
      key,
      default: param.default,
      description: param.description,
    })),
    preconditions: definition.preconditions.map(({ id, description }) => ({ id, description })),
    rules,
    sharedRules,
    blocks,
    amendments: amendments.filter((amendment) => !amendment.blockId),
  };
}

export async function getPlaybookCatalog(id: string): Promise<CatalogPlaybook | null> {
  const definition = getPlaybook(id);
  return definition ? describe(definition) : null;
}

export async function listPlaybookCatalog(): Promise<CatalogPlaybook[]> {
  return Promise.all(listPlaybooks().map(describe));
}
