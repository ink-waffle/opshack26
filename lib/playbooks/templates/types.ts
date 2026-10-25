// Option templates: the closed list of options a playbook may offer; the agent fills slots, code builds the rest.

import type { z } from 'zod';

import type { ActionClass } from '@/lib/gate/actions';

// The change an option makes to the order plan (the chain calculator's input).
export type PlanChange =
  | { type: 'NO_CHANGE' }
  | { type: 'NEW_SAILING'; factId: string }
  | { type: 'REPLACE_DRIVER'; factId: string }
  | { type: 'MOVE_PICKUP_SLOT'; startAt: string; endAt: string };

// One action a step becomes: a booking or offer cites its fact, a message carries its exact text, a cancel its target.
type StepAction = {
  quoteFactId?: string;
  message?: string;
  target?: string;
  replaces?: string[];
  slot: string;
};

type TemplateStepSpec<S> = {
  actionClass: ActionClass;
  // Plain words for the card, the catalog and the agent prompt.
  title: string;
  // The actions this step becomes for these slots: none, one, or one per listed quote.
  build: (slots: S) => StepAction[];
};

export type TemplateSpec<S extends z.ZodObject> = {
  id: string;
  title: string;
  // What the option does, in plain words for the chief dispatcher and the agent.
  description: string;
  // When the agent offers it.
  when: string;
  slots: S;
  steps: TemplateStepSpec<z.infer<S>>[];
  // The card label; defaults to the title.
  label?: (slots: z.infer<S>) => string;
  change: (slots: z.infer<S>) => PlanChange;
  reversibility: string;
};

export type ExpandedAction = {
  actionClass: ActionClass;
  description: string;
  quoteFactId: string | null;
  message: string | null;
  // CANCEL_TRAVEL: the booked leg to cancel (reservation id or booking fact id).
  target: string | null;
  // BOOK_TRAVEL: booked legs this booking takes over.
  replaces: string[];
  // The slots that filled this action, e.g. 'driverMessage' or 'hotelQuoteFactIds.1'.
  slot: string;
};

type TemplateExpansion = {
  label: string;
  change: PlanChange;
  actions: ExpandedAction[];
  // Fact ids the slots cite (quotes, candidates).
  factIds: string[];
  reversibility: string;
};

export type OptionTemplate = {
  id: string;
  title: string;
  description: string;
  when: string;
  slots: z.ZodObject;
  steps: { actionClass: ActionClass; title: string }[];
  // Parses the slots and builds the option deterministically.
  expand: (slots: unknown) => TemplateExpansion;
};
