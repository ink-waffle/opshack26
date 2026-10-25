import { describe, expect, it } from 'vitest';

import {
  decideRoute,
  isAcknowledgement,
  PLAYBOOK_IDS,
  ROUTING_PARAMS,
  type TriggerScore,
} from '@/lib/watchman/routing';
import { TRIGGER_TYPES, TRIGGERS } from '@/lib/watchman/taxonomy';

const scores = (entries: Record<string, number>): TriggerScore[] =>
  Object.entries(entries).map(([type, p]) => ({ type: type as TriggerScore['type'], p }));

describe('watchman taxonomy and routing table', () => {
  it('defines every trigger type and gives each a route', () => {
    for (const type of TRIGGER_TYPES) {
      expect(TRIGGERS[type].id).toBe(type);
      expect(TRIGGERS[type].applies.length).toBeGreaterThan(20);
      expect(ROUTING_PARAMS.triggers[type]).toBeDefined();
    }
    expect(TRIGGER_TYPES).toContain('DATA_CONFLICT');
    expect(TRIGGER_TYPES).toContain('ROUTINE');
  });

  it('routes triggers only to the four built playbooks', () => {
    const routed = Object.fromEntries(
      Object.entries(ROUTING_PARAMS.triggers)
        .filter(([, route]) => route.playbookId)
        .map(([type, route]) => [type, route.playbookId])
    );
    expect(routed).toEqual({
      CROSSING_CAPACITY: PLAYBOOK_IDS.missedConnection,
      TRAVEL_LEG_LOST: PLAYBOOK_IDS.missedConnection,
      VEHICLE_WARNING: PLAYBOOK_IDS.vehicleWarning,
      PICKUP_NOT_CONFIRMED: PLAYBOOK_IDS.pickupUnconfirmed,
      DRIVER_CANNOT_MAKE_PICKUP: PLAYBOOK_IDS.driverUnavailable,
    });
  });
});

describe('decideRoute', () => {
  it('sends a sold-out / missed ferry message to missed-connection', () => {
    const decision = decideRoute({
      source: 'message',
      triggers: scores({ CROSSING_CAPACITY: 0.95, INFO_REQUEST: 0.6, ROUTINE: 0.05 }),
      needsAttention: 0.9,
    });
    expect(decision.action).toBe('playbook');
    expect(decision.playbooks.map((m) => m.playbookId)).toEqual(['missed-connection']);
    expect(decision.triggerType).toBe('CROSSING_CAPACITY');
  });

  it('sends a lost train, flight, bus or hotel to missed-connection', () => {
    const decision = decideRoute({
      source: 'message',
      triggers: scores({ TRAVEL_LEG_LOST: 0.93, DRIVER_CANNOT_MAKE_PICKUP: 0.3 }),
      needsAttention: 0.95,
    });
    expect(decision.action).toBe('playbook');
    expect(decision.playbooks.map((m) => m.playbookId)).toEqual(['missed-connection']);
    expect(decision.triggerType).toBe('TRAVEL_LEG_LOST');
  });

  it('runs missed-connection once when both of its triggers fire', () => {
    const decision = decideRoute({
      source: 'message',
      triggers: scores({ CROSSING_CAPACITY: 0.9, TRAVEL_LEG_LOST: 0.8 }),
      needsAttention: 0.95,
    });
    expect(decision.playbooks.map((m) => m.playbookId)).toEqual(['missed-connection']);
    expect(decision.triggerType).toBe('CROSSING_CAPACITY');
  });

  it('runs several playbooks for a multi-label item, best first', () => {
    const decision = decideRoute({
      source: 'message',
      triggers: scores({ CROSSING_CAPACITY: 0.8, VEHICLE_WARNING: 0.97 }),
      needsAttention: 0.99,
    });
    expect(decision.playbooks.map((m) => m.playbookId)).toEqual([
      'vehicle-warning',
      'missed-connection',
    ]);
  });

  it('opens a triage card for an uncovered message that needs attention', () => {
    const decision = decideRoute({
      source: 'message',
      triggers: scores({ INFO_REQUEST: 0.9, RELEASE_BLOCKED: 0.4 }),
      needsAttention: 0.93,
    });
    expect(decision.action).toBe('triage');
    expect(decision.labels.map((l) => l.type)).toEqual(['INFO_REQUEST']);
  });

  it('only records an uncovered message below the attention threshold', () => {
    const decision = decideRoute({
      source: 'message',
      triggers: scores({ ROUTINE: 0.9 }),
      needsAttention: 0.3,
    });
    expect(decision.action).toBe('record');
  });

  it('never opens a card for monitor hits without a playbook', () => {
    const decision = decideRoute({
      source: 'monitor',
      triggers: scores({ SIGNAL_GAP: 1 }),
      needsAttention: null,
    });
    expect(decision.action).toBe('record');
    expect(decision.triggerType).toBe('SIGNAL_GAP');
  });

  it('routes the M2 monitor hit to pickup-unconfirmed but needs P ≥ 0.8 from text', () => {
    expect(
      decideRoute({
        source: 'monitor',
        triggers: scores({ PICKUP_NOT_CONFIRMED: 1 }),
        needsAttention: null,
      }).playbooks[0]?.playbookId
    ).toBe('pickup-unconfirmed');
    expect(
      decideRoute({
        source: 'message',
        triggers: scores({ PICKUP_NOT_CONFIRMED: 0.75 }),
        needsAttention: 0.2,
      }).action
    ).toBe('record');
  });

  it('takes tuned parameters (meta-system)', () => {
    const params = {
      ...ROUTING_PARAMS,
      needsAttentionThreshold: 0.95,
      triggers: {
        ...ROUTING_PARAMS.triggers,
        VEHICLE_WARNING: { playbookId: 'vehicle-warning', threshold: 0.99 },
      },
    };
    const decision = decideRoute({
      source: 'message',
      triggers: scores({ VEHICLE_WARNING: 0.97 }),
      needsAttention: 0.9,
      params,
    });
    expect(decision.action).toBe('record');
  });
});

describe('triage fallback: only what a person needs to see', () => {
  const triage = (args: {
    triggers: Partial<Record<string, number>>;
    needsAttention: number;
    orderClosed?: boolean;
    acknowledgement?: boolean;
  }) =>
    decideRoute({
      source: 'message',
      triggers: Object.entries(args.triggers).map(([type, p]) => ({ type, p }) as TriggerScore),
      needsAttention: args.needsAttention,
      context: { orderClosed: args.orderClosed, acknowledgement: args.acknowledgement },
    }).action;

  it('needs needs_attention ≥ 0.8 (eval: recall 85.7 % on operator-acted messages)', () => {
    expect(triage({ triggers: { INFO_REQUEST: 0.9 }, needsAttention: 0.75 })).toBe('record');
    expect(triage({ triggers: { INFO_REQUEST: 0.9 }, needsAttention: 0.85 })).toBe('triage');
  });

  it('skips acknowledgements, routine items and quiet messages on delivered orders', () => {
    expect(
      triage({ triggers: { INFO_REQUEST: 0.9 }, needsAttention: 0.9, acknowledgement: true })
    ).toBe('record');
    expect(triage({ triggers: { ROUTINE: 0.95 }, needsAttention: 0.9 })).toBe('record');
    expect(
      triage({ triggers: { INFO_REQUEST: 0.9 }, needsAttention: 0.9, orderClosed: true })
    ).toBe('record');
    expect(
      triage({ triggers: { CONDITION_CLAIM: 0.9 }, needsAttention: 0.9, orderClosed: true })
    ).toBe('triage');
  });

  it('recognises plain acknowledgements only', () => {
    for (const text of ['Ok, thanks!', 'Thanks, will do.', 'OK', 'Noted 👍', 'Kiitos'])
      expect(isAcknowledgement(text), text).toBe(true);
    for (const text of [
      'Ok but the gate is closed',
      'Thanks. Where are the keys?',
      'Fine, cancel it',
    ])
      expect(isAcknowledgement(text), text).toBe(false);
  });
});
