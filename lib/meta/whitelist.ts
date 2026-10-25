// The only parameters a PARAMETER amendment may change, collected from the code's own parameter objects.

import { DEFAULT_CHAIN_PARAMETERS } from '@/lib/chain/types';
import { DEFAULT_GATE_PARAMETERS } from '@/lib/gate/params';
import type { ParameterSpec } from '@/lib/meta/types';
import { listPlaybooks } from '@/lib/playbooks/registry';
import type { PlaybookDefinition } from '@/lib/playbooks/types';
import { ROUTING_PARAMS } from '@/lib/watchman/routing';
import { TRIGGERS, type TriggerType } from '@/lib/watchman/taxonomy';

const declared = (definition: PlaybookDefinition, key: string, fallback: number): number => {
  const value = definition.params?.[key]?.default;
  return typeof value === 'number' ? value : fallback;
};

function gateSpecs(definition: PlaybookDefinition): ParameterSpec[] {
  return [
    {
      key: 'quoteBlockMinutes',
      label: 'A quote older than this cannot be booked (rule G5)',
      unit: 'minutes',
      min: 30,
      max: 240,
      default: declared(definition, 'quoteBlockMinutes', DEFAULT_GATE_PARAMETERS.quoteBlockMinutes),
      source: 'gate',
      appliedBy: 'The rule check blocks options that would book an older quote.',
    },
    {
      key: 'quoteWarnMinutes',
      label: 'A quote older than this shows a warning on the card (rule G5)',
      unit: 'minutes',
      min: 15,
      max: 180,
      default: declared(definition, 'quoteWarnMinutes', DEFAULT_GATE_PARAMETERS.quoteWarnMinutes),
      source: 'gate',
      appliedBy: 'The rule check warns on options that rest on an older quote.',
    },
  ];
}

function waitSpecs(definition: PlaybookDefinition): ParameterSpec[] {
  return definition.blocks.flatMap((block) =>
    block.kind === 'wait' && block.wait
      ? [
          {
            key: `${block.id}.defaultMinutes`,
            label: `“${block.title}”: longest wait`,
            unit: 'minutes' as const,
            min: 5,
            max: 720,
            default: block.wait.defaultMinutes,
            source: 'wait' as const,
            appliedBy: 'The wait step sleeps at most this long.',
          },
          {
            key: `${block.id}.bufferMinutes`,
            label: `“${block.title}”: wake up this long before the next commitment`,
            unit: 'minutes' as const,
            min: 0,
            max: 240,
            default: block.wait.bufferMinutes,
            source: 'wait' as const,
            appliedBy: 'The wait step never sleeps past the next commitment minus this buffer.',
          },
        ]
      : []
  );
}

function routingSpecs(definition: PlaybookDefinition): ParameterSpec[] {
  return definition.triggers.flatMap((trigger) => {
    const route = ROUTING_PARAMS.triggers[trigger as TriggerType];
    if (!route) return [];
    return [
      {
        key: `routing.${trigger}.threshold`,
        label: `How sure the watchman must be that a message means “${TRIGGERS[trigger as TriggerType].label.toLowerCase()}” before starting this playbook`,
        unit: 'probability' as const,
        min: 0.5,
        max: 0.99,
        default: route.threshold,
        source: 'routing' as const,
        appliedBy: 'The watchman’s router compares Jev’s probability with it.',
      },
    ];
  });
}

const PLAYBOOK_PARAM_BOUNDS: Record<string, Pick<ParameterSpec, 'min' | 'max' | 'appliedBy'>> = {
  earlyCustodyHours: {
    min: 2,
    max: 72,
    appliedBy: 'The chain calculator marks an arrival this early as needing custody.',
  },
  decisionMarginMinutes: {
    min: 0,
    max: 240,
    appliedBy: 'The decision card stays open this long after its decide-by time.',
  },
  maxOptions: { min: 1, max: 3, appliedBy: 'Shown to the agent as the most options to prepare.' },
};

function playbookSpecs(definition: PlaybookDefinition, taken: Set<string>): ParameterSpec[] {
  return Object.entries(definition.params ?? {}).flatMap(([key, param]) => {
    if (taken.has(key) || typeof param.default !== 'number') return [];
    const bounds = PLAYBOOK_PARAM_BOUNDS[key];
    const unit = /minutes$/i.test(key) ? 'minutes' : /hours$/i.test(key) ? 'hours' : 'count';
    return [
      {
        key,
        label: param.description,
        unit,
        min: bounds?.min ?? 0,
        max: bounds?.max ?? Math.max(1, param.default * 4),
        default: param.default,
        source: key in DEFAULT_CHAIN_PARAMETERS ? 'chain' : 'playbook',
        appliedBy: bounds?.appliedBy ?? 'Read by this playbook’s steps.',
      } satisfies ParameterSpec,
    ];
  });
}

/** Whitelisted parameters for one playbook: gate thresholds, wait timings, routing thresholds, declared params. */
export function parameterWhitelist(definition: PlaybookDefinition): ParameterSpec[] {
  const specs = [...gateSpecs(definition), ...waitSpecs(definition), ...routingSpecs(definition)];
  return [...specs, ...playbookSpecs(definition, new Set(specs.map((spec) => spec.key)))];
}

/** Every playbook's whitelist, keyed by playbook id (rebuilt from the registry, so new playbooks join). */
export function listParameterWhitelists(): Record<string, ParameterSpec[]> {
  return Object.fromEntries(listPlaybooks().map((p) => [p.id, parameterWhitelist(p)]));
}

export type ParameterCheck = { ok: true } | { ok: false; reason: string };

/** A proposed change is valid when every key is whitelisted and in range, and warn < block for quotes. */
export function checkParameters(args: {
  definition: PlaybookDefinition;
  parameters: Record<string, number>;
  current: Record<string, unknown>;
}): ParameterCheck {
  const { definition, parameters, current } = args;
  const specs = new Map(parameterWhitelist(definition).map((spec) => [spec.key, spec]));
  for (const [key, value] of Object.entries(parameters)) {
    const spec = specs.get(key);
    if (!spec) return { ok: false, reason: `${key} is not a whitelisted parameter` };
    if (!Number.isFinite(value) || value < spec.min || value > spec.max)
      return { ok: false, reason: `${key} = ${value} is outside ${spec.min}–${spec.max}` };
  }
  const merged = { ...current, ...parameters };
  const block = Number(merged.quoteBlockMinutes ?? DEFAULT_GATE_PARAMETERS.quoteBlockMinutes);
  const warn = Number(merged.quoteWarnMinutes ?? DEFAULT_GATE_PARAMETERS.quoteWarnMinutes);
  if (warn >= block)
    return { ok: false, reason: 'quoteWarnMinutes must stay below quoteBlockMinutes' };
  return { ok: true };
}

/** Current value of a whitelisted key: approved amendments over the code default. */
export function currentValue(args: {
  spec: ParameterSpec;
  params: Record<string, unknown>;
}): number {
  const { spec, params } = args;
  const value = params[spec.key];
  return typeof value === 'number' && Number.isFinite(value) ? value : spec.default;
}
