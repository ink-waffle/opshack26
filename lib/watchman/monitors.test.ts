import { beforeAll, describe, expect, it } from 'vitest';

import {
  type MonitorBundle,
  type MonitorHit,
  parseMonitorKey,
  runMonitors,
} from '@/lib/watchman/monitors';
import { loadMonitorBundles, SNAPSHOT_AT } from '@/lib/watchman/testing/dataset';

// Expected hits at the snapshot (2026-10-21T09:00Z) from decision_tree.md §4.1 / evaluation.md §3.4.
const EXPECTED = {
  M1: ['CD-420075', 'CD-420324', 'CD-420439', 'CD-420603'],
  M2: ['CD-420593'],
  // The backtest also lists CD-420735, which started at 07:33 (1.5 h of no tracking); it fires at 10:34.
  M8: ['CD-420322', 'CD-420806', 'CD-421013'],
  M10: ['CD-420154', 'CD-420299', 'CD-420360'],
};

let bundles: MonitorBundle[];
let hits: MonitorHit[];

const refsOf = (monitor: string) =>
  [...new Set(hits.filter((h) => h.monitor === monitor).map((h) => h.orderRef))].sort();

describe('watchman monitors at the snapshot', () => {
  beforeAll(async () => {
    bundles = await loadMonitorBundles();
    hits = bundles.flatMap((bundle) => runMonitors({ bundle, now: SNAPSHOT_AT }));
  });

  it('loads every order', () => {
    expect(bundles).toHaveLength(100);
  });

  it('M1 flags the four ferries with a cutoff within 6 h and no gate check-in', () => {
    expect(refsOf('M1')).toEqual(EXPECTED.M1);
    expect(hits.every((h) => h.monitor !== 'M1' || h.triggerType === 'CROSSING_AT_RISK')).toBe(
      true
    );
  });

  it('M2 flags CD-420593: slot 06:00–08:00 ended, assignment not started, no pickup', () => {
    expect(refsOf('M2')).toEqual(EXPECTED.M2);
    const m2 = hits.find((h) => h.monitor === 'M2');
    expect(m2?.triggerType).toBe('PICKUP_NOT_CONFIRMED');
    expect(m2?.detail.phase).toBe('ended');
  });

  it('M8 flags the stale (322, 806) and the never-tracked (1013) moves', () => {
    expect(refsOf('M8')).toEqual(EXPECTED.M8);
  });

  it('M8 flags CD-420735 once it has gone 3 h since start without tracking', () => {
    const bundle = bundles.find((b) => b.order.reference === 'CD-420735')!;
    const later = runMonitors({ bundle, now: new Date('2026-10-21T10:34:00Z'), only: ['M8'] });
    expect(later.map((h) => h.key)).toEqual(['M8:ord-00735:asg-xfda77544f42fc3fe:none']);
  });

  it('M10 flags the three sold-out crossings with slack vs promise', () => {
    expect(refsOf('M10')).toEqual(EXPECTED.M10);
    const slack = Object.fromEntries(
      hits.filter((h) => h.monitor === 'M10').map((h) => [h.orderRef, h.detail.slackHours])
    );
    expect(slack).toEqual({ 'CD-420154': 20, 'CD-420299': 42, 'CD-420360': 73 });
  });

  it('produces stable, parseable dedupe keys with no duplicates', () => {
    const keys = hits.map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const h of hits) expect(parseMonitorKey(h.key)).toMatchObject({ orderId: h.orderId });
  });

  it('M2 fires for an upcoming slot once the clock passes its start, and not before', () => {
    const bundle = bundles.find((b) => b.order.reference === 'CD-420593');
    expect(bundle).toBeDefined();
    const before = new Date('2026-10-21T05:59:00Z');
    expect(runMonitors({ bundle: bundle!, now: before, only: ['M2'] })).toHaveLength(0);
    const during = runMonitors({
      bundle: bundle!,
      now: new Date('2026-10-21T06:30:00Z'),
      only: ['M2'],
    });
    expect(during[0]?.detail.phase).toBe('started');
    expect(during[0]?.key).toBe(hits.find((h) => h.monitor === 'M2')?.key);
  });

  it('ignores delivered and cancelled orders', () => {
    const inactive = bundles.filter(
      (b) => b.order.status === 'DELIVERED' || Boolean(b.order.cancelledAt)
    );
    expect(inactive.length).toBeGreaterThan(0);
    for (const bundle of inactive)
      expect(runMonitors({ bundle, now: SNAPSHOT_AT })).toHaveLength(0);
  });
});
