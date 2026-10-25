// The owner's choices for a stopped car: their own roadside service, a tow by Bahn, or wait.

import { z } from 'zod';

import { defineTemplate } from '@/lib/playbooks/templates';

const driverMessage = z
  .string()
  .describe(
    'Exact text to the driver: stay with the car, keep it stopped, hand it only to the person or company we name; we tell them who is coming and when. No mechanical or driving advice ("do not drive further" is fine).'
  );
const ownerMessage = z
  .string()
  .describe(
    "Exact draft to the owner (a person approves it): the car is stopped at the reported place, the driver is safe, what this option means, and that today's delivery window is at risk. No new date or time: a new time follows once the recovery plan is known."
  );

const holdStep = {
  actionClass: 'INSTRUCT_HOLD',
  title: 'Tell the driver to wait with the car and whom to hand it to',
  build: (slots: { driverMessage: string }) => [
    { message: slots.driverMessage, slot: 'driverMessage' },
  ],
} as const;
const ownerStep = {
  actionClass: 'CUSTOMER_MESSAGE',
  title: 'Send the owner the approved message',
  build: (slots: { ownerMessage: string }) => [
    { message: slots.ownerMessage, slot: 'ownerMessage' },
  ],
} as const;

export const OWNER_ROADSIDE = defineTemplate({
  id: 'OWNER_ROADSIDE',
  title: "The owner's own roadside service",
  description:
    'The owner sends their own roadside or service contact, who knows the car. Bahn books nothing; the driver waits and hands the car only to them.',
  when: 'Usually the first choice: the owner is reachable and has a roadside or service contact.',
  slots: z.object({ driverMessage, ownerMessage }),
  steps: [holdStep, ownerStep],
  change: () => ({ type: 'NO_CHANGE' }),
  reversibility: 'Nothing is ordered; only the two messages are sent.',
});

export const BAHN_TOW = defineTemplate({
  id: 'BAHN_TOW',
  title: 'Bahn orders a tow',
  description:
    'Bahn orders the tow candidate found near the reported place, to a place the owner names. The tow is a cost a person approves; the driver hands the car only to the tow company, and the tow reference is added to their message.',
  when: 'The owner wants Bahn to arrange recovery, or has no service of their own; a tow candidate from find_roadside exists.',
  slots: z.object({
    towFactId: z
      .string()
      .describe('The find_roadside fact id of the tow candidate (kind tow) to order.'),
    driverMessage: driverMessage.describe(
      'Exact text to the driver: a tow is on its way; stay with the car, keep it stopped and hand it only to the tow company. Do not mention references (the runtime appends the tow reference). No mechanical or driving advice.'
    ),
    ownerMessage,
  }),
  steps: [
    {
      actionClass: 'MONEY',
      title: 'Order the tow (a cost a person approves)',
      build: (slots) => [{ quoteFactId: slots.towFactId, slot: 'towFactId' }],
    },
    holdStep,
    ownerStep,
  ],
  change: () => ({ type: 'NO_CHANGE' }),
  reversibility: 'The tow can be cancelled until it is dispatched; nothing else is committed.',
});

export const WAIT_FOR_OWNER = defineTemplate({
  id: 'WAIT_FOR_OWNER',
  title: "Wait for the owner's instruction",
  description:
    'The driver waits with the car and nothing is ordered until the owner decides what should happen.',
  when: 'The owner cannot decide yet or wants to call back.',
  slots: z.object({ driverMessage, ownerMessage }),
  steps: [holdStep, ownerStep],
  change: () => ({ type: 'NO_CHANGE' }),
  reversibility: 'Nothing is ordered; only the two messages are sent.',
});

export const VEHICLE_TEMPLATES = [OWNER_ROADSIDE, BAHN_TOW, WAIT_FOR_OWNER];
