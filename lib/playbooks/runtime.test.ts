import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeAdapter } from '@/lib/playbooks/adapters';
import type { BlockDefinition, PlaybookDefinition } from '@/lib/playbooks/types';

const db = vi.hoisted(() => ({
  runs: new Map<string, Record<string, unknown>>(),
  cards: [] as Record<string, unknown>[],
  human: null as unknown,
}));

vi.mock('@/lib/prismaClient', () => ({
  prisma: {
    playbookRun: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const run = { id: 'run-1', ...data };
        db.runs.set('run-1', run);
        return run;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const run = { ...db.runs.get(where.id), ...data };
        db.runs.set(where.id, run);
        return run;
      },
    },
    blockRun: {
      create: async () => ({ id: 'br-1' }),
      update: async () => ({}),
    },
    card: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.cards.find((card) => card.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { runId?: string; kind?: string } }) =>
        db.cards.find((card) => card.runId === where.runId && card.kind === where.kind) ?? null,
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const card = { id: `card-${db.cards.length + 1}`, ...data };
        db.cards.push(card);
        return card;
      },
    },
  },
}));
vi.mock('@/lib/bahn', () => ({
  getOrderBundle: async () => ({ order: { id: 'ord-00154', reference: 'CD-420154' } }),
}));
vi.mock('@/lib/clock', () => ({ simNow: async () => new Date('2026-10-21T09:00:00Z') }));
vi.mock('@/lib/playbooks/facts', () => ({ syncAndListFacts: async () => [] }));
vi.mock('@/lib/playbooks/amendments', () => ({
  loadApprovedAmendments: async () => [],
  resolveParams: () => ({}),
}));
vi.mock('@/lib/chain/compute', () => ({ deriveDecideBy: () => ({ decideBy: null }) }));
vi.mock('@/lib/playbooks/blocks', () => ({
  BLOCK_EXECUTORS: {
    deterministic: async ({ block, ctx }: { block: BlockDefinition; ctx: never }) => ({
      output: await block.run?.(ctx),
    }),
    agent: async () => {
      throw new Error('Claude CLI timed out after 720000 ms');
    },
    human: async () => ({ output: db.human }),
  },
}));

const { runPlaybook } = await import('@/lib/playbooks/runtime');

const adapter = { log: () => undefined } as unknown as RuntimeAdapter;

const definition = (blocks: BlockDefinition[]): PlaybookDefinition => ({
  id: 'missed-connection',
  title: 'Missed connection',
  summary: '',
  triggers: [],
  folder: 'playbooks/missed-connection',
  preconditions: [],
  start: blocks[0].id,
  blocks,
});

beforeEach(() => {
  db.runs.clear();
  db.cards.length = 0;
  db.human = {
    cardId: 'card-decision',
    tokenId: 't',
    expired: false,
    decision: { action: 'reject', note: 'not realistic', decidedBy: 'damir' },
    option: null,
  };
});

describe('every way a run stops reaches a person', () => {
  it('an agent error fails the run and opens a hand-over card with the reason in words', async () => {
    await expect(
      runPlaybook({
        definition: definition([
          { id: 'find_options', kind: 'agent', title: 'Find sailings', description: '', next: [] },
        ]),
        payload: { orderId: 'CD-420154' },
        adapter,
      })
    ).rejects.toThrow(/timed out/);
    expect(db.runs.get('run-1')?.status).toBe('FAILED');
    expect(db.cards).toHaveLength(1);
    expect(db.cards[0]).toMatchObject({
      kind: 'TRIAGE',
      runId: 'run-1',
      playbookId: 'missed-connection',
    });
    expect(String(db.cards[0].summary)).toMatch(
      /stopped at “Find sailings”: the agent took longer than 12 min/
    );
  });

  it('a rejection ends the run handed over, with a card that quotes the operator', async () => {
    const result = await runPlaybook({
      definition: definition([
        {
          id: 'decide',
          kind: 'human',
          title: 'Dispatcher decides',
          description: '',
          next: [{ to: 'escalate', label: 'Rejected' }],
        },
        {
          id: 'escalate',
          kind: 'deterministic',
          status: 'ESCALATED',
          title: 'Hand over',
          description: '',
          run: async () => ({ outcome: 'rejected' }),
          next: [],
        },
      ]),
      payload: { orderId: 'CD-420154' },
      adapter,
    });
    expect(result.status).toBe('ESCALATED');
    expect(db.cards).toHaveLength(1);
    expect(db.cards[0].title).toBe('CD-420154: options rejected, a person takes it');
    expect(String(db.cards[0].summary)).toMatch(
      /Rejected by damir with this note: “not realistic”/
    );
  });

  it('an expired card opens a hand-over card that says nobody decided', async () => {
    db.cards.push({
      id: 'card-decision',
      kind: 'DECISION',
      title: 'CD-420154: Ferry sold out',
      factIds: ['f_1'],
      decision: { expired: true, reason: 'Nobody decided by Wed 21 Oct, 23:30' },
    });
    db.human = {
      cardId: 'card-decision',
      tokenId: 't',
      expired: true,
      decision: null,
      option: null,
    };
    await runPlaybook({
      definition: definition([
        {
          id: 'decide',
          kind: 'human',
          title: 'Dispatcher decides',
          description: '',
          next: [{ to: 'escalate', label: 'Expired' }],
        },
        {
          id: 'escalate',
          kind: 'deterministic',
          status: 'ESCALATED',
          title: 'Hand over',
          description: '',
          run: async () => ({ outcome: 'expired' }),
          next: [],
        },
      ]),
      payload: { orderId: 'CD-420154' },
      adapter,
    });
    const handOver = db.cards.find((card) => card.kind === 'TRIAGE');
    expect(handOver?.title).toBe('CD-420154: nobody decided in time');
    expect(String(handOver?.summary)).toMatch(/^Nobody decided by Wed 21 Oct, 23:30; the card/);
    expect(handOver?.factIds).toEqual(['f_1']);
  });
});
