import { jevDecisionModel } from '@/lib/decisions/adapters/jev';

// Free-form guidance accepted by the decision model: plain text or structured JSON.
export type Guidance = string | Record<string, unknown> | readonly unknown[];

export type NoulQuestion = {
  type: 'noul';
  instructions: Guidance;
  criteria: { true: Guidance; false: Guidance };
};

export type ChoiceQuestion<Option extends string = string> = {
  type: 'choice';
  instructions: Guidance;
  criteria: Record<Option, Guidance>;
};

export type ScoreQuestion = {
  type: 'score';
  instructions: Guidance;
  criteria: readonly Guidance[];
};

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type Questions = Record<string, Question>;

export type NoulAnswer = { type: 'noul'; noul: number };

export type ChoiceAnswer<Option extends string = string> = {
  type: 'choice';
  choice: Option;
  confidence: number;
  probabilities: Record<Option, number>;
};

export type ScoreAnswer = {
  type: 'score';
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  legend: Record<string, string>;
};

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type AnswerFor<Q extends Question> = Q extends NoulQuestion
  ? NoulAnswer
  : Q extends ChoiceQuestion<infer Option>
    ? ChoiceAnswer<Option>
    : ScoreAnswer;

export type Answers<Q extends Questions> = { [K in keyof Q]: AnswerFor<Q[K]> };

export type DecideArgs<Q extends Questions> = {
  state: unknown;
  questions: Q;
  model?: string;
  sessionId?: string;
  timeoutMs?: number;
};

export type DecisionResult<Q extends Questions> = {
  answers: Answers<Q>;
  model: string;
  id: string | null;
  costUsd: number;
  durationMs: number;
  raw: unknown;
};

export type DecisionModel = {
  id: string;
  decide: <Q extends Questions>(args: DecideArgs<Q>) => Promise<DecisionResult<Q>>;
};

const registry: Record<string, DecisionModel> = {
  [jevDecisionModel.id]: jevDecisionModel,
};

export function getDecisionModel(id = process.env.DECISION_MODEL ?? 'jev'): DecisionModel {
  const model = registry[id];
  if (!model) throw new Error(`Unknown decision model adapter: ${id}`);
  return model;
}

// Keeps literal option names when questions are declared outside a decide() call.
export function defineQuestions<const Q extends Questions>(questions: Q): Q {
  return questions;
}

export async function decide<const Q extends Questions>(
  args: DecideArgs<Q> & { adapter?: string }
): Promise<DecisionResult<Q>> {
  const { adapter, ...rest } = args;
  return getDecisionModel(adapter).decide(rest);
}
