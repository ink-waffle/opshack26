// Meta-system contracts: what the proposer returns, what a backtest records, what a learning run reports.

import { z } from 'zod';

export type ParameterSource = 'gate' | 'chain' | 'wait' | 'routing' | 'playbook';

export type ParameterSpec = {
  key: string;
  // Plain words for the chief dispatcher.
  label: string;
  unit: 'minutes' | 'hours' | 'probability' | 'count';
  min: number;
  max: number;
  // Value in code before any amendment.
  default: number;
  source: ParameterSource;
  // Where the runtime reads it, in plain words.
  appliedBy: string;
};

export const proposedAmendmentSchema = z.object({
  kind: z.enum(['INSTRUCTION', 'PARAMETER']),
  blockId: z
    .string()
    .nullable()
    .describe('INSTRUCTION: the agent block whose instructions get the new text; else null.'),
  text: z
    .string()
    .nullable()
    .describe(
      'INSTRUCTION: one or two imperative sentences appended to the block instructions; general, no order refs, fact ids, names or dates. PARAMETER: null.'
    ),
  parameters: z
    .array(z.object({ key: z.string(), value: z.number() }))
    .nullable()
    .describe('PARAMETER: whitelisted keys and their new numeric values; else null.'),
  rationale: z
    .string()
    .describe(
      'One or two plain sentences for the chief dispatcher: what the operator corrected and why this generalises.'
    ),
});

export const proposerAnswerSchema = z.object({
  generalizes: z
    .boolean()
    .describe(
      'False when the correction is specific to this order and should not change the playbook.'
    ),
  reasoning: z.string().describe('Two or three sentences: what the operator changed and why.'),
  amendments: z.array(proposedAmendmentSchema).max(2),
});

export type ProposedAmendment = z.infer<typeof proposedAmendmentSchema>;
export type ProposerAnswer = z.infer<typeof proposerAnswerSchema>;

export type BacktestCase = {
  kind: 'source' | 'regression' | 'bahn-proposal' | 'card-option' | 'signal' | 'wait';
  label: string;
  ref: string | null;
  before: number | string | boolean | null;
  after: number | string | boolean | null;
  // Plain sentence on what changed.
  note: string;
  ok: boolean;
};

export type Backtest = {
  kind: 'INSTRUCTION' | 'PARAMETER';
  cases: BacktestCase[];
  summary: string;
  // Keep-if-better: false means the candidate did not beat the baseline and was discarded.
  improved: boolean;
  costUsd: number;
  ranAt: string;
  // INSTRUCTION: earlier texts tried before this one (autoresearch loop), with their summaries.
  attempts?: { text: string; summary: string }[];
};

export type LearnResult = {
  cardId: string;
  skipped?: string;
  generalizes?: boolean;
  reasoning?: string;
  amendmentIds: string[];
  proposed: number;
  discarded: number;
  costUsd: number;
};
