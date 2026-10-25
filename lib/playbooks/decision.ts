// Decision payload contract for card waitpoint tokens (pure: safe for UI and server actions).

import { z } from 'zod';

import type { CardOption, DecisionPayload } from '@/lib/playbooks/types';

export const decisionPayloadSchema = z.object({
  action: z.enum(['approve', 'edit', 'reject']),
  optionId: z.string().optional(),
  edits: z
    .object({
      messages: z.record(z.string(), z.string()).optional(),
      removeActionIds: z.array(z.string()).optional(),
    })
    .strict()
    .optional(),
  note: z.string().optional(),
  decidedBy: z.string().min(1),
}) satisfies z.ZodType<DecisionPayload>;

/** Parses a token output; also accepts the spike's `{ decision: 'approve' }` shorthand. */
export function parseDecision(output: unknown): DecisionPayload {
  const parsed = decisionPayloadSchema.safeParse(output);
  if (parsed.success) return parsed.data;
  const legacy = output as { decision?: string; optionId?: string; note?: string } | null;
  if (legacy?.decision && ['approve', 'edit', 'reject'].includes(legacy.decision))
    return {
      action: legacy.decision as DecisionPayload['action'],
      optionId: legacy.optionId,
      note: legacy.note,
      decidedBy: 'unknown',
    };
  throw new Error(`Invalid decision payload: ${parsed.error.message}`);
}

export const CARD_STATUS_BY_ACTION = {
  approve: 'APPROVED',
  edit: 'EDITED',
  reject: 'REJECTED',
} as const;

/** The option the decision chose (null on reject or an unknown option; never a silent fallback). */
export function chosenOption(args: {
  options: CardOption[];
  decision: DecisionPayload;
  recommendedId?: string | null;
}): CardOption | null {
  const { options, decision, recommendedId } = args;
  if (decision.action === 'reject') return null;
  const optionId = decision.optionId ?? recommendedId ?? null;
  return options.find((candidate) => candidate.id === optionId) ?? null;
}

/** The option with the operator's reworded messages and skipped steps applied. */
export function applyEdits(args: { option: CardOption; decision: DecisionPayload }): CardOption {
  const { option, decision } = args;
  const removed = new Set(decision.edits?.removeActionIds ?? []);
  const messages = decision.edits?.messages ?? {};
  return {
    ...option,
    actions: option.actions
      .filter((action) => !removed.has(action.id))
      .map((action) =>
        messages[action.id] ? { ...action, message: messages[action.id] } : action
      ),
  };
}

export function isBlockedOption(option: Pick<CardOption, 'gate' | 'blocked'>): boolean {
  return Boolean(option.blocked) || option.gate?.ok === false || !!option.gate?.violations?.length;
}

/** Ids of the steps the gate's violations point at; null when a violation concerns the whole option. */
export function blockedActionIds(args: {
  option: Pick<CardOption, 'gate' | 'blocked' | 'actions'>;
  // Steps an edit already dropped from `option.actions` still count as known ids.
  removedIds?: string[];
}): string[] | null {
  const { option, removedIds = [] } = args;
  const known = new Set([...option.actions.map((action) => action.id), ...removedIds]);
  const violations = [
    ...(option.gate?.violations ?? []),
    ...(option.blocked ? [option.blocked] : []),
  ];
  const ids = new Set<string>();
  for (const violation of violations) {
    const id = violation.message.split(':')[0]?.trim();
    if (!id || !known.has(id)) return null;
    ids.add(id);
  }
  return [...ids];
}

/** Why a blocked option may not be approved as edited (null = the edit drops every blocked step). */
export function blockedProblem(args: {
  option: Pick<CardOption, 'id' | 'gate' | 'blocked' | 'actions'>;
  removeActionIds?: string[];
}): string | null {
  const { option, removeActionIds = [] } = args;
  if (!isBlockedOption(option)) return null;
  const first = option.blocked ?? option.gate?.violations?.[0] ?? null;
  const rule = first ? `${first.ruleId}: ${first.message}` : 'a guardrail';
  const ids = blockedActionIds({ option, removedIds: removeActionIds });
  if (ids === null)
    return `Option ${option.id} is blocked as a whole (${rule}), so it cannot be approved.`;
  const missing = ids.filter((id) => !removeActionIds.includes(id));
  if (!missing.length) return null;
  return `Option ${option.id} is blocked (${rule}). Skip step ${missing.join(', ')}, or reject the card.`;
}

/** Why an edit cannot be carried out as sent (null = it can): it must reword or skip steps of the offered option and leave one to run. */
export function editProblem(args: {
  option: Pick<CardOption, 'id' | 'actions'>;
  edits: DecisionPayload['edits'];
}): string | null {
  const { option, edits } = args;
  const messages = Object.keys(edits?.messages ?? {});
  const removed = edits?.removeActionIds ?? [];
  if (!messages.length && !removed.length)
    return `An edit must reword a message or skip a step of option ${option.id}. To take it as it is, approve it; for anything else, reject the card with a note.`;
  const byId = new Map(option.actions.map((action) => [action.id, action]));
  const unknown = [...messages, ...removed].find((id) => !byId.has(id));
  if (unknown) return `Step ${unknown} is not part of option ${option.id}.`;
  const silent = messages.find((id) => byId.get(id)?.message == null);
  if (silent) return `Step ${silent} sends no message, so there is no text to reword.`;
  const both = messages.find((id) => removed.includes(id));
  if (both) return `Step ${both} is both reworded and skipped; choose one.`;
  if (option.actions.every((action) => removed.includes(action.id)))
    return `Skipping every step of option ${option.id} leaves nothing to carry out; reject the card instead.`;
  return null;
}

/** Why this decision must not be carried out (null = carry it out); the server and the execute block both ask, on the option as offered. */
export function approvalProblem(args: {
  option: Pick<CardOption, 'id' | 'gate' | 'blocked' | 'actions'>;
  decision: DecisionPayload;
}): string | null {
  const { option, decision } = args;
  if (decision.action === 'reject') return null;
  if (decision.action === 'edit') {
    const edit = editProblem({ option, edits: decision.edits });
    if (edit) return edit;
  }
  return blockedProblem({ option, removeActionIds: decision.edits?.removeActionIds });
}
