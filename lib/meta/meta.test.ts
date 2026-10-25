import { describe, expect, it } from 'vitest';

import { compactOutput } from '@/lib/meta/judge';
import { describeCorrection, inCurrentShape } from '@/lib/meta/load';
import { applyRoutingOverrides } from '@/lib/meta/params';
import { promptWithAmendment, recordedToolCalls, replayPrompt } from '@/lib/meta/replay';
import { checkParameters, parameterWhitelist } from '@/lib/meta/whitelist';
import { outputJsonSchema } from '@/lib/playbooks/blocks/agent';
import type { CardOption, CardOptionsPayload } from '@/lib/playbooks/types';
import { ROUTING_PARAMS } from '@/lib/watchman/routing';
import { missedConnectionDefinition } from '@/playbooks/missed-connection/playbook';

const PROMPT = [
  '# Task: Find sailings',
  'Prepare at most three options.',
  '## Context (JSON)',
  '```json',
  '{}',
  '```',
  'Use the tools for anything not in the context. Return your answer through the structured output tool.',
].join('\n\n');

describe('promptWithAmendment', () => {
  it('adds an amendments section before the context, like the runtime', () => {
    const out = promptWithAmendment({ prompt: PROMPT, text: 'Ask the customer first.' });
    expect(out.indexOf('## Approved amendments (chief dispatcher)')).toBeLessThan(
      out.indexOf('## Context (JSON)')
    );
    expect(out).toContain('- Ask the customer first. _(amendment under test)_');
  });

  it('appends to an existing amendments section', () => {
    const once = promptWithAmendment({ prompt: PROMPT, text: 'First.' });
    const twice = promptWithAmendment({ prompt: once, text: 'Second.' });
    expect(twice.match(/## Approved amendments/g)).toHaveLength(1);
    expect(twice.indexOf('First.')).toBeLessThan(twice.indexOf('Second.'));
    expect(twice.indexOf('Second.')).toBeLessThan(twice.indexOf('## Context (JSON)'));
  });
});

describe('replay', () => {
  const transcript = [
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 't1', name: 'mcp__control__search_ferries', input: { a: 1 } },
          { type: 'tool_use', id: 't2', name: 'StructuredOutput', input: {} },
        ],
      },
    },
    {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: [{ type: 'text', text: '{"factIds":["f_1"]}' }],
          },
        ],
      },
    },
  ];

  it('extracts recorded tool calls without the structured output call', () => {
    expect(recordedToolCalls(transcript)).toEqual([
      { tool: 'search_ferries', input: { a: 1 }, result: '{"factIds":["f_1"]}', isError: false },
    ]);
  });

  it('switches tools off and inlines the recorded results', () => {
    const out = replayPrompt({ prompt: PROMPT, calls: recordedToolCalls(transcript) });
    expect(out).not.toContain('Use the tools for anything not in the context');
    expect(out).toContain('## Replay mode (backtest)');
    expect(out).toContain('search_ferries({"a":1})');
  });
});

describe('parameter whitelist', () => {
  it('collects gate, routing and declared params for missed-connection', () => {
    const keys = parameterWhitelist(missedConnectionDefinition).map((spec) => spec.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'quoteBlockMinutes',
        'quoteWarnMinutes',
        'routing.CROSSING_CAPACITY.threshold',
        'earlyCustodyHours',
      ])
    );
  });

  it('rejects unknown keys, out-of-range values and warn ≥ block', () => {
    const check = (parameters: Record<string, number>) =>
      checkParameters({ definition: missedConnectionDefinition, parameters, current: {} });
    expect(check({ quoteBlockMinutes: 120 }).ok).toBe(true);
    expect(check({ somethingElse: 1 }).ok).toBe(false);
    expect(check({ quoteBlockMinutes: 5 }).ok).toBe(false);
    expect(check({ quoteWarnMinutes: 100 }).ok).toBe(false);
  });
});

describe('applyRoutingOverrides', () => {
  it('overrides one trigger threshold and leaves the base untouched', () => {
    const next = applyRoutingOverrides({
      parameters: {
        'routing.CROSSING_CAPACITY.threshold': 0.85,
        'routing.needsAttentionThreshold': 0.6,
      },
    });
    expect(next.triggers.CROSSING_CAPACITY.threshold).toBe(0.85);
    expect(next.needsAttentionThreshold).toBe(0.6);
    expect(ROUTING_PARAMS.triggers.CROSSING_CAPACITY.threshold).toBe(0.7);
  });
});

describe('describeCorrection', () => {
  const option = (id: string, recommended: boolean): CardOption =>
    ({
      id,
      label: `Option ${id}`,
      recommended,
      actions: [
        { id: `${id}1`, actionClass: 'CUSTOMER_MESSAGE', description: 'Ask', message: 'Hi' },
      ],
    }) as CardOption;
  const options = { items: [option('A', true), option('B', false)] } as CardOptionsPayload;

  it('names the chosen option, the note and the edits', () => {
    const text = describeCorrection({
      decision: {
        action: 'edit',
        optionId: 'B',
        note: 'ask first',
        edits: { messages: { B1: 'Hello' } },
        decidedBy: 'damir',
      },
      options,
    });
    expect(text).toContain('“ask first”');
    expect(text).toContain('chose option B');
    expect(text).toContain('“Hi” → “Hello”');
  });
});

describe('meta reads template answers', () => {
  const block = missedConnectionDefinition.blocks.find(
    (candidate) => candidate.id === 'find_options'
  )!;
  const output = {
    situation: 'The 09:30 sailing is sold out.',
    options: [
      {
        id: 'A',
        template: 'REBOOK_ASK_EARLY_DELIVERY',
        slots: {
          newSailing: { quoteFactId: 'f_ferry', replaces: [] },
          bookings: [],
          cancellations: ['res-hotel'],
          driverMessage: 'Your plan: ferry Sat 14:00 CEST.',
          customerMessage: 'Would an earlier delivery on Sunday suit you?',
        },
        detail: 'Arrives a day early.',
        factIds: [],
      },
    ],
    recommendation: { optionId: 'A', why: 'No hotel nights.' },
    agentWillNot: [],
    driverAt: null,
  };

  it('the judge sees the steps the template builds, with their exact texts', () => {
    const compact = compactOutput({ block, output }) as {
      options: { template: string; actions: string[] }[];
    };
    expect(compact.options[0].template).toBe('REBOOK_ASK_EARLY_DELIVERY');
    expect(compact.options[0].actions).toEqual([
      'BOOK_TRAVEL — Book the new sailing',
      'CANCEL_TRAVEL — Cancel a booked leg the new plan no longer uses (only after every booking succeeded) — cancels: res-hotel',
      'INSTRUCT_CHANGE — Send the driver the new plan with the references — text: “Your plan: ferry Sat 14:00 CEST.”',
      'CUSTOMER_MESSAGE — Ask the customer whether an earlier delivery suits them — text: “Would an earlier delivery on Sunday suit you?”',
    ]);
  });

  it('replays only runs recorded in the block’s current output shape', () => {
    const current = outputJsonSchema(block.outputSchema!);
    const reordered = Object.fromEntries(Object.entries(current).reverse());
    const input = (jsonSchema: Record<string, unknown>) => ({
      systemPrompt: '',
      prompt: '',
      model: 'sonnet',
      tools: [],
      jsonSchema,
      feedback: null,
    });
    expect(inCurrentShape({ input: input(reordered), block })).toBe(true);
    expect(inCurrentShape({ input: input({ type: 'object', properties: {} }), block })).toBe(false);
  });
});
