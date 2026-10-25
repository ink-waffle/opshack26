import { describe, expect, it } from 'vitest';

import { buildOrderBundle, loadBahnDataset } from '@/lib/bahn/testing';
import { FACT_KINDS } from '@/lib/evidence/ladder';
import { projectOrderFacts } from '@/lib/facts/projection';

function facts(ref: string) {
  const bundle = buildOrderBundle({ ref });
  if (!bundle) throw new Error(ref);
  return projectOrderFacts({ bundle });
}

const byRecord = (list: ReturnType<typeof facts>, recordId: string, kind: string) =>
  list.find((f) => f.sourceRef.endsWith(`:${recordId}`) && f.kind === kind);

describe('projectOrderFacts', () => {
  const cd299 = facts('CD-420299');
  const cd449 = facts('CD-420449');

  it('keeps a quote at QUOTED and a reservation at BOOKED', () => {
    const quote = byRecord(cd299, 'travel-xf29ed1732d895f37', 'FERRY_QUOTE');
    expect(quote?.level).toBe('QUOTED');
    expect(quote?.statement).toMatch(/^Quote only, not booked/);
    expect(quote?.observedAt.toISOString()).toBe('2026-10-21T07:00:00.000Z');
    const train = byRecord(cd449, 'res-x0320cdf029cd4c96', 'TRAVEL_BOOKING');
    expect(train?.level).toBe('BOOKED');
    expect(train?.statement).toContain('a ticket does not prove travel');
    expect(byRecord(cd299, 'travel-xc1d8163d5443a606', 'FERRY_SOLD_OUT')?.level).toBe('QUOTED');
  });

  it('records a driver message as STATED with the speaker', () => {
    const message = byRecord(cd299, 'msg-xb315bf2f67bbfb61', 'DRIVER_STATEMENT');
    expect(message?.level).toBe('STATED');
    expect(message?.subject).toBe('driver:drv-140');
    expect(message?.statement).toMatch(
      /^Driver drv-140 said \(driver chat, Wed 21 Oct 10:05 CEST\)/
    );
  });

  it('separates the customer promise from an OPS-selected slot', () => {
    expect(cd299.find((f) => f.kind === 'PROMISE_WINDOW')?.level).toBe('BOOKED');
    const slot = cd299.find((f) => f.kind === 'SLOT_WINDOW');
    expect(slot?.level).toBe('PLANNED');
    expect(slot?.statement).toContain('not customer approval');
    const systemPromise = facts('CD-420154').find((f) => f.kind === 'PROMISE_WINDOW');
    expect(systemPromise?.level).toBe('PLANNED');
  });

  it('turns the timed-out 299 booking into an unknown-outcome fact, not "not booked"', () => {
    const attempt = byRecord(cd299, 'agent-x4ac988b20000595f', 'BOOKING_OUTCOME_UNKNOWN');
    expect(attempt?.level).toBe('OBSERVED');
    expect(attempt?.observedAt.toISOString()).toBe('2026-10-21T07:10:00.000Z');
    expect(attempt?.statement).toContain('reconcile with the provider');
    expect(byRecord(cd299, 'agent-x4ac988b20000595f', 'PROPOSAL_REVIEW')?.statement).toContain(
      'Approved is not executed'
    );
  });

  it('labels site-profile confirmations, gate scans, tracking and alerts at their own level', () => {
    const access = cd299.find(
      (f) => f.kind === 'ENDPOINT_ACCESS' && f.subject === 'endpoint:PICKUP'
    );
    expect(access?.statement).toContain('not a call about this car');
    const gate = facts('CD-420342').filter((f) => f.kind === 'GATE_SCAN');
    expect(gate.map((f) => f.level)).toEqual(['OBSERVED', 'OBSERVED']);
    const tracking = facts('CD-420020').find((f) => f.kind === 'TRACKING_OBSERVATION');
    expect(tracking?.level).toBe('STATED');
    expect(cd299.find((f) => f.kind === 'ALERT')?.statement).toContain('not a diagnosis');
    expect(cd299.find((f) => f.kind === 'ALERT_ACKNOWLEDGED')?.statement).toContain(
      'the risk is not gone'
    );
  });

  it('extracts the driver stated limit (CD-420593 "another 30 minutes")', () => {
    const limit = facts('CD-420593').find((f) => f.kind === 'DRIVER_STATED_LIMIT');
    expect((limit?.value as { at: string }).at).toBe('2026-10-21T08:27:00.000Z');
  });

  it('flags non-EUR money', () => {
    const dkk = loadBahnDataset().expenses.find((e) => e.currency === 'DKK');
    const expense = byRecord(facts(dkk?.orderId as string), dkk?.id as string, 'EXPENSE');
    expect(expense?.statement).toContain('(not EUR)');
    expect((expense?.value as { isEur: boolean }).isEur).toBe(false);
  });

  it('is deterministic, deduplicated and uses only ladder kinds for all 100 orders', () => {
    const orders = loadBahnDataset().orders;
    expect(orders).toHaveLength(100);
    const keys = new Set<string>();
    for (const order of orders) {
      const first = facts(order.reference as string);
      const second = facts(order.reference as string);
      expect(second.map((f) => f.id)).toEqual(first.map((f) => f.id));
      for (const fact of first) {
        expect(FACT_KINDS).toHaveProperty(fact.kind);
        expect(fact.statement.length).toBeGreaterThan(10);
        expect(keys.has(fact.dedupeKey as string)).toBe(false);
        keys.add(fact.dedupeKey as string);
      }
    }
    expect(keys.size).toBeGreaterThan(2000);
  });
});
