// What the dispatcher can approve before the next deadline: wait until a set time, a site hold, or a backup offer.

import { z } from 'zod';

import { defineTemplate } from '@/lib/playbooks/templates';
import { BACKUP_OFFER } from '@/lib/playbooks/templates/shared';

export const WAIT_UNTIL = defineTemplate({
  id: 'WAIT_UNTIL',
  title: 'Keep waiting until a set time',
  description:
    'Give the driver until a set time before the next deadline to answer, and optionally ask the site to tell us the moment the driver arrives or the car leaves.',
  when: 'There is still time before the next deadline and the driver may simply be late or busy.',
  slots: z.object({
    driverMessage: z
      .string()
      .describe(
        'Exact text to the driver: we need an answer by a set time before the deadline (local time), and what happens if not.'
      ),
    siteMessage: z
      .string()
      .nullable()
      .describe(
        'Exact text to the site asking them to tell us the moment the driver arrives or the car leaves; null if not useful.'
      ),
  }),
  steps: [
    {
      actionClass: 'ASK_DRIVER',
      title: 'Ask the driver for an answer by the set time',
      build: (slots) => [{ message: slots.driverMessage, slot: 'driverMessage' }],
    },
    {
      actionClass: 'ASK_SITE',
      title: 'Ask the site to report when the driver arrives or the car leaves',
      build: (slots) =>
        slots.siteMessage ? [{ message: slots.siteMessage, slot: 'siteMessage' }] : [],
    },
  ],
  change: () => ({ type: 'NO_CHANGE' }),
  reversibility: 'Nothing is committed; only questions are sent.',
});

export const SITE_HOLD = defineTemplate({
  id: 'SITE_HOLD',
  title: 'Have the site check and hold the car',
  description:
    'Ask the site whether the car is still there and whether anyone collected it, and to keep it until our driver or a named replacement arrives.',
  when: 'The site has not answered yet or the car’s whereabouts are unclear.',
  slots: z.object({
    siteMessage: z
      .string()
      .describe(
        'Exact text to the site: is the car still there, has anyone collected it, please keep it until our driver or a named replacement arrives.'
      ),
  }),
  steps: [
    {
      actionClass: 'ASK_SITE',
      title: 'Ask the site to check and hold the car',
      build: (slots) => [{ message: slots.siteMessage, slot: 'siteMessage' }],
    },
  ],
  change: () => ({ type: 'NO_CHANGE' }),
  reversibility: 'Nothing is committed; only the question is sent.',
});

export const PICKUP_UNCONFIRMED_TEMPLATES = [WAIT_UNTIL, SITE_HOLD, BACKUP_OFFER];
