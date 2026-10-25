import { describe, expect, it } from 'vitest';

import type { ChainResult } from '@/lib/chain/types';
import { checkOption } from '@/lib/playbooks/blocks/gate';
import { type ExpandedOption, expandOption } from '@/lib/playbooks/options';
import { assertNoForbiddenAdvice } from '@/mcp/tools/conversation';
import { VEHICLE_TEMPLATES } from '@/playbooks/vehicle-warning/templates';

const chain = {
  feasible: true,
  warnings: [],
  promise: { verdict: 'unknown' },
} as unknown as ChainResult;

const holdOption = (message: string): ExpandedOption =>
  expandOption({
    templates: VEHICLE_TEMPLATES,
    option: {
      id: 'A',
      template: 'WAIT_FOR_OWNER',
      slots: {
        driverMessage: message,
        ownerMessage:
          'Your car is stopped at the reported place and the driver is safe. Today’s delivery window is at risk; we will call you about the next step.',
      },
      detail: 'The driver waits with the car.',
      factIds: [],
    },
  });

describe('vehicle-warning: no mechanical advice (G4)', () => {
  it('blocks restart advice when the gate step forces the vehicle-warning context', () => {
    const result = checkOption({
      option: holdOption('Please try restarting the car once and send us the location.'),
      chain,
      facts: [],
      now: new Date('2026-10-21T09:41:00Z'),
      orderId: 'ord-00145',
      orderRef: 'CD-420145',
      context: { vehicleWarning: true },
    });
    expect(result.violations.map((violation) => violation.ruleId)).toContain('G4');
  });

  it('lets a hold instruction through', () => {
    const result = checkOption({
      option: holdOption(
        'Please keep the car stopped and do not drive further; we will tell you who is coming.'
      ),
      chain,
      facts: [],
      now: new Date('2026-10-21T09:41:00Z'),
      orderId: 'ord-00145',
      orderRef: 'CD-420145',
      context: { vehicleWarning: true },
    });
    expect(result.violations).toEqual([]);
  });

  it('ask_driver refuses to send driving advice but allows "do not restart"', () => {
    expect(() => assertNoForbiddenAdvice('It is safe to continue, just drive on slowly.')).toThrow(
      /G4/
    );
    expect(() =>
      assertNoForbiddenAdvice('Are you safe? Please do not restart the engine or drive further.')
    ).not.toThrow();
  });
});
