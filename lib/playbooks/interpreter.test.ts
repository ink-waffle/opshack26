import { describe, expect, it } from 'vitest';

import {
  definePlaybook,
  selectEdge,
  validatePlaybook,
  walkGraph,
} from '@/lib/playbooks/interpreter';
import { getPlaybook, listPlaybooks } from '@/lib/playbooks/registry';
import type { BlockDefinition, PlaybookDefinition, RunContext } from '@/lib/playbooks/types';

const fakeCtx = () => ({ outputs: {} }) as unknown as RunContext;

function block(
  id: string,
  next: BlockDefinition['next'],
  extra: Partial<BlockDefinition> = {}
): BlockDefinition {
  return {
    id,
    kind: 'deterministic',
    title: id,
    description: id,
    run: async () => null,
    next,
    ...extra,
  };
}

function playbook(blocks: BlockDefinition[], start = blocks[0].id): PlaybookDefinition {
  return {
    id: 'test',
    title: 'Test',
    summary: 'test',
    triggers: [],
    folder: 'playbooks/test',
    preconditions: [],
    start,
    blocks,
  };
}

// Fake executor: returns scripted outputs per block id and records the order of execution.
function scripted(outputs: Record<string, unknown>) {
  const calls: string[] = [];
  return {
    calls,
    executeBlock: async ({ block: current }: { block: BlockDefinition }) => {
      calls.push(current.id);
      return outputs[current.id] ?? null;
    },
  };
}

describe('selectEdge', () => {
  it('returns null for a terminal block', () => {
    expect(selectEdge({ block: block('end', []), ctx: fakeCtx() })).toBeNull();
  });

  it('takes the first edge whose when holds, skipping false ones', () => {
    const ctx = fakeCtx();
    ctx.outputs.gather = { reconcile: true };
    const edge = selectEdge({
      block: block('gather', [
        { to: 'close', label: 'nothing to do', when: () => false },
        {
          to: 'reconcile',
          label: 'unknown attempt',
          when: (c) => (c.outputs.gather as { reconcile: boolean }).reconcile,
        },
        { to: 'options', label: 'otherwise' },
      ]),
      ctx,
    });
    expect(edge?.to).toBe('reconcile');
  });

  it('falls through to an edge without when', () => {
    const edge = selectEdge({
      block: block('a', [
        { to: 'b', label: 'never', when: () => false },
        { to: 'c', label: 'otherwise' },
      ]),
      ctx: fakeCtx(),
    });
    expect(edge?.to).toBe('c');
  });

  it('throws when edges exist but none match', () => {
    expect(() =>
      selectEdge({
        block: block('a', [{ to: 'b', label: 'never', when: () => false }]),
        ctx: fakeCtx(),
      })
    ).toThrow(/No edge from "a"/);
  });
});

describe('walkGraph', () => {
  const definition = playbook([
    block('gather', [
      {
        to: 'reconcile',
        label: 'unknown attempt',
        when: (c) => Boolean((c.outputs.gather as { u: boolean }).u),
      },
      { to: 'decide', label: 'otherwise' },
    ]),
    block('reconcile', [{ to: 'decide', label: 'answered' }], { kind: 'agent' }),
    block('decide', [
      { to: 'execute', label: 'approved', when: (c) => (c.outputs.decide as { ok: boolean }).ok },
      { to: 'escalate', label: 'rejected' },
    ]),
    block('execute', [{ to: 'close', label: 'done' }], { kind: 'execute' }),
    block('close', [], { status: 'CLOSED' }),
    block('escalate', [], { status: 'ESCALATED' }),
  ]);

  it('follows the reconcile branch and closes after approval', async () => {
    const ctx = fakeCtx();
    const fake = scripted({ gather: { u: true }, decide: { ok: true } });
    const result = await walkGraph({ definition, ctx, executeBlock: fake.executeBlock });
    expect(result.path).toEqual(['gather', 'reconcile', 'decide', 'execute', 'close']);
    expect(result.status).toBe('CLOSED');
    expect(fake.calls).toEqual(result.path);
    expect(ctx.outputs.decide).toEqual({ ok: true });
  });

  it('skips reconcile and escalates on rejection', async () => {
    const fake = scripted({ gather: { u: false }, decide: { ok: false } });
    const result = await walkGraph({ definition, ctx: fakeCtx(), executeBlock: fake.executeBlock });
    expect(result.path).toEqual(['gather', 'decide', 'escalate']);
    expect(result.status).toBe('ESCALATED');
    expect(result.lastBlockId).toBe('escalate');
  });

  it('stops a cycle with the step guard', async () => {
    const loop = playbook([
      block('a', [{ to: 'b', label: 'go' }]),
      block('b', [{ to: 'a', label: 'back' }]),
    ]);
    await expect(
      walkGraph({
        definition: loop,
        ctx: fakeCtx(),
        executeBlock: scripted({}).executeBlock,
        maxSteps: 5,
      })
    ).rejects.toThrow(/exceeded 5 steps/);
  });

  it('propagates a failing block', async () => {
    await expect(
      walkGraph({
        definition,
        ctx: fakeCtx(),
        executeBlock: async () => {
          throw new Error('boom');
        },
      })
    ).rejects.toThrow('boom');
  });
});

describe('validatePlaybook', () => {
  it('reports unknown targets, a missing start and missing per-kind fields', () => {
    const problems = validatePlaybook(
      playbook(
        [
          block('a', [{ to: 'nowhere', label: 'x' }]),
          { id: 'b', kind: 'agent', title: 'b', description: 'b', next: [] },
          { id: 'c', kind: 'human', title: 'c', description: 'c', next: [] },
        ],
        'missing'
      )
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'start block missing missing',
        'a → nowhere: unknown target',
        'agent block b needs instructions and outputSchema',
        'human block c needs card',
      ])
    );
  });

  it('definePlaybook throws on an invalid graph', () => {
    expect(() => definePlaybook(playbook([block('a', [{ to: 'x', label: 'x' }])]))).toThrow(
      /Invalid playbook/
    );
  });

  it('every registered playbook is valid and reachable by id', () => {
    expect(listPlaybooks().length).toBeGreaterThan(0);
    for (const definition of listPlaybooks()) {
      expect(validatePlaybook(definition)).toEqual([]);
      expect(getPlaybook(definition.id)).toBe(definition);
    }
  });
});
