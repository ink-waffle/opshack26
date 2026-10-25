// Tunable thresholds; the meta-system overrides these via amendments of kind PARAMETER.

export type GateParameters = {
  quoteBlockMinutes: number;
  quoteWarnMinutes: number;
};

export const DEFAULT_GATE_PARAMETERS: GateParameters = {
  quoteBlockMinutes: 90,
  quoteWarnMinutes: 60,
};

export function gateParameters(overrides?: Partial<GateParameters>): GateParameters {
  return { ...DEFAULT_GATE_PARAMETERS, ...(overrides ?? {}) };
}
