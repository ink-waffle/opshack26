// The dispatcher's choices before the first paid leg: keep the driver, a backup offer, or a later pickup slot.

import { z } from 'zod';

import { defineTemplate } from '@/lib/playbooks/templates';
import { BACKUP_OFFER } from '@/lib/playbooks/templates/shared';

export const KEEP_DRIVER = defineTemplate({
  id: 'KEEP_DRIVER',
  title: 'Keep the driver; ask for a final yes or no',
  description:
    'Nothing changes: the driver is asked once more for a clear yes or no by the answer-by time, and told that otherwise the job is offered to a backup while their assignment stays until then.',
  when: 'The driver might still confirm in time.',
  slots: z.object({
    driverMessage: z
      .string()
      .describe(
        'Exact text to the driver: a final yes or no by the answer-by time (local time), and what happens if they cannot (we offer the job to a backup; their assignment stays until then). No pressure, no health advice.'
      ),
  }),
  steps: [
    {
      actionClass: 'ASK_DRIVER',
      title: 'Ask the driver for a final yes or no by the answer-by time',
      build: (slots) => [{ message: slots.driverMessage, slot: 'driverMessage' }],
    },
  ],
  change: () => ({ type: 'NO_CHANGE' }),
  reversibility: 'Nothing is committed; only the question is sent.',
});

export const LATER_PICKUP_SLOT = defineTemplate({
  id: 'LATER_PICKUP_SLOT',
  title: 'Move the pickup to the later slot',
  description:
    'Ask the customer whether the car can be collected later the same day (the slot the backups step found inside the pickup availability), and ask the driver whether that slot works for them. The delivery window stays as agreed.',
  when: 'Only if `backups.afternoonSlot` exists; best when it still keeps the delivery promise.',
  slots: z.object({
    startAt: z.string().describe('ISO start of `backups.afternoonSlot`, copied exactly.'),
    endAt: z.string().describe('ISO end of `backups.afternoonSlot`, copied exactly.'),
    customerMessage: z
      .string()
      .describe(
        "Exact draft to the customer: can the car be collected in that window instead (local time); the delivery window stays as agreed; no reason about the driver's health."
      ),
    driverMessage: z
      .string()
      .describe('Exact text to the driver: does the later slot (local time) work for you?'),
  }),
  steps: [
    {
      actionClass: 'CUSTOMER_MESSAGE',
      title: 'Ask the customer whether the later pickup slot suits them',
      build: (slots) => [{ message: slots.customerMessage, slot: 'customerMessage' }],
    },
    {
      actionClass: 'ASK_DRIVER',
      title: 'Ask the driver whether the later slot works for them',
      build: (slots) => [{ message: slots.driverMessage, slot: 'driverMessage' }],
    },
  ],
  change: (slots) => ({ type: 'MOVE_PICKUP_SLOT', startAt: slots.startAt, endAt: slots.endAt }),
  reversibility: 'Only questions are sent; the slot moves once the customer agrees.',
});

export const DRIVER_UNAVAILABLE_TEMPLATES = [KEEP_DRIVER, BACKUP_OFFER, LATER_PICKUP_SLOT];
