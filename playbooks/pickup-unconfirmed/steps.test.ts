import { describe, expect, it } from 'vitest';

import { buildOrderBundle } from '@/lib/bahn/testing';
import { projectOrderFacts } from '@/lib/facts/projection';
import type { RunContext } from '@/lib/playbooks/types';
import { computeWaitDuration } from '@/lib/playbooks/waitDuration';
import {
  checkEvidence,
  nextCommitment,
  waitCommitment,
} from '@/playbooks/pickup-unconfirmed/steps';

// Pure context from the vendored dataset (no DB): the bundle and its projected facts at a sim time.
function contextAt(args: { ref: string; at: string }): RunContext {
  const bundle = buildOrderBundle({ ref: args.ref });
  if (!bundle) throw new Error(`no order ${args.ref} in the dataset`);
  return {
    order: bundle,
    facts: projectOrderFacts({ bundle }),
    simNow: new Date(args.at),
    params: {},
    outputs: {},
  } as unknown as RunContext;
}

async function planWait(ctx: RunContext) {
  ctx.outputs.next_commitment = await nextCommitment(ctx);
  const commitment = await waitCommitment(ctx);
  return computeWaitDuration({
    defaultMinutes: 120,
    bufferMinutes: 30,
    simNow: ctx.simNow,
    commitment,
    speed: 1,
  });
}

describe('pickup-unconfirmed: deadline-aware wait', () => {
  it('waits only 75 min when the driver must leave for a booked ferry in 105 min (CD-420442)', async () => {
    const ctx = contextAt({ ref: 'CD-420442', at: '2026-10-22T12:45:00Z' });
    const plan = await planWait(ctx);
    const out = ctx.outputs.next_commitment as Awaited<ReturnType<typeof nextCommitment>>;
    expect(out.next?.kind).toBe('LEAVE_FOR_FERRY');
    expect(out.next?.at).toBe('2026-10-22T14:30:00.000Z');
    expect(out.explanation).toMatch(/not affordable/);
    expect(plan.simMinutes).toBe(75);
    expect(plan.shortened).toBe(true);
    expect(plan.reason).toMatch(/instead of 120: the driver must leave Stockholm/);
  });

  it('keeps the default 2 h when the slot end is far enough (CD-420442 at slot start)', async () => {
    const ctx = contextAt({ ref: 'CD-420442', at: '2026-10-22T08:10:00Z' });
    const plan = await planWait(ctx);
    expect((ctx.outputs.next_commitment as { next: { kind: string } }).next.kind).toBe('SLOT_END');
    expect(plan.simMinutes).toBe(120);
    expect(plan.shortened).toBe(false);
  });

  it('asks at once when the deadline is inside the buffer', async () => {
    const ctx = contextAt({ ref: 'CD-420442', at: '2026-10-22T14:10:00Z' });
    const plan = await planWait(ctx);
    expect(plan.simMinutes).toBe(0);
  });

  it('uses the latest departure for the promise on a road-only order (CD-420593)', async () => {
    const ctx = contextAt({ ref: 'CD-420593', at: '2026-10-21T09:41:00Z' });
    const out = await nextCommitment(ctx);
    expect(out.deadlines.map((deadline) => deadline.kind)).toContain('LEAVE_FOR_PROMISE');
    expect(out.explanation).toMatch(/affordable/);
  });

  it('finds no pickup scan once the slot has started (CD-420442)', async () => {
    const ctx = contextAt({ ref: 'CD-420442', at: '2026-10-22T12:45:00Z' });
    const evidence = await checkEvidence(ctx);
    expect(evidence.slotStarted).toBe(true);
    expect(evidence.slotEnded).toBe(true);
    expect(evidence.pickedUp).toBeNull();
  });
});
