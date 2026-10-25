// Trip repair options: keep a booking that still holds, or rebook the rest of the trip (driver keeps the car, or the customer is asked).

import { z } from 'zod';

import { defineTemplate } from '@/lib/playbooks/templates';

const replaces = z
  .array(z.string())
  .describe(
    'Booked legs this booking takes over: their `ref` (or `factId`) from gather.mustAddress or gather.baseline.legs; empty if none.'
  );
const newSailing = z
  .object({
    quoteFactId: z
      .string()
      .describe('The FERRY_QUOTE fact id of the new sailing, from your own search_ferries call.'),
    replaces,
  })
  .nullable()
  .describe(
    'The new sailing when the booked crossing is lost or none is booked; null when it still works.'
  );
const bookings = z
  .array(
    z.object({
      quoteFactId: z
        .string()
        .describe(
          'A train or hotel quote fact id from your own search_trains or search_hotels call.'
        ),
      replaces,
    })
  )
  .max(6)
  .describe(
    'Every other new booking, in trip order: trains (positioning, return home) and hotel nights (one quote per stay). Empty if none.'
  );
const cancellations = z
  .array(z.string())
  .max(6)
  .describe(
    'Booked legs the new plan no longer uses, by `ref` (or `factId`) from gather.mustAddress or gather.baseline.legs: a hotel the driver can no longer reach, a ticket a new booking replaces. They are cancelled only after every booking succeeded. Empty if none.'
  );
const driverMessage = z
  .string()
  .describe(
    'Exact plan text to the driver, written as a plan ("Your plan: …", never "is booked"): every new leg and what is cancelled, with local times and the check-in cutoff. The booking and cancellation references are appended after the steps succeed.'
  );

type Booking = { quoteFactId: string; replaces: string[] };
type RebookSlots = { newSailing: Booking | null; bookings: Booking[]; cancellations: string[] };

const bookSailing = {
  actionClass: 'BOOK_TRAVEL',
  title: 'Book the new sailing',
  build: (slots: RebookSlots) =>
    slots.newSailing
      ? [
          {
            quoteFactId: slots.newSailing.quoteFactId,
            replaces: slots.newSailing.replaces,
            slot: 'newSailing.quoteFactId',
          },
        ]
      : [],
} as const;
const bookOthers = {
  actionClass: 'BOOK_TRAVEL',
  title: 'Book the new train or hotel (one per quote)',
  build: (slots: RebookSlots) =>
    slots.bookings.map((booking, index) => ({
      quoteFactId: booking.quoteFactId,
      replaces: booking.replaces,
      slot: `bookings.${index}.quoteFactId`,
    })),
} as const;
const cancelLegs = {
  actionClass: 'CANCEL_TRAVEL',
  title: 'Cancel a booked leg the new plan no longer uses (only after every booking succeeded)',
  build: (slots: RebookSlots) =>
    slots.cancellations.map((target, index) => ({ target, slot: `cancellations.${index}` })),
} as const;
const tellDriver = {
  actionClass: 'INSTRUCT_CHANGE',
  title: 'Send the driver the new plan with the references',
  build: (slots: { driverMessage: string }) => [
    { message: slots.driverMessage, slot: 'driverMessage' },
  ],
} as const;

function rebookLabel(args: { title: string; slots: RebookSlots }): string {
  const { title, slots } = args;
  const count = (n: number, word: string) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : null);
  const parts = [
    slots.newSailing ? 'new sailing' : null,
    count(slots.bookings.length, 'booking'),
    count(slots.cancellations.length, 'cancellation'),
  ].filter(Boolean);
  return parts.length ? `${title}: ${parts.join(', ')}` : title;
}

const change = (slots: RebookSlots) =>
  slots.newSailing
    ? ({ type: 'NEW_SAILING', factId: slots.newSailing.quoteFactId } as const)
    : ({ type: 'NO_CHANGE' } as const);

export const KEEP_EXISTING_BOOKING = defineTemplate({
  id: 'KEEP_EXISTING_BOOKING',
  title: 'Keep the existing booking; buy nothing',
  description:
    'The booking the trip already has stands: nothing is bought or cancelled, and the driver gets the plan for it.',
  when: 'The provider confirmed that the booking holds (reconcile: BOOKING_EXISTS, or the provider says the leg still runs), and the trip check shows no booked leg broken. Cite the provider answer in factIds.',
  slots: z.object({
    driverMessage: z
      .string()
      .describe(
        'Exact text to the driver: the existing booking stands; the departure and the check-in cutoff in local time.'
      ),
  }),
  steps: [
    {
      actionClass: 'INSTRUCT_CHANGE',
      title: 'Send the driver the plan for the existing booking',
      build: (slots) => [{ message: slots.driverMessage, slot: 'driverMessage' }],
    },
  ],
  change: () => ({ type: 'NO_CHANGE' }),
  reversibility: 'Nothing is bought or cancelled; only the message is sent.',
});

export const REBOOK_REST_OF_TRIP = defineTemplate({
  id: 'REBOOK_REST_OF_TRIP',
  title: 'Rebook the rest of the trip',
  description:
    'Book what the driver now needs from where they are to the end of the job (a later train, a new sailing, hotel nights with secured parking where the plan now stops overnight, the return home) and cancel the booked legs the new plan no longer uses. The driver keeps the car and keys until the delivery window.',
  when: 'The default: a booked leg is lost and fresh quotes exist that bring the driver through the pickup, the crossing and the delivery. Cover every leg in gather.mustAddress: replace it (name it in `replaces`) or cancel it.',
  slots: z.object({ newSailing, bookings, cancellations, driverMessage }),
  steps: [bookSailing, bookOthers, cancelLegs, tellDriver],
  label: (slots) => rebookLabel({ title: 'Rebook the rest of the trip', slots }),
  change,
  reversibility:
    'Bookings are made on your yes after the provider re-checks each quote; cancellations run only after every booking succeeded; refund terms are on the bookings.',
});

export const REBOOK_ASK_EARLY_DELIVERY = defineTemplate({
  id: 'REBOOK_ASK_EARLY_DELIVERY',
  title: 'Rebook the rest of the trip; ask the customer about an earlier delivery',
  description:
    'Rebook as above, but instead of hotel nights near the destination while the car waits for the delivery window, ask the customer whether an earlier delivery suits them. The draft only asks; it never promises a date.',
  when: 'The new plan arrives more than about 12 hours before the delivery window starts, so the car would otherwise need nights of custody.',
  slots: z.object({
    newSailing,
    bookings: bookings.describe(
      'Every other new booking, in trip order: trains and hotel nights before the crossing only (no destination nights). Empty if none.'
    ),
    cancellations,
    driverMessage,
    customerMessage: z
      .string()
      .describe(
        'Exact draft to the customer asking whether an earlier delivery suits them; it never promises a date or time.'
      ),
  }),
  steps: [
    bookSailing,
    bookOthers,
    cancelLegs,
    tellDriver,
    {
      actionClass: 'CUSTOMER_MESSAGE',
      title: 'Ask the customer whether an earlier delivery suits them',
      build: (slots) => [{ message: slots.customerMessage, slot: 'customerMessage' }],
    },
  ],
  label: (slots) =>
    rebookLabel({ title: 'Rebook; ask the customer about an earlier delivery', slots }),
  change,
  reversibility:
    'Bookings are made on your yes after the provider re-checks each quote; cancellations run only after every booking succeeded; the customer is only asked.',
});

export const MISSED_CONNECTION_TEMPLATES = [
  KEEP_EXISTING_BOOKING,
  REBOOK_REST_OF_TRIP,
  REBOOK_ASK_EARLY_DELIVERY,
];
