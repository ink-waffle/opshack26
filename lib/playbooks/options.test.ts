import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { outputJsonSchema } from '@/lib/playbooks/blocks/agent';
import { itineraryChangeSet } from '@/lib/playbooks/itinerary';
import {
  type AnsweredOption,
  expandOption,
  optionsAnswerSchema,
  toChainOption,
} from '@/lib/playbooks/options';
import { defineTemplate } from '@/lib/playbooks/templates';
import { BACKUP_OFFER } from '@/lib/playbooks/templates/shared';
import { MISSED_CONNECTION_TEMPLATES } from '@/playbooks/missed-connection/templates';

const KEEP = defineTemplate({
  id: 'KEEP',
  title: 'Keep the plan',
  description: 'Nothing changes.',
  when: 'Always.',
  slots: z.object({ driverMessage: z.string().describe('Exact text to the driver.') }),
  steps: [
    {
      actionClass: 'ASK_DRIVER',
      title: 'Ask the driver',
      build: (slots) => [{ message: slots.driverMessage, slot: 'driverMessage' }],
    },
  ],
  change: () => ({ type: 'NO_CHANGE' }),
  reversibility: 'Nothing is committed.',
});

const answer = (options: unknown[]): unknown => ({
  situation: 'The driver is unsure.',
  options,
  recommendation: { optionId: 'A', why: 'Fastest.' },
  agentWillNot: [],
});

const backupSlots = {
  candidateFactId: 'f_backup',
  offerMessage: 'Pickup in Turku 14:00 EEST, delivery Helsinki tomorrow.',
  currentDriverMessage: 'Your assignment stays active; please call us.',
};
const backup: AnsweredOption = {
  id: 'B',
  template: 'BACKUP_OFFER',
  slots: backupSlots,
  detail: 'A backup gets a directed offer.',
  factIds: ['f_statement'],
};

describe('the options answer is a union over the playbook templates', () => {
  const schema = optionsAnswerSchema([KEEP, BACKUP_OFFER]);

  it('accepts each template with its own slots', () => {
    const keep = {
      id: 'A',
      template: 'KEEP',
      slots: { driverMessage: 'Can you still do it?' },
      detail: 'Wait for the driver.',
      factIds: [],
    };
    expect(schema.safeParse(answer([keep, backup])).success).toBe(true);
  });

  it('refuses a template outside the closed list, slots of another template and missing slots', () => {
    const base = { id: 'A', detail: 'x', factIds: [] };
    expect(
      schema.safeParse(answer([{ ...base, template: 'CANCEL_DRIVER', slots: {} }])).success
    ).toBe(false);
    expect(
      schema.safeParse(answer([{ ...base, template: 'KEEP', slots: backupSlots }])).success
    ).toBe(false);
    expect(
      schema.safeParse(
        answer([{ ...base, template: 'BACKUP_OFFER', slots: { candidateFactId: 'f' } }])
      ).success
    ).toBe(false);
  });

  it('renders anyOf with a constant template per branch for --json-schema', () => {
    const json = JSON.stringify(outputJsonSchema(schema));
    expect(json).toContain('"anyOf"');
    expect(json).not.toContain('"oneOf"');
    expect(json).toContain('"const":"BACKUP_OFFER"');
  });
});

describe('an answered option expands deterministically', () => {
  it('builds the shared backup offer: ordered steps, ids, change and facts', () => {
    const option = expandOption({ templates: [KEEP, BACKUP_OFFER], option: backup });
    expect(option.label).toBe('Directed offer to a backup driver');
    expect(option.actions.map((action) => [action.id, action.actionClass, action.slot])).toEqual([
      ['B1', 'MARKET', 'candidateFactId and offerMessage'],
      ['B2', 'ASK_DRIVER', 'currentDriverMessage'],
    ]);
    expect(option.actions[0]).toMatchObject({
      quoteFactId: 'f_backup',
      message: backupSlots.offerMessage,
    });
    expect(option.change).toEqual({ type: 'REPLACE_DRIVER', factId: 'f_backup' });
    expect(option.factIds).toEqual(['f_backup', 'f_statement']);
  });

  it('turns list slots into ordered bookings, cancellations and the message, and derives the change set', () => {
    const option = expandOption({
      templates: MISSED_CONNECTION_TEMPLATES,
      option: {
        id: 'A',
        template: 'REBOOK_REST_OF_TRIP',
        slots: {
          newSailing: { quoteFactId: 'f_ferry', replaces: ['res-ferry'] },
          bookings: [
            { quoteFactId: 'f_train', replaces: ['res-train'] },
            { quoteFactId: 'f_hotel', replaces: [] },
          ],
          cancellations: ['res-hotel-tallinn'],
          driverMessage: 'Your plan: train Sat 09:00, ferry Sun 14:00 CEST.',
        },
        detail: 'Arrives Sunday.',
        factIds: [],
      },
    });
    expect(
      option.actions.map(
        (action) =>
          `${action.id} ${action.actionClass} ${action.quoteFactId ?? action.target ?? action.message}`
      )
    ).toEqual([
      'A1 BOOK_TRAVEL f_ferry',
      'A2 BOOK_TRAVEL f_train',
      'A3 BOOK_TRAVEL f_hotel',
      'A4 CANCEL_TRAVEL res-hotel-tallinn',
      'A5 INSTRUCT_CHANGE Your plan: train Sat 09:00, ferry Sun 14:00 CEST.',
    ]);
    expect(option.actions[3].slot).toBe('cancellations.0');
    expect(option.label).toBe(
      'Rebook the rest of the trip: new sailing, 2 bookings, 1 cancellation'
    );
    expect(option.change).toEqual({ type: 'NEW_SAILING', factId: 'f_ferry' });
    expect(option.factIds).toEqual(['f_ferry', 'f_train', 'f_hotel']);
    expect(itineraryChangeSet(option.actions)).toEqual({
      add: [
        { source: 'fact', factId: 'f_ferry', replaces: ['res-ferry'] },
        { source: 'fact', factId: 'f_train', replaces: ['res-train'] },
        { source: 'fact', factId: 'f_hotel', replaces: [] },
      ],
      cancel: ['res-hotel-tallinn'],
    });
  });

  it('keeps the booked crossing when no new sailing is given', () => {
    const option = expandOption({
      templates: MISSED_CONNECTION_TEMPLATES,
      option: {
        id: 'B',
        template: 'REBOOK_REST_OF_TRIP',
        slots: {
          newSailing: null,
          bookings: [{ quoteFactId: 'f_train', replaces: [] }],
          cancellations: [],
          driverMessage: 'Your plan: train Sat 09:00.',
        },
        detail: 'Same ferry.',
        factIds: [],
      },
    });
    expect(option.change).toEqual({ type: 'NO_CHANGE' });
    expect(option.label).toBe('Rebook the rest of the trip: 1 booking');
    expect(itineraryChangeSet(option.actions)).toEqual({
      add: [{ source: 'fact', factId: 'f_train', replaces: [] }],
      cancel: [],
    });
  });

  it('refuses slots that do not fit the template', () => {
    expect(() =>
      expandOption({
        templates: [KEEP],
        option: { id: 'A', template: 'KEEP', slots: {}, detail: '', factIds: [] },
      })
    ).toThrow();
    expect(() =>
      expandOption({
        templates: [KEEP],
        option: { id: 'A', template: 'OTHER', slots: {}, detail: '', factIds: [] },
      })
    ).toThrow(/not offered/);
  });
});

describe('the plan change feeds the chain calculator', () => {
  it('reads the backup driver from the cited fact and parses slot times', () => {
    expect(
      toChainOption({ type: 'REPLACE_DRIVER', factId: 'f_b' }, [
        { id: 'f_b', value: { driverId: 'drv-9' } },
      ])
    ).toEqual({ type: 'REPLACE_DRIVER', driverId: 'drv-9' });
    expect(toChainOption({ type: 'REPLACE_DRIVER', factId: 'f_missing' })).toEqual({
      type: 'NO_CHANGE',
    });
    expect(
      toChainOption({
        type: 'MOVE_PICKUP_SLOT',
        startAt: '2026-10-24T12:00:00Z',
        endAt: '2026-10-24T14:00:00Z',
      })
    ).toMatchObject({ type: 'MOVE_PICKUP_SLOT', startAt: new Date('2026-10-24T12:00:00Z') });
  });
});
