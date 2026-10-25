import { describe, expect, it } from 'vitest';

import { expandOption } from '@/lib/playbooks/options';
import { listPlaybooks } from '@/lib/playbooks/registry';
import { renderTemplatesForAgents } from '@/lib/playbooks/templates';
import type { OptionTemplate } from '@/lib/playbooks/templates/types';
import type { PlaybookDefinition } from '@/lib/playbooks/types';

const optionsBlock = (definition: PlaybookDefinition) =>
  definition.blocks.find((block) => block.templates?.length);

const BOOKING = { quoteFactId: 'f_1', replaces: ['res-1'] };

/** A fill for every slot of a template: messages and ids are strings, lists hold one item, nullable slots stay empty. */
function sampleSlots(template: OptionTemplate): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(template.slots.shape).map(([key, schema]) => {
      if (schema.safeParse(null).success) return [key, null];
      if (schema.safeParse(['f_1']).success) return [key, ['f_1']];
      if (schema.safeParse([BOOKING]).success) return [key, [BOOKING]];
      if (/At$/.test(key)) return [key, '2026-10-24T12:00:00Z'];
      return [key, `${key} text`];
    })
  );
}

const EXPECTED: Record<string, string[]> = {
  'missed-connection': [
    'KEEP_EXISTING_BOOKING',
    'REBOOK_REST_OF_TRIP',
    'REBOOK_ASK_EARLY_DELIVERY',
  ],
  'vehicle-warning': ['OWNER_ROADSIDE', 'BAHN_TOW', 'WAIT_FOR_OWNER'],
  'driver-unavailable': ['KEEP_DRIVER', 'BACKUP_OFFER', 'LATER_PICKUP_SLOT'],
  'pickup-unconfirmed': ['WAIT_UNTIL', 'SITE_HOLD', 'BACKUP_OFFER'],
};

describe.each(listPlaybooks().map((definition) => [definition.id, definition] as const))(
  '%s offers a closed set of option templates',
  (id, definition) => {
    const block = optionsBlock(definition);
    const templates = block?.templates ?? [];

    it('has the expected templates on its options agent', () => {
      expect(block?.kind).toBe('agent');
      expect(templates.map((template) => template.id)).toEqual(EXPECTED[id]);
    });

    it.each(EXPECTED[id].map((templateId) => [templateId]))(
      '%s fits the output schema and expands into gated steps',
      (templateId) => {
        const template = templates.find((candidate) => candidate.id === templateId)!;
        const answered = {
          id: 'A' as const,
          template: templateId,
          slots: sampleSlots(template),
          detail: 'One plain sentence.',
          factIds: [],
        };
        const parsed = block?.outputSchema?.safeParse({
          situation: 'What happened.',
          options: [answered],
          recommendation: { optionId: 'A', why: 'Because.' },
          agentWillNot: [],
          ...(id === 'vehicle-warning' ? { callNotes: ['The car stopped.', 'Driver safe.'] } : {}),
          ...(id === 'missed-connection' ? { driverAt: null } : {}),
        });
        expect(parsed?.success).toBe(true);
        const option = expandOption({ templates, option: answered });
        expect(option.actions.length).toBeGreaterThan(0);
        expect(option.actions.map((action) => action.id)).toEqual(
          option.actions.map((_, index) => `A${index + 1}`)
        );
        expect(
          option.actions.every((action) =>
            template.steps.some((step) => step.actionClass === action.actionClass)
          )
        ).toBe(true);
      }
    );

    it('renders every template, step and slot into the agent prompt', () => {
      const prompt = renderTemplatesForAgents(templates);
      for (const template of templates) {
        expect(prompt).toContain(`\`${template.id}\`: ${template.title}`);
        for (const step of template.steps) expect(prompt).toContain(step.title);
        for (const slot of Object.keys(template.slots.shape))
          expect(prompt).toContain(`\`${slot}\``);
      }
    });
  }
);
