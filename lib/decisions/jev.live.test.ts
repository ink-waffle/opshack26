import { describe, expect, it } from 'vitest';

import { decide } from '@/lib/decisions';

describe.skipIf(!process.env.OPENROUTER_API_KEY)('jev decision model (live)', () => {
  it('answers noul, choice and score questions about a Bahn-like state', async () => {
    const result = await decide({
      state: {
        order: 'CD-420299',
        message:
          'Driver: the 18:30 Tallinn-Helsinki ferry is sold out, I am at the port with the car.',
      },
      questions: {
        missedFerry: {
          type: 'noul',
          instructions: 'Will the car miss its planned ferry sailing?',
          criteria: {
            true: 'The planned sailing will not carry the car.',
            false: 'The car still sails as planned.',
          },
        },
        trigger: {
          type: 'choice',
          instructions: 'Which operational trigger applies?',
          criteria: {
            FERRY_DISRUPTION: 'Ferry missed, sold out or cancelled.',
            VEHICLE_WARNING: 'Warning light, damage or breakdown.',
            NONE: 'Nothing operational happened.',
          },
        },
        urgency: {
          type: 'score',
          instructions: 'How urgent is this?',
          criteria: ['Can wait', 'Today', 'Right now'],
        },
      },
    });
    expect(result.answers.missedFerry.noul).toBeGreaterThan(0.5);
    expect(result.answers.trigger.choice).toBe('FERRY_DISRUPTION');
    expect(result.answers.urgency.score).toBeGreaterThanOrEqual(0);
    expect(result.costUsd).toBeLessThan(0.01);
  }, 30_000);
});
