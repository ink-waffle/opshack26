import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CardAction, CardOption, RunContext } from '@/lib/playbooks/types';

const calls = vi.hoisted(() => ({
  booked: [] as string[],
  cancelled: [] as string[],
  // Provider calls in order: 'book:ferry', 'cancel:HTL-OLD'.
  log: [] as string[],
  sent: [] as { party: string; body: string }[],
  bookOk: true,
}));

const FERRY_QUOTE = {
  id: 'f_ferry',
  value: {
    quote: {
      type: 'ferry',
      sailing: { departureAt: '2026-10-24T12:00:00Z', checkInCutoffAt: '2026-10-24T11:00:00Z' },
    },
  },
};
const OLD_FERRY_QUOTE = {
  id: 'f_old',
  value: {
    quote: {
      type: 'ferry',
      sailing: { departureAt: '2026-10-21T08:00:00Z', checkInCutoffAt: '2026-10-21T07:00:00Z' },
    },
  },
};
const HOTEL_QUOTE = { id: 'f_hotel', value: { quote: { type: 'hotel', hotel: {} } } };
const BACKUP = { id: 'f_backup', value: { tool: 'find_backup_drivers', driverId: 'drv-1' } };
const OUR_TRAIN = {
  id: 'f_our_train',
  kind: 'TRAVEL_BOOKING',
  level: 'BOOKED',
  subject: 'train:conn-1',
  value: {
    mode: 'TRAIN',
    provider: 'Northrail',
    bookingReference: 'TRN-OURS',
    fromCity: 'Munich',
    toCity: 'Tallinn',
    departureAt: '2026-10-22T06:00:00Z',
  },
};

vi.mock('@/lib/playbooks/facts', () => ({
  getFactsByIds: async ({ ids }: { ids: string[] }) =>
    [FERRY_QUOTE, OLD_FERRY_QUOTE, HOTEL_QUOTE, BACKUP, OUR_TRAIN].filter((fact) =>
      ids.includes(fact.id)
    ),
  messageFactId: ({ messageId }: { messageId: string }) => `f_${messageId}`,
  recordFact: async (fact: { statement: string }) => ({ id: 'f_booked', ...fact }),
}));
vi.mock('@/lib/playbooks/quotes', () => ({
  readQuote: (fact?: { value?: { quote?: unknown } }) => fact?.value?.quote ?? null,
  bookedFact: () => ({ statement: 'Booked (simulated).' }),
  cancelledFact: (args: { booking: { bookingReference: string } }) => ({
    statement: `Cancelled (simulated): ${args.booking.bookingReference}.`,
  }),
}));
vi.mock('@/lib/providers', () => ({
  getTravelProvider: () => ({
    book: async ({ quote }: { quote: { type: string } }) => {
      calls.booked.push(quote.type);
      calls.log.push(`book:${quote.type}`);
      return calls.bookOk
        ? { ok: true, bookingReference: `REF-${quote.type}`, statement: 'ok' }
        : { ok: false, statement: 'Sold out at the re-check.' };
    },
    cancel: async ({ booking }: { booking: { bookingReference: string } }) => {
      calls.cancelled.push(booking.bookingReference);
      calls.log.push(`cancel:${booking.bookingReference}`);
      return { ok: true, cancellationReference: 'CXL-1', statement: 'Cancelled.' };
    },
  }),
}));
vi.mock('@/lib/playbooks/bahnWrites', () => ({
  partyTarget: ({ party }: { party: string }) => ({ id: `${party}-1`, name: `The ${party}` }),
  insertMessage: async (args: { party: string; body: string }) => {
    calls.sent.push({ party: args.party, body: args.body });
    return `msg-${calls.sent.length}`;
  },
}));
vi.mock('@/lib/playbooks/simulated', () => ({
  simulatedKind: async (action: CardAction) =>
    action.actionClass === 'MARKET' && action.quoteFactId === 'f_backup' ? 'offer' : null,
  sendDirectedOffer: async (args: { action: CardAction }) => ({
    actionId: args.action.id,
    actionClass: 'MARKET',
    status: 'DONE',
    statement: 'Directed offer sent (simulated).',
    factIds: ['f_offer'],
  }),
  orderRoadside: async () => {
    throw new Error('not used');
  },
}));
vi.mock('@/lib/playbooks/blocks/human', () => ({
  latestDecision: (ctx: RunContext) => ctx.outputs.decide ?? null,
}));

const { executeActions, executeExecuteBlock } = await import('@/lib/playbooks/blocks/execute');
const { planExecution } = await import('@/lib/playbooks/blocks/executePlan');

const ctx = (outputs: Record<string, unknown> = {}) =>
  ({
    orderId: 'ord-00154',
    orderRef: 'CD-420154',
    order: {
      travelReservations: [
        {
          id: 'res-hotel-tallinn',
          kind: 'HOTEL',
          provider: 'Old Town Hotel',
          bookingReference: 'HTL-OLD',
          city: 'Tallinn',
          fromCity: null,
          toCity: null,
          checkInAt: new Date('2026-10-21T19:00:00Z'),
          departureAt: new Date('2026-10-21T19:00:00Z'),
        },
      ],
    },
    facts: [],
    run: { id: 'run-1' },
    simNow: new Date('2026-10-21T09:00:00Z'),
    outputs,
    services: { refresh: async () => undefined },
  }) as unknown as RunContext;

// The R1 B1 card: a "new driver" plan whose bookings and driver message depend on someone accepting first.
const NEW_DRIVER_PLAN: CardAction[] = [
  {
    id: 'A1',
    actionClass: 'MARKET',
    description:
      "Publish a new offer for the job. Keep Jonas's assignment until a replacement accepts.",
    quoteFactId: null,
  },
  {
    id: 'A2',
    actionClass: 'BOOK_TRAVEL',
    description: 'Book the Sat 24 Oct ferry once a new driver has accepted.',
    quoteFactId: 'f_ferry',
  },
  {
    id: 'A3',
    actionClass: 'BOOK_TRAVEL',
    description: 'Book one hotel night at the terminal.',
    quoteFactId: 'f_hotel',
  },
  {
    id: 'A5',
    actionClass: 'INSTRUCT_CHANGE',
    description: 'Send the plan to the new driver once bookings succeed.',
    message: 'Your plan: ferry Saturday 14:00, hotel at the terminal.',
  },
];

beforeEach(() => {
  calls.booked = [];
  calls.cancelled = [];
  calls.log = [];
  calls.sent = [];
  calls.bookOk = true;
});

describe('execute runs only what the approved option allows', () => {
  it('books and texts nothing that waits for a new driver', async () => {
    const effects = await executeActions({ ctx: ctx(), actions: NEW_DRIVER_PLAN });
    expect(calls.booked).toEqual([]);
    expect(calls.sent).toEqual([]);
    expect(effects.map((effect) => [effect.actionId, effect.status])).toEqual([
      ['A1', 'MANUAL'],
      ['A2', 'WAITING'],
      ['A3', 'WAITING'],
      ['A5', 'WAITING'],
    ]);
  });

  it('sends the directed offer and the hold to the current driver, nothing else', async () => {
    const effects = await executeActions({
      ctx: ctx(),
      actions: [
        {
          id: 'B1',
          actionClass: 'MARKET',
          description: 'Directed offer to Liam; Carl stays assigned until Liam accepts.',
          quoteFactId: 'f_backup',
        },
        {
          id: 'B2',
          actionClass: 'INSTRUCT_HOLD',
          description: 'Tell Carl to hold off on the 12:25 train.',
          message: 'Please hold off on the 12:25 train; you stay assigned for now.',
        },
        {
          id: 'B3',
          actionClass: 'BOOK_TRAVEL',
          description: 'Book the ferry for the backup.',
          quoteFactId: 'f_ferry',
        },
      ],
    });
    expect(effects.map((effect) => [effect.actionId, effect.status])).toEqual([
      ['B1', 'DONE'],
      ['B2', 'DONE'],
      ['B3', 'WAITING'],
    ]);
    expect(calls.sent.map((message) => message.party)).toEqual(['driver']);
    expect(calls.booked).toEqual([]);
  });

  it('does not text the customer or the driver a plan after a failed booking', async () => {
    calls.bookOk = false;
    const effects = await executeActions({
      ctx: ctx(),
      actions: [
        {
          id: 'A1',
          actionClass: 'BOOK_TRAVEL',
          description: 'Book the ferry.',
          quoteFactId: 'f_ferry',
        },
        {
          id: 'A2',
          actionClass: 'CUSTOMER_MESSAGE',
          description: 'Tell the customer the new date.',
          message: 'Your car arrives on Monday.',
        },
        {
          id: 'A3',
          actionClass: 'INSTRUCT_HOLD',
          description: 'Keep the car parked.',
          message: 'Please keep the car parked at the terminal.',
        },
      ],
    });
    expect(effects.map((effect) => [effect.actionId, effect.status])).toEqual([
      ['A1', 'FAILED'],
      ['A2', 'SKIPPED'],
      ['A3', 'DONE'],
    ]);
    expect(calls.sent.map((message) => message.party)).toEqual(['driver']);
  });

  it('refuses a sailing whose check-in closed in the sim past, without calling the provider', async () => {
    const [effect] = await executeActions({
      ctx: ctx(),
      actions: [
        { id: 'A1', actionClass: 'BOOK_TRAVEL', description: 'Book it.', quoteFactId: 'f_old' },
      ],
    });
    expect(effect.status).toBe('FAILED');
    expect(effect.statement).toMatch(/closed for check-in/);
    expect(calls.booked).toEqual([]);
  });
});

// The missed-connection shape: the cancel is listed first on the card but runs after the booking.
const REBOOK: CardAction[] = [
  {
    id: 'A1',
    actionClass: 'CANCEL_TRAVEL',
    description: 'Cancel the Tallinn hotel the driver no longer reaches.',
    target: 'res-hotel-tallinn',
  },
  {
    id: 'A2',
    actionClass: 'BOOK_TRAVEL',
    description: 'Book the new sailing.',
    quoteFactId: 'f_ferry',
    replaces: ['res-ferry'],
  },
  {
    id: 'A3',
    actionClass: 'INSTRUCT_CHANGE',
    description: 'Send the driver the new plan.',
    message: 'Your plan: ferry Saturday 14:00.',
  },
];

describe('cancellations run only after every booking of the option succeeded', () => {
  it('books, then cancels, then tells the driver both reference lists', async () => {
    const effects = await executeActions({ ctx: ctx(), actions: REBOOK });
    expect(calls.log).toEqual(['book:ferry', 'cancel:HTL-OLD']);
    expect(effects.map((effect) => [effect.actionId, effect.status])).toEqual([
      ['A1', 'DONE'],
      ['A2', 'DONE'],
      ['A3', 'DONE'],
    ]);
    expect(effects[0]).toMatchObject({
      cancelledReference: 'HTL-OLD',
      cancellationReference: 'CXL-1',
    });
    expect(calls.sent).toEqual([
      {
        party: 'driver',
        body: 'Your plan: ferry Saturday 14:00.\n\nBooking references: REF-ferry.\nCancelled: HTL-OLD (cancellation CXL-1).',
      },
    ]);
  });

  it('skips the cancellation (and the plan message) when a booking fails', async () => {
    calls.bookOk = false;
    const effects = await executeActions({ ctx: ctx(), actions: REBOOK });
    expect(calls.cancelled).toEqual([]);
    expect(effects.map((effect) => [effect.actionId, effect.status])).toEqual([
      ['A1', 'SKIPPED'],
      ['A2', 'FAILED'],
      ['A3', 'SKIPPED'],
    ]);
    expect(effects[0].statement).toBe(
      'Not cancelled: step A2 failed, so the booking it would replace stays.'
    );
    expect(calls.sent).toEqual([]);
  });

  it('cancels one of our own BOOKED facts by its fact id', async () => {
    const [effect] = await executeActions({
      ctx: ctx(),
      actions: [
        {
          id: 'A1',
          actionClass: 'CANCEL_TRAVEL',
          description: 'Cancel the train booked earlier.',
          target: 'f_our_train',
        },
      ],
    });
    expect(effect.status).toBe('DONE');
    expect(calls.cancelled).toEqual(['TRN-OURS']);
  });

  it('fails plainly when the target is not a live booking', async () => {
    const [effect] = await executeActions({
      ctx: ctx(),
      actions: [
        { id: 'A1', actionClass: 'CANCEL_TRAVEL', description: 'Cancel.', target: 'res-unknown' },
      ],
    });
    expect(effect.status).toBe('FAILED');
    expect(effect.statement).toMatch(/No live booking on record for res-unknown/);
    expect(calls.cancelled).toEqual([]);
  });
});

describe('planExecution for CANCEL_TRAVEL', () => {
  const cancelStep = (patch: Partial<CardAction> = {}): CardAction => ({
    id: 'A1',
    actionClass: 'CANCEL_TRAVEL',
    description: 'Cancel the hotel.',
    ...patch,
  });

  it('runs on a yes with a target, stays manual without one, waits for a new driver', () => {
    expect(planExecution({ actions: [cancelStep({ target: 'res-1' })] })[0].mode).toBe('now');
    expect(planExecution({ actions: [cancelStep()] })[0].mode).toBe('manual');
    expect(
      planExecution({
        actions: [cancelStep({ target: 'res-1' })],
        changeType: 'REPLACE_DRIVER',
      })[0].mode
    ).toBe('waits');
  });
});

const option = (patch: Partial<CardOption> = {}): CardOption => ({
  id: 'B',
  label: 'Tell the customer it is booked',
  detail: '',
  actions: [
    { id: 'B1', actionClass: 'BOOK_TRAVEL', description: 'Book.', quoteFactId: 'f_ferry' },
    {
      id: 'B2',
      actionClass: 'CUSTOMER_MESSAGE',
      description: 'Tell the customer.',
      message: 'Your car is booked.',
    },
  ],
  factIds: [],
  chain: null,
  slackMinutes: null,
  costLabel: '',
  costCents: null,
  approvers: [],
  gate: {
    ok: false,
    violations: [{ ruleId: 'G3', message: 'B2: "is booked" asserts BOOKED_CAPACITY' }],
    warnings: [],
  },
  blocked: { ruleId: 'G3', message: 'B2: "is booked" asserts BOOKED_CAPACITY' },
  reversibility: '',
  recommended: false,
  ...patch,
});

describe('the run refuses what the gate blocked, even if a decision reaches it', () => {
  it('approving a blocked option executes nothing and says why', async () => {
    const decide = {
      cardId: 'card-1',
      offered: option(),
      option: option(),
      decision: { action: 'approve', optionId: 'B', decidedBy: 'script' },
    };
    const { output } = await executeExecuteBlock({
      block: { id: 'execute', kind: 'execute', title: '', description: '', next: [] },
      ctx: ctx({ decide }),
      adapter: {} as never,
      blockRunId: 'br-1',
    });
    expect(output).toMatchObject({ ok: false, effects: [] });
    expect((output as { refused: string }).refused).toMatch(/Option B is blocked/);
    expect(calls.booked).toEqual([]);
    expect(calls.sent).toEqual([]);
  });

  it('an edit that drops the blocked step runs the rest', async () => {
    const decide = {
      cardId: 'card-1',
      offered: option(),
      option: option({ actions: option().actions.slice(0, 1) }),
      decision: {
        action: 'edit',
        optionId: 'B',
        edits: { removeActionIds: ['B2'] },
        decidedBy: 'operator',
      },
    };
    const { output } = await executeExecuteBlock({
      block: { id: 'execute', kind: 'execute', title: '', description: '', next: [] },
      ctx: ctx({ decide }),
      adapter: {} as never,
      blockRunId: 'br-1',
    });
    expect((output as { refused?: string }).refused).toBeUndefined();
    expect(calls.booked).toEqual(['ferry']);
  });

  it('an edit with only a note that reaches execute is refused, not ignored', async () => {
    const decide = {
      cardId: 'card-1',
      offered: option({ gate: { ok: true, violations: [], warnings: [] }, blocked: null }),
      option: option({ gate: { ok: true, violations: [], warnings: [] }, blocked: null }),
      decision: { action: 'edit', optionId: 'B', note: 'no Helsinki nights', decidedBy: 'script' },
    };
    const { output } = await executeExecuteBlock({
      block: { id: 'execute', kind: 'execute', title: '', description: '', next: [] },
      ctx: ctx({ decide }),
      adapter: {} as never,
      blockRunId: 'br-1',
    });
    expect((output as { refused: string }).refused).toMatch(/must reword a message or skip a step/);
    expect(calls.booked).toEqual([]);
  });
});
