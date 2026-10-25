// Playbook contracts: the same definition drives the runtime, the router and the catalog diagram.

import type { z } from 'zod';

import type { OrderBundle } from '@/lib/bahn';
import type { ItineraryLegStatus, ItineraryVerdict } from '@/lib/chain/itinerary/types';
import type { Amendment, Fact, PlaybookRun, RunStatus } from '@/lib/generated/prisma/client';
import type { OptionTemplate, PlanChange } from '@/lib/playbooks/templates/types';

export type BlockKind = 'deterministic' | 'agent' | 'wait' | 'human' | 'execute';

export type PlaybookPayload = {
  // Bahn order id ('ord-00299') or reference ('CD-420299').
  orderId: string;
  // Sent by the watchman for logs; the runtime resolves the order from orderId.
  orderRef?: string;
  signalId?: string | null;
  triggerType?: string | null;
  // Resume or attach to an existing control.playbook_runs row instead of creating one.
  playbookRunId?: string;
};

// A dated obligation the run must not sleep through, e.g. a paid departure or a check-in cutoff (sim time).
export type Commitment = { at: Date; reason: string };

export type Edge = {
  to: string;
  // Plain-language condition shown on the catalog diagram.
  label: string;
  // First edge whose `when` is true (or has no `when`) wins.
  when?: (ctx: RunContext) => boolean;
};

export type AgentModel = 'sonnet' | 'haiku' | 'opus';

export type BlockDefinition = {
  id: string;
  kind: BlockKind;
  title: string;
  description: string;
  // Run status while this block runs; defaults: human → AWAITING_DECISION, execute → EXECUTING, else unchanged.
  status?: RunStatus;
  // agent: instructions md path relative to the playbook folder, e.g. 'instructions/find-options.md'.
  instructions?: string;
  // agent: control MCP tool names (without the mcp__control__ prefix).
  tools?: string[];
  model?: AgentModel;
  timeoutMs?: number;
  maxBudgetUsd?: number;
  // agent: output contract (passed to the CLI as --json-schema, parsed with zod); deterministic: optional check.
  outputSchema?: z.ZodType;
  // agent: the closed option templates an options agent fills (rendered into its prompt and the catalog).
  templates?: OptionTemplate[];
  // agent: extra JSON merged into the prompt context.
  context?: (ctx: RunContext) => unknown;
  // deterministic / execute (execute defaults to the approved option's actions).
  run?: (ctx: RunContext) => Promise<unknown>;
  // wait: sleeps min(defaultMinutes, nextCommitment − bufferMinutes) of sim time.
  wait?: { defaultMinutes: number; bufferMinutes: number };
  nextCommitment?: (ctx: RunContext) => Promise<Commitment | null>;
  // human: builds the decision card; the block then waits on a waitpoint token.
  card?: (ctx: RunContext) => Promise<CardDraft>;
  next: Edge[];
};

export type PlaybookParam = {
  default: number | string | boolean;
  description: string;
};

export type Precondition = {
  id: string;
  description: string;
  check: (ctx: RunContext) => Promise<boolean>;
};

export type PlaybookDefinition = {
  id: string;
  title: string;
  summary: string;
  // Watchman trigger types routed here.
  triggers: string[];
  // Absolute or repo-relative folder holding rules.md and instructions/.
  folder: string;
  params?: Record<string, PlaybookParam>;
  preconditions: Precondition[];
  start: string;
  blocks: BlockDefinition[];
};

// What an agent already did on this run (tool calls), shown on the card.
export type AgentAction = {
  blockId: string;
  // The block run that made the call (a gate re-ask runs the block again under the same blockId).
  blockRunId?: string;
  tool: string;
  summary: string;
  input: unknown;
  factIds: string[];
  isError: boolean;
};

export type RunServices = {
  // Reload facts, sim now and the order bundle (after tools or waits changed them).
  refresh: () => Promise<void>;
  // Re-run an agent block with feedback appended (gate self-correction); returns the parsed output.
  rerunAgent: (args: { blockId: string; feedback: string }) => Promise<unknown>;
  log: (message: string, data?: unknown) => void;
};

export type RunContext = {
  run: PlaybookRun;
  playbook: PlaybookDefinition;
  payload: PlaybookPayload;
  // Bahn order id ('ord-00299') and reference ('CD-420299').
  orderId: string;
  orderRef: string;
  order: OrderBundle;
  facts: Fact[];
  outputs: Record<string, unknown>;
  // Playbook param defaults with approved PARAMETER amendments applied.
  params: Record<string, unknown>;
  // Approved INSTRUCTION amendments for this playbook (blockId null = whole playbook).
  instructions: Amendment[];
  agentActions: AgentAction[];
  simNow: Date;
  services: RunServices;
};

// ── Cards ──

export type CardAction = {
  id: string;
  // Action class from lib/gate (READ, ASK_DRIVER, BOOK_TRAVEL, CUSTOMER_MESSAGE, …).
  actionClass: string;
  description: string;
  // BOOK_TRAVEL: the QUOTED fact to book.
  quoteFactId?: string | null;
  // Messages: the exact text (customer text is a draft until the card is approved).
  message?: string | null;
  recipient?: 'driver' | 'site' | 'customer' | 'provider' | null;
  costCents?: number | null;
  // The template slots that filled this step (gate feedback names them).
  slot?: string;
  // CANCEL_TRAVEL: the booked leg to cancel (reservation id or booking fact id).
  target?: string | null;
  // BOOK_TRAVEL: booked legs (reservation ids or booking fact ids) this booking takes over.
  replaces?: string[];
};

// One leg of the remaining trip under an option, as the card lists it (keep / new / cancel with the verdict).
export type CardItineraryLeg = {
  ref: string | null;
  factId: string | null;
  kind: string;
  description: string;
  status: ItineraryLegStatus;
  verdict: ItineraryVerdict;
  reason: string;
  replacedBy: string | null;
};

// The itinerary checker's verdict on an option's whole remaining trip.
export type CardItinerary = { feasible: boolean; legs: CardItineraryLeg[]; violations: string[] };

export type GateViolation = { ruleId: string; message: string; severity?: 'block' | 'warn' };

export type CardOption = {
  id: string;
  label: string;
  detail: string;
  actions: CardAction[];
  factIds: string[];
  // lib/chain result for this option (promise slack, driver chain, bookings, cost, approvals).
  chain: unknown;
  slackMinutes: number | null;
  costLabel: string;
  costCents: number | null;
  // Who must agree (from the gate's action classes), e.g. ['operator'].
  approvers: string[];
  gate: { ok: boolean; violations: GateViolation[]; warnings: GateViolation[] };
  // Set when the option still violates a rule after the agent's one self-correction.
  blocked: { ruleId: string; message: string } | null;
  reversibility: string;
  recommended: boolean;
  // The template's plan change (e.g. REPLACE_DRIVER), so execute knows what must happen first.
  change?: PlanChange | null;
  // The whole remaining trip under this option, when the playbook checks itineraries (missed-connection).
  itinerary?: CardItinerary | null;
};

export type CardOptionsPayload = {
  items: CardOption[];
  recommendation: { optionId: string; why: string } | null;
  // Explicit blocked actions (G-rules), shown as "The agent will not".
  agentWillNot: string[];
  // Deterministic notes from the runtime, e.g. "G9 lock released: …" (optional for older cards).
  notes?: string[];
  // What the gate caught in the agent's first draft, in plain words (the agent then fixed or lost the option).
  caught?: string[];
};

export type CardDraft = {
  title: string;
  // At most 3 lines.
  summary: string;
  factIds: string[];
  options: CardOptionsPayload;
  decideBy?: Date | null;
  decideByReason?: string | null;
};

// Payload that completes a decision card's waitpoint token (UI and scripts send exactly this).
export type DecisionPayload = {
  action: 'approve' | 'edit' | 'reject';
  optionId?: string;
  edits?: {
    // Replace a message text by action id (e.g. the customer draft).
    messages?: Record<string, string>;
    // Drop actions by id.
    removeActionIds?: string[];
  };
  // Required on reject (it goes to the hand-over card); on edit only for the record, never carried out.
  note?: string;
  decidedBy: string;
};

export type HumanBlockOutput = {
  cardId: string;
  tokenId: string;
  expired: boolean;
  decision: DecisionPayload | null;
  // The chosen option as the card offered it (null on reject, expiry or an unknown option).
  offered: CardOption | null;
  // The chosen option with edits applied (null on reject, expiry or an unknown option).
  option: CardOption | null;
};
