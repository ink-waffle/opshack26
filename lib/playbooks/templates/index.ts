// Defining option templates and rendering them for the agent prompt (the single source of the option list).

import type { z } from 'zod';

import type { OptionTemplate, TemplateSpec } from '@/lib/playbooks/templates/types';

/** A template with its slot types erased: `expand` parses the slots and builds label, change and ordered actions. */
export function defineTemplate<S extends z.ZodObject>(spec: TemplateSpec<S>): OptionTemplate {
  const { id, title, description, when, slots, steps, label, change, reversibility } = spec;
  return {
    id,
    title,
    description,
    when,
    slots,
    steps: steps.map((step) => ({ actionClass: step.actionClass, title: step.title })),
    expand: (raw) => {
      const filled = slots.parse(raw);
      const actions = steps.flatMap((step) =>
        step.build(filled).map((action) => ({
          actionClass: step.actionClass,
          description: step.title,
          quoteFactId: action.quoteFactId ?? null,
          message: action.message ?? null,
          target: action.target ?? null,
          replaces: action.replaces ?? [],
          slot: action.slot,
        }))
      );
      const planned = change(filled);
      return {
        label: label?.(filled) ?? title,
        change: planned,
        actions,
        factIds: [
          ...new Set([
            ...actions.flatMap((action) => (action.quoteFactId ? [action.quoteFactId] : [])),
            ...('factId' in planned ? [planned.factId] : []),
          ]),
        ],
        reversibility,
      };
    },
  };
}

/** Slot names with their descriptions, from the zod schema. */
function slotLines(template: OptionTemplate): string[] {
  return Object.entries(template.slots.shape).map(([key, schema]) =>
    `\`${key}\`: ${(schema as z.ZodType).description ?? ''}`.trim()
  );
}

/** The closed option list as prompt markdown, rendered from the templates themselves. */
export function renderTemplatesForAgents(templates: OptionTemplate[]): string {
  return [
    '## Option templates (closed list)',
    '',
    'Every option you offer is one of these templates: name it in `template`, fill its `slots`, write `detail` and cite the facts it rests on. Code builds the label, the plan change and the steps after a yes, in this order, from your slots; you cannot add, drop or reorder steps. Offer at most three options, lettered A, B and C; one template may serve two options (e.g. two sailings).',
    ...templates.flatMap((template) => [
      '',
      `### \`${template.id}\`: ${template.title}`,
      '',
      template.description,
      '',
      `When: ${template.when}`,
      '',
      'Steps after a yes:',
      ...template.steps.map((step, index) => `${index + 1}. ${step.actionClass}: ${step.title}`),
      '',
      'Slots:',
      ...slotLines(template).map((line) => `- ${line}`),
    ]),
  ].join('\n');
}
