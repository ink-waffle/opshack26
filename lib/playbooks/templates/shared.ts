// Option templates more than one playbook offers.

import { z } from 'zod';

import { defineTemplate } from '@/lib/playbooks/templates';

export const BACKUP_OFFER = defineTemplate({
  id: 'BACKUP_OFFER',
  title: 'Directed offer to a backup driver',
  description:
    'Offer the job to one free backup driver. The current driver stays assigned, and nothing is cancelled, until the backup accepts; reassigning and cancelling travel stay with a person after that (G7).',
  when: 'The current driver may not do the job and a backup candidate (a fact from find_backup_drivers or the backups step) can reach the pickup before the deadline.',
  slots: z.object({
    candidateFactId: z
      .string()
      .describe('The backup-driver fact id of the candidate you pick (closest, likely to accept).'),
    offerMessage: z
      .string()
      .describe(
        'Exact offer text to the backup: pickup place, slot in local time, destination and delivery window; no customer names, no other jobs. Never "booked", "assigned" or "confirmed".'
      ),
    currentDriverMessage: z
      .string()
      .describe(
        'Exact text to the current driver: their assignment stays active until a backup accepts; ask them to hold off travelling and call in.'
      ),
  }),
  steps: [
    {
      actionClass: 'MARKET',
      title: 'Send the directed offer to the backup driver',
      build: (slots) => [
        {
          quoteFactId: slots.candidateFactId,
          message: slots.offerMessage,
          slot: 'candidateFactId and offerMessage',
        },
      ],
    },
    {
      actionClass: 'ASK_DRIVER',
      title: 'Tell the current driver their assignment stays active and ask them to call in',
      build: (slots) => [{ message: slots.currentDriverMessage, slot: 'currentDriverMessage' }],
    },
  ],
  change: (slots) => ({ type: 'REPLACE_DRIVER', factId: slots.candidateFactId }),
  reversibility: 'The offer can be withdrawn until the backup accepts; nothing is cancelled.',
});
