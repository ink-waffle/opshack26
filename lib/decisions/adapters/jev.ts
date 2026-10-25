import type {
  Answers,
  DecideArgs,
  DecisionModel,
  DecisionResult,
  Questions,
} from '@/lib/decisions';

const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const DEFAULT_MODEL = '~typesafe/jev-latest';
const DEFAULT_TIMEOUT_MS = 20_000;

type JevResponse = {
  id?: string;
  model: string;
  answers: Record<string, unknown>;
  usage?: { cost?: number; input_tokens?: number; output_tokens?: number };
};

class JevHttpError extends Error {
  constructor(
    readonly status: number,
    body: string
  ) {
    super(`Jev HTTP ${status}: ${body.slice(0, 500)}`);
  }
}

const isRetryable = (error: unknown) =>
  !(error instanceof JevHttpError) || error.status === 429 || error.status >= 500;

async function callJev(args: { body: unknown; timeoutMs: number }): Promise<JevResponse> {
  const { body, timeoutMs } = args;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new JevHttpError(response.status, text);
  return JSON.parse(text) as JevResponse;
}

async function decide<Q extends Questions>(args: DecideArgs<Q>): Promise<DecisionResult<Q>> {
  const { state, questions, model, sessionId, timeoutMs = DEFAULT_TIMEOUT_MS } = args;
  const body = {
    model: model ?? process.env.JEV_MODEL ?? DEFAULT_MODEL,
    state,
    questions,
    ...(sessionId ? { session_id: sessionId.slice(0, 256) } : {}),
  };
  const startedAt = Date.now();
  let response: JevResponse;
  try {
    response = await callJev({ body, timeoutMs });
  } catch (error) {
    if (!isRetryable(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 750));
    response = await callJev({ body, timeoutMs });
  }
  const missing = Object.keys(questions).filter((key) => !(key in (response.answers ?? {})));
  if (missing.length > 0)
    throw new Error(`Jev response is missing answers for: ${missing.join(', ')}`);
  return {
    answers: response.answers as Answers<Q>,
    model: response.model,
    id: response.id ?? null,
    costUsd: response.usage?.cost ?? 0,
    durationMs: Date.now() - startedAt,
    raw: response,
  };
}

export const jevDecisionModel: DecisionModel = { id: 'jev', decide };
