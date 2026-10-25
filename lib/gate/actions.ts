// Action classes and the authority table (decision_tree §3) plus the guardrails G1–G11 (§2) as data.

export type Authority =
  'AUTO' | 'AUTO_NOTIFY' | 'YES' | 'EVIDENCE_THEN_YES' | 'HUMAN_ONLY' | 'BLOCKED';

export type ActionClassSpec = {
  authority: Authority;
  label: string;
  examples: string;
  canEarnAutonomy: string;
};

export const ACTION_CLASSES = {
  READ: {
    authority: 'AUTO',
    label: 'Read',
    examples: 'Look up records, compute the chain, read the inbox.',
    canEarnAutonomy: '—',
  },
  ASK_DRIVER: {
    authority: 'AUTO',
    label: 'Ask the driver',
    examples: '"Are you safe?", "Gate ETA?", "Confirm by 10:00 whether you board."',
    canEarnAutonomy: '—',
  },
  ASK_SITE: {
    authority: 'AUTO',
    label: 'Ask the site',
    examples: '"Is VIN … in your release queue?", "Who holds the keys?"',
    canEarnAutonomy: '—',
  },
  ASK_PROVIDER: {
    authority: 'AUTO',
    label: 'Ask a provider (no purchase)',
    examples: 'Reconcile a booking reference, refresh capacity, rollover terms.',
    canEarnAutonomy: '—',
  },
  INSTRUCT_HOLD: {
    authority: 'AUTO_NOTIFY',
    label: 'Safety-preserving hold',
    examples:
      '"Keep the car stopped", "keep the keys", "do not hand over without a named receiver".',
    canEarnAutonomy: '—',
  },
  INSTRUCT_CHANGE: {
    authority: 'YES',
    label: 'Tell the driver to change plan',
    examples: '"Go to the other yard", "start later", "take the car".',
    canEarnAutonomy: 'Later, for low-cost same-day changes.',
  },
  CUSTOMER_MESSAGE: {
    authority: 'YES',
    label: 'Customer message (draft until approved)',
    examples: 'Status, ETA, approval requests.',
    canEarnAutonomy: 'First candidate: factual status replies.',
  },
  BOOK_TRAVEL: {
    authority: 'YES',
    label: 'Book travel',
    examples: 'Ferry, train, flight, hotel.',
    canEarnAutonomy: 'Per-cost threshold after a track record.',
  },
  CANCEL_TRAVEL: {
    authority: 'YES',
    label: 'Cancel travel',
    examples: 'Cancel a ferry, train or hotel booking.',
    canEarnAutonomy: 'Per-cost threshold after a track record.',
  },
  CHANGE_WINDOW: {
    authority: 'YES',
    label: 'Change a window',
    examples: 'Pickup slot, delivery window, promise (a promise also needs the customer).',
    canEarnAutonomy: 'Pickup-slot moves agreed by site and customer.',
  },
  CHANGE_ASSIGNMENT: {
    authority: 'YES',
    label: 'Change an assignment',
    examples: 'Cancel, reassign, payout decision.',
    canEarnAutonomy: 'No (payout).',
  },
  MARKET: {
    authority: 'YES',
    label: 'Driver market',
    examples: 'Publish, withdraw, reprice, directed offer.',
    canEarnAutonomy: 'Withdraw or pause on a site "do not send a driver".',
  },
  RECORD_ASSERTION: {
    authority: 'EVIDENCE_THEN_YES',
    label: 'Assert a record state',
    examples: 'Resolve an alert, verify an endpoint, approve proof, set a milestone.',
    canEarnAutonomy: 'Resolve-only actions with a matching evidence type.',
  },
  MONEY: {
    authority: 'HUMAN_ONLY',
    label: 'Money',
    examples: 'Approve an expense, payout, compensation.',
    canEarnAutonomy: 'No.',
  },
  FORBIDDEN: {
    authority: 'BLOCKED',
    label: 'Forbidden for the agent',
    examples:
      "Mechanical or driving advice in a warning or accident case, liability attribution, naming another customer's job, substituting a car.",
    canEarnAutonomy: 'Never.',
  },
} as const satisfies Record<string, ActionClassSpec>;

export type ActionClass = keyof typeof ACTION_CLASSES;

export const ACTION_CLASS_IDS = Object.keys(ACTION_CLASSES) as ActionClass[];

export function isActionClass(value: string): value is ActionClass {
  return value in ACTION_CLASSES;
}

export function authorityOf(actionClass: ActionClass): Authority {
  return ACTION_CLASSES[actionClass].authority;
}

export const GUARDRAILS = {
  G1: {
    title: 'No customer contact without a yes',
    rule: 'Customer-facing text is a draft until a person approves it.',
  },
  G2: {
    title: 'Commitments need a yes',
    rule: 'Buying or cancelling travel, changing a slot, window or promise, adding cost, changing an assignment, and publishing, withdrawing or repricing an offer all need a yes.',
  },
  G3: {
    title: 'Evidence level',
    rule: 'Asserting a state needs a cited fact at the level its claim kind requires. A quote, driver report, ETA or photo never upgrades a claim.',
  },
  G4: {
    title: 'Forbidden for the agent',
    rule: "No mechanical or driving advice in a warning or accident case, no liability attribution, no naming another customer's job, no substituting a car.",
  },
  G5: {
    title: 'Quote freshness',
    rule: 'A quote older than 90 min cannot be booked or presented as capacity; re-check first. Between 60 and 90 min the card shows a warning.',
  },
  G6: {
    title: 'Promise invariance',
    rule: 'Do not change or present a new promise until the replacement is booked and the customer has approved.',
  },
  G7: {
    title: 'No cancel before replacement',
    rule: 'Keep a booking or assignment that still works until its replacement is confirmed. A booked leg the trip check marks missed, unreachable or redundant may be cancelled, and so may one the same option books a replacement for (bookings run first; cancellations only after every booking succeeded).',
  },
  G8: { title: 'Recheck before write', rule: 'Re-read the dependency state at execution.' },
  G9: {
    title: 'Unknown-outcome lock',
    rule: "No retry or alternative purchase while an earlier attempt's outcome is unknown.",
  },
  G10: {
    title: 'Third-party custody',
    rule: "Car or keys go to a third party only with the owner's approval.",
  },
  G11: {
    title: 'Show the source',
    rule: 'Every fact on a card shows its source record, its time and its evidence level; cited fact ids must exist.',
  },
  G12: {
    title: 'No booked leg left broken',
    rule: 'An option that changes the trip must leave the whole remaining trip workable: every booked leg it breaks or makes redundant is replaced or cancelled, and every new leg can be reached.',
  },
} as const;

export type GuardrailId = keyof typeof GUARDRAILS;

/** Markdown of the guardrails and the authority table for agent prompts. */
export function renderGuardrailsForAgents(): string {
  const lines = ['## Guardrails (checked by code after you answer)', ''];
  for (const [id, guardrail] of Object.entries(GUARDRAILS)) {
    lines.push(`- **${id} ${guardrail.title}.** ${guardrail.rule}`);
  }
  lines.push(
    '',
    '## Who approves each action class',
    '',
    '| Class | Authority | Examples |',
    '|---|---|---|'
  );
  for (const id of ACTION_CLASS_IDS) {
    const spec = ACTION_CLASSES[id];
    lines.push(`| ${id} | ${spec.authority} | ${spec.examples} |`);
  }
  return lines.join('\n');
}
