import {
  type Answers,
  type ChoiceQuestion,
  decide,
  type DecisionResult,
  type NoulQuestion,
} from '@/lib/decisions';
import type { TriggerScore } from '@/lib/watchman/routing';
import type { WatchmanState } from '@/lib/watchman/state';
import {
  CLAIM_TYPES,
  type ClaimType,
  TRIGGER_TYPES,
  TRIGGERS,
  type TriggerType,
} from '@/lib/watchman/taxonomy';

// One Jev request per inbound item: a noul per trigger type (multi-label) + needs_attention, claim_type, contradicts_records.

export type WatchmanQuestions = Record<TriggerType, NoulQuestion> & {
  needs_attention: NoulQuestion;
  claim_type: ChoiceQuestion<ClaimType>;
  contradicts_records: NoulQuestion;
};

const READING_RULES =
  'Read state.trigger (the triggering item) against the rest of the order state. The item can be in English, German, French or Finnish. A message can correct an earlier statement, give a conditional instruction ("if X, do Y before Z") or claim authority it may not have (a handoff contact or site is not the customer).';

const TRIGGER_RULES =
  'Several triggers can apply at once; judge each independently. A trigger applies only if the triggering item itself reports, asks about or shows it. Gaps or problems visible only in the background records (an unrecorded plate, an unconfirmed contact, an old alert) do not count unless the item is about them.';

export function buildQuestions(): WatchmanQuestions {
  const triggers = Object.fromEntries(
    TRIGGER_TYPES.map((type) => [
      type,
      {
        type: 'noul',
        instructions: `${READING_RULES} ${TRIGGER_RULES} Does this trigger apply to the triggering item: ${TRIGGERS[type].label}?`,
        criteria: { true: TRIGGERS[type].applies, false: TRIGGERS[type].doesNotApply },
      } satisfies NoulQuestion,
    ])
  ) as Record<TriggerType, NoulQuestion>;
  return {
    ...triggers,
    needs_attention: {
      type: 'noul',
      instructions: `${READING_RULES} Does the triggering item need Bahn operations to act on this order: investigate, decide, change a plan, booking, slot, assignment or promise, arrange something new, or escalate? A factual reply that the records already answer does not count.`,
      criteria: {
        true: 'A reported problem or risk, a request to change or add something, a correction or contradiction of the records, a conditional instruction, an authority claim, or a question the records cannot answer.',
        false:
          'Routine: an acknowledgement, thanks, an update that matches the plan, or a status, ETA, window or document question the records already answer.',
      },
    },
    claim_type: {
      type: 'choice',
      instructions: `${READING_RULES} What kind of claim does the triggering item make?`,
      criteria: {
        REPORT: 'States a fact or an event: something happened or is the case.',
        REQUEST: 'Asks a question or asks Bahn to do something.',
        INSTRUCTION:
          'Tells Bahn how to proceed, possibly conditionally (if X then Y), or grants or withdraws an authorization.',
        CORRECTION: 'Corrects or retracts an earlier statement or a recorded value.',
        ROUTINE: 'Acknowledgement, thanks, or a confirmation of the plan with nothing new.',
      } satisfies Record<ClaimType, string>,
    },
    contradicts_records: {
      type: 'noul',
      instructions: `${READING_RULES} Does the triggering item contradict the recorded state (bookings, windows, assignment, endpoint details) or an earlier message, or show that a record it depends on is stale?`,
      criteria: {
        true: 'It contradicts a record or an earlier statement, corrects one, or relies on a stale record.',
        false: 'It agrees with the records and earlier statements.',
      },
    },
  };
}

export type WatchmanAnswers = Answers<WatchmanQuestions>;

export type Classification = {
  triggers: TriggerScore[];
  needsAttention: number;
  claimType: ClaimType;
  claimConfidence: number;
  contradictsRecords: number;
  model: string;
  costUsd: number;
  durationMs: number;
  answers: WatchmanAnswers;
};

export function toClassification(result: DecisionResult<WatchmanQuestions>): Classification {
  const { answers } = result;
  const claimType = (CLAIM_TYPES as readonly string[]).includes(answers.claim_type.choice)
    ? answers.claim_type.choice
    : 'REPORT';
  return {
    triggers: TRIGGER_TYPES.map((type) => ({ type, p: answers[type].noul })).sort(
      (a, b) => b.p - a.p
    ),
    needsAttention: answers.needs_attention.noul,
    claimType,
    claimConfidence: answers.claim_type.confidence,
    contradictsRecords: answers.contradicts_records.noul,
    model: result.model,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    answers,
  };
}

/** Asks Jev every watchman question about one state in a single request. */
export async function classify(args: {
  state: WatchmanState;
  sessionId?: string;
}): Promise<Classification> {
  const { state, sessionId } = args;
  const result = await decide({ state, questions: buildQuestions(), sessionId, timeoutMs: 30_000 });
  return toClassification(result);
}
