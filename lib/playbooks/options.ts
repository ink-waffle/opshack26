// What an options agent returns (zod → --json-schema) and its deterministic expansion into options the gate checks.

import { z } from 'zod';

import type { ChainOption } from '@/lib/chain/types';
import type { ExpandedAction, OptionTemplate, PlanChange } from '@/lib/playbooks/templates/types';

const OPTION_IDS = ['A', 'B', 'C'] as const;

type OptionId = (typeof OPTION_IDS)[number];

const optionIdSchema = z.enum(OPTION_IDS);

/** One answered option per template: the template literal, its slots and the prose only the agent can write. */
function answeredOptionSchema(template: OptionTemplate) {
  return z.object({
    id: optionIdSchema.describe('A, B or C; unique within the answer.'),
    template: z.literal(template.id),
    slots: template.slots,
    detail: z
      .string()
      .describe('One or two plain sentences a dispatcher reads first: timing, custody, who acts.'),
    factIds: z
      .array(z.string())
      .describe(
        'Fact ids this option rests on besides those in its slots: statements, the provider answer, the promise window.'
      ),
  });
}

/** The options agent's output contract for this closed set of templates. */
export function optionsAnswerSchema(templates: OptionTemplate[]) {
  const [first, ...rest] = templates.map(answeredOptionSchema);
  if (!first) throw new Error('An options agent needs at least one template');
  // z.union renders anyOf (structured output supports it); a discriminated union would render oneOf.
  const option = rest.length ? z.union([first, ...rest]) : first;
  return z.object({
    situation: z
      .string()
      .describe('At most three short lines: what happened, what you did, the decision.'),
    options: z.array(option).min(1).max(3),
    recommendation: z.object({ optionId: optionIdSchema, why: z.string() }),
    agentWillNot: z.array(z.string()).max(5),
  });
}

export type AnsweredOption = {
  id: OptionId;
  template: string;
  slots: unknown;
  detail: string;
  factIds: string[];
};

export type OptionsAnswer = {
  situation: string;
  options: AnsweredOption[];
  recommendation: { optionId: OptionId; why: string };
  agentWillNot: string[];
};

// An answered option built out by its template: what the chain calculator, the gate and the card work from.
export type ExpandedOption = {
  id: string;
  label: string;
  detail: string;
  change: PlanChange;
  actions: (Omit<ExpandedAction, 'slot'> & { id: string; slot?: string })[];
  factIds: string[];
  reversibility: string;
};

/** The option as its template builds it; action ids are the option letter plus the step number (A1, A2…). */
export function expandOption(args: {
  templates: OptionTemplate[];
  option: AnsweredOption;
}): ExpandedOption {
  const { templates, option } = args;
  const template = templates.find((candidate) => candidate.id === option.template);
  if (!template) throw new Error(`Option ${option.id}: template ${option.template} is not offered`);
  const expansion = template.expand(option.slots);
  return {
    id: option.id,
    label: expansion.label,
    detail: option.detail,
    change: expansion.change,
    actions: expansion.actions.map((action, index) => ({
      id: `${option.id}${index + 1}`,
      ...action,
    })),
    factIds: [...new Set([...expansion.factIds, ...option.factIds])],
    reversibility: expansion.reversibility,
  };
}

/** The option's plan change as a chain-calculator input (REPLACE_DRIVER reads the driver id from the cited fact). */
export function toChainOption(
  change: PlanChange,
  facts: { id: string; value: unknown }[] = []
): ChainOption {
  if (change.type === 'NEW_SAILING') return { type: 'NEW_SAILING', factId: change.factId };
  if (change.type === 'REPLACE_DRIVER') {
    const value = facts.find((fact) => fact.id === change.factId)?.value as
      { driverId?: unknown } | null | undefined;
    if (typeof value?.driverId === 'string')
      return { type: 'REPLACE_DRIVER', driverId: value.driverId };
  }
  if (change.type === 'MOVE_PICKUP_SLOT')
    return {
      type: 'MOVE_PICKUP_SLOT',
      startAt: new Date(change.startAt),
      endAt: new Date(change.endAt),
    };
  return { type: 'NO_CHANGE' };
}
