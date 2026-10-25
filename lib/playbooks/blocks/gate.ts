// Gate step: chain calculator + guardrails for every proposed option, one self-correction rerun, then block what still fails.

import { computeChain } from '@/lib/chain/compute';
import {
  checkItinerary,
  DEFAULT_ITINERARY_PARAMETERS,
  type ItineraryResult,
  type ItineraryStart,
} from '@/lib/chain/itinerary';
import { type ChainResult, DEFAULT_CHAIN_PARAMETERS } from '@/lib/chain/types';
import { formatMoney } from '@/lib/evidence/time';
import { factValue } from '@/lib/facts';
import { checkProposal, GUARDRAILS, type Proposal } from '@/lib/gate';
import type { Fact } from '@/lib/generated/prisma/client';
import { numericOverrides } from '@/lib/playbooks/amendments';
import { brokenLegRefs, cardItinerary, itineraryChangeSet } from '@/lib/playbooks/itinerary';
import {
  type ExpandedOption,
  expandOption,
  type OptionsAnswer,
  toChainOption,
} from '@/lib/playbooks/options';
import type { OptionTemplate } from '@/lib/playbooks/templates/types';
import type {
  BlockDefinition,
  CardOption,
  Edge,
  GateViolation,
  RunContext,
} from '@/lib/playbooks/types';

export type GateStepOutput = {
  options: CardOption[];
  answer: OptionsAnswer;
  retried: boolean;
  firstPass: { optionId: string; violations: GateViolation[] }[];
  // What the rules caught in the first draft, in plain words (empty when the first draft passed).
  caught?: string[];
};

// A playbook that repairs a whole trip checks each option's remaining itinerary (G12); start: where the driver is now.
export type ItineraryCheck = {
  start: (args: { ctx: RunContext; answer: OptionsAnswer }) => ItineraryStart | undefined;
};

const MESSAGE_CLASSES = [
  'CUSTOMER_MESSAGE',
  'ASK_DRIVER',
  'INSTRUCT_CHANGE',
  'INSTRUCT_HOLD',
  'ASK_SITE',
];

/** An expanded option in the gate's proposal shape (every action a draft awaiting a yes). */
export function toProposal(args: {
  option: ExpandedOption;
  orderId: string;
  orderRef: string;
  context?: Proposal['context'];
}): Proposal {
  const { option, orderId, orderRef, context } = args;
  return {
    id: option.id,
    orderId,
    orderRef,
    summary: option.label,
    ...(context ? { context } : {}),
    actions: option.actions.map((action) => ({
      class: action.actionClass,
      summary: action.description,
      payload: {
        ...(action.quoteFactId ? { quote_fact_id: action.quoteFactId } : {}),
        ...(action.message ? { message: action.message } : {}),
        ...(action.target ? { reservation_id: action.target } : {}),
        ...(action.replaces.length ? { replaces: action.replaces } : {}),
      },
      evidenceFactIds: [
        ...new Set([...option.factIds, ...(action.quoteFactId ? [action.quoteFactId] : [])]),
      ],
      mode: 'draft' as const,
    })),
  };
}

/** lib/gate guardrails for one option, plus what only the runtime knows (chain, itinerary, exact texts, bookable quotes). */
export function checkOption(args: {
  option: ExpandedOption;
  chain: ChainResult;
  // The option's whole remaining trip, when the playbook checks itineraries.
  itinerary?: ItineraryResult | null;
  facts: Fact[];
  now: Date;
  orderId: string;
  orderRef: string;
  params?: Record<string, unknown>;
  context?: Proposal['context'];
}): { violations: GateViolation[]; warnings: GateViolation[]; approvals: string[] } {
  const { option, chain, itinerary, facts, now, orderId, orderRef, params, context } = args;
  const result = checkProposal({
    proposal: toProposal({ option, orderId, orderRef, context }),
    facts,
    now,
    parameters: {
      quoteBlockMinutes: Number(params?.quoteBlockMinutes ?? 90),
      quoteWarnMinutes: Number(params?.quoteWarnMinutes ?? 60),
    },
  });
  const label = (index: number | null) => (index === null ? '' : `${option.actions[index]?.id}: `);
  const violations: GateViolation[] = result.violations.map((v) => ({
    ruleId: v.ruleId,
    message: `${label(v.actionIndex)}${v.message}`,
  }));
  const warnings: GateViolation[] = result.warnings.map((w) => ({
    ruleId: w.ruleId,
    message: `${label(w.actionIndex)}${w.message}`,
    severity: 'warn',
  }));
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  for (const action of option.actions) {
    if (MESSAGE_CLASSES.includes(action.actionClass) && !action.message?.trim())
      violations.push({
        ruleId: 'G1',
        message: `${action.id}: ${action.actionClass} has no exact message text.`,
      });
    const quote = action.quoteFactId ? byId.get(action.quoteFactId) : undefined;
    if (
      action.actionClass === 'BOOK_TRAVEL' &&
      quote &&
      factValue<string>(quote, 'status') === 'SOLD_OUT'
    )
      violations.push({
        ruleId: 'G5',
        message: `${action.id}: ${quote.id} has no space at the check.`,
      });
    const closes = quote
      ? (factValue<string>(quote, 'checkInCutoffAt') ?? factValue<string>(quote, 'departureAt'))
      : null;
    if (
      action.actionClass === 'BOOK_TRAVEL' &&
      closes &&
      new Date(closes).getTime() <= now.getTime()
    )
      violations.push({
        ruleId: 'G5',
        message: `${action.id}: ${quote?.id} closed for check-in or departed at ${closes}, before now; it cannot be booked.`,
      });
  }
  if (itinerary && !itinerary.feasible)
    for (const message of itinerary.violations) violations.push({ ruleId: 'G12', message });
  for (const message of itinerary?.warnings ?? [])
    warnings.push({ ruleId: 'G12', message, severity: 'warn' });
  if (!chain.feasible)
    violations.push({
      ruleId: 'CHAIN',
      message: `Not feasible: ${chain.warnings.join(' ') || 'see the chain'}`,
    });
  for (const warning of chain.warnings)
    if (!warning.startsWith('G9') && !warning.includes('(G5)'))
      warnings.push({ ruleId: 'CHAIN', message: warning, severity: 'warn' });
  const approvals = [
    ...new Set(
      result.approvalsRequired.map((approval) =>
        approval.authority === 'HUMAN_ONLY' ? 'operator (money)' : 'operator'
      )
    ),
    ...(chain.promise.verdict === 'breaks' ? ['customer'] : []),
  ];
  return { violations, warnings, approvals };
}

function costOf(args: { option: ExpandedOption; facts: Fact[] }): {
  cents: number | null;
  label: string;
} {
  const { option, facts } = args;
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const parts: string[] = [];
  let total = 0;
  let known = true;
  for (const action of option.actions.filter((a) => a.actionClass === 'BOOK_TRAVEL')) {
    const quote = action.quoteFactId ? byId.get(action.quoteFactId) : undefined;
    const cents = quote ? factValue<number>(quote, 'quoteCents') : null;
    const mode = (quote && factValue<string>(quote, 'mode')?.toLowerCase()) ?? 'travel';
    if (cents === null) known = false;
    else {
      total += cents;
      parts.push(`${formatMoney({ cents, currency: 'EUR' })} ${mode}`);
    }
  }
  if (!parts.length) return { cents: null, label: 'No cost now' };
  const sum = formatMoney({ cents: total, currency: 'EUR' });
  return {
    cents: known ? total : null,
    label: `${parts.length > 1 ? `${sum} (${parts.join(' + ')})` : parts[0]}${known ? '' : ' + unknown'}`,
  };
}

/** The option's remaining trip, and the booked legs it may cancel: those broken or redundant before its own cancels. */
function optionItinerary(args: {
  ctx: RunContext;
  option: ExpandedOption;
  now: Date;
  start: ItineraryStart | undefined;
}): { result: ItineraryResult; brokenLegs: string[] } {
  const { ctx, option, now, start } = args;
  const changeSet = itineraryChangeSet(option.actions);
  const run = (cancel: string[]) =>
    checkItinerary({
      bundle: ctx.order,
      facts: ctx.facts,
      now,
      start,
      changeSet: { ...changeSet, cancel },
      parameters: numericOverrides({ params: ctx.params, defaults: DEFAULT_ITINERARY_PARAMETERS }),
    });
  return { result: run(changeSet.cancel ?? []), brokenLegs: brokenLegRefs(run([])) };
}

/** Expands each answered option by its template, then chain, itinerary + gate; returns card options (not yet blocked). */
export async function checkOptions(args: {
  ctx: RunContext;
  answer: OptionsAnswer;
  templates: OptionTemplate[];
  context?: Proposal['context'];
  itinerary?: ItineraryCheck;
}): Promise<CardOption[]> {
  const { ctx, answer, templates, context, itinerary } = args;
  // Facts this run's tools just wrote count as seen, even if their sim stamp is a moment past the last refresh;
  // so do simulated replies (projected from bahn.messages, no runId) stamped a second after a paused clock.
  const graceMs = ctx.simNow.getTime() + 60_000;
  const now = new Date(
    Math.max(
      ctx.simNow.getTime(),
      ...ctx.facts
        .filter((fact) => fact.runId === ctx.run?.id || fact.observedAt.getTime() <= graceMs)
        .map((fact) => fact.observedAt.getTime())
    )
  );
  const start = itinerary?.start({ ctx, answer });
  return answer.options.map((answered) => {
    const option = expandOption({ templates, option: answered });
    const trip = itinerary ? optionItinerary({ ctx, option, now, start }) : null;
    const chain = computeChain({
      bundle: ctx.order,
      facts: ctx.facts,
      option: toChainOption(option.change, ctx.facts),
      now,
      // Approved PARAMETER amendments (e.g. earlyCustodyHours) reach the chain calculator.
      parameters: numericOverrides({ params: ctx.params, defaults: DEFAULT_CHAIN_PARAMETERS }),
    });
    const { violations, warnings, approvals } = checkOption({
      option,
      chain,
      itinerary: trip?.result ?? null,
      facts: ctx.facts,
      now,
      orderId: ctx.orderId,
      orderRef: ctx.orderRef,
      params: ctx.params,
      context: trip ? { ...context, brokenLegs: trip.brokenLegs } : context,
    });
    const cost = costOf({ option, facts: ctx.facts });
    return {
      id: option.id,
      label: option.label,
      detail: option.detail,
      actions: option.actions,
      factIds: [
        ...new Set([...option.factIds, ...(chain.promise.factId ? [chain.promise.factId] : [])]),
      ],
      chain,
      slackMinutes:
        chain.promise.slackHours === null ? null : Math.round(chain.promise.slackHours * 60),
      costLabel: cost.label,
      costCents: cost.cents,
      approvers: approvals,
      gate: { ok: violations.length === 0, violations, warnings },
      blocked: null,
      reversibility: option.reversibility,
      recommended: option.id === answer.recommendation.optionId,
      change: option.change,
      ...(trip ? { itinerary: cardItinerary(trip.result) } : {}),
    };
  });
}

/** The gate's findings for the re-ask; a step id names the template slots that filled it ("A2 (from driverMessage)"). */
export function renderViolations(options: CardOption[]): string {
  const withSlot = (option: CardOption, message: string) =>
    message.replace(/^([A-C]\d+):/, (match, actionId: string) => {
      const slot = option.actions.find((action) => action.id === actionId)?.slot;
      return slot ? `${actionId} (from ${slot}):` : match;
    });
  return [
    'The deterministic gate rejected parts of your previous answer. Fix every point by changing the slots, choose another template, or drop the option if it cannot be fixed:',
    ...options
      .filter((option) => !option.gate.ok)
      .map(
        (option) =>
          `Option ${option.id} (${option.label}):\n${option.gate.violations.map((v) => `- ${v.ruleId}: ${withSlot(option, v.message)}`).join('\n')}`
      ),
  ].join('\n\n');
}

const RULE_WORDS: Record<string, string> = {
  G1: 'every message is shown word for word before a yes, and customers hear from us only through an approved draft',
  G2: 'every commitment needs a person’s yes',
  G3: 'a claim needs a fact at the level it requires; a quote or a report never counts as a booking',
  G4: 'no mechanical advice, blame or other customers’ jobs',
  G6: 'the delivery promise changes only with the customer’s approval',
  G7: 'nothing is cancelled before its replacement is confirmed',
  G9: 'nothing is bought while an earlier attempt’s outcome is unknown',
  G11: 'every cited fact must be on file at the time of the decision',
  G12: 'no booked leg may be left broken: every leg the new plan breaks or makes redundant is replaced or cancelled',
  CHAIN: 'the plan must work out in the chain calculator',
};

const FACT_ID = /\s*\(?\b(?:f_[0-9a-f]{6,}|agent-x[0-9a-f]+)\b\)?/g;

function minutesWords(minutes: number): string {
  if (minutes < 120) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** One violation as "what the draft tried" plus the rule in plain words. */
export function plainViolation(args: { violation: GateViolation; quoteBlockMinutes?: number }): {
  what: string;
  rule: string;
} {
  const { violation, quoteBlockMinutes = 90 } = args;
  const message = violation.message.replace(/^[A-Z]\d+:\s*/, '');
  const id = violation.ruleId;
  if (id === 'G5') {
    const age = message.match(/is (\d+) min old/);
    const rule = `quotes older than ${quoteBlockMinutes} min must be re-checked before booking`;
    if (age)
      return { what: `tried to book from a quote ${minutesWords(Number(age[1]))} old`, rule };
    if (/sold out|no space/i.test(message))
      return {
        what: 'tried to book a sailing that was sold out at the check',
        rule: 'only a quote with space can be booked',
      };
    if (/closed for check-in|departed/i.test(message))
      return {
        what: 'tried to book travel that had already left',
        rule: 'only travel that has not left can be booked',
      };
    if (/first available/i.test(message))
      return {
        what: 'picked “the first available” crossing from an unchecked list',
        rule: 'book only the exact option that was just checked',
      };
    return { what: 'tried to book without a fresh quote', rule };
  }
  if (id === 'G9')
    return {
      what: 'tried to buy while an earlier booking attempt had an unknown outcome',
      rule: RULE_WORDS.G9,
    };
  if (id === 'G11')
    return {
      what: /after the decision time/.test(message)
        ? 'cited a fact recorded after the decision time'
        : 'cited a fact that is not on file',
      rule: RULE_WORDS.G11,
    };
  if (id === 'G3') {
    const label = message.match(/\("([^"]+)"\)/)?.[1];
    return {
      what: label
        ? `claimed “${label}” without the evidence for it`
        : 'claimed something the facts do not show',
      rule: RULE_WORDS.G3,
    };
  }
  if (id === 'G4') {
    const label = message.match(/Forbidden for the agent: ([^(]+?)(?: \(|\.$)/)?.[1];
    return {
      what: `included ${label ?? 'something the agent may never say'}`,
      rule: RULE_WORDS.G4,
    };
  }
  if (id === 'G1')
    return {
      what: /no exact message text/.test(message)
        ? 'left a message without its exact text'
        : 'contacted the customer outside an approved draft',
      rule: RULE_WORDS.G1,
    };
  if (id === 'G12')
    return {
      what: `left part of the trip broken (${message.replace(FACT_ID, '').trim()})`,
      rule: RULE_WORDS.G12,
    };
  if (id === 'CHAIN')
    return {
      what: `proposed a plan that does not work out (${message
        .replace(/^Not feasible:\s*/, '')
        .replace(FACT_ID, '')
        .trim()})`,
      rule: RULE_WORDS.CHAIN,
    };
  return {
    what: `broke a rule (${message.replace(FACT_ID, '').trim()})`,
    rule:
      RULE_WORDS[id] ??
      (GUARDRAILS as Record<string, { title: string } | undefined>)[id]?.title.toLowerCase() ??
      id,
  };
}

/** What the gate caught in the first draft, one plain line per option, and what became of it. */
export function describeCatches(args: {
  firstPass: GateStepOutput['firstPass'];
  final: CardOption[];
  quoteBlockMinutes?: number;
}): string[] {
  const { firstPass, final, quoteBlockMinutes } = args;
  return firstPass
    .filter((pass) => pass.violations.length)
    .map((pass) => {
      const plain = pass.violations.map((violation) =>
        plainViolation({ violation, quoteBlockMinutes })
      );
      const whats = [...new Set(plain.map((p) => p.what))].slice(0, 2);
      const rules = [...new Set(plain.map((p) => p.rule))].slice(0, 2);
      const after = final.find((option) => option.id === pass.optionId);
      const outcome = !after
        ? ', and the agent dropped that option'
        : after.blocked
          ? '; the second draft still broke it, so the option is shown as blocked'
          : ', and the agent fixed it';
      return `Option ${pass.optionId}: the first draft ${whats.join(' and ')}; the rule “${rules.join('” and “')}” sent it back${outcome}.`;
    });
}

/** A deterministic block that expands and gates the options of `optionsFrom` (an options agent with templates). */
export function gateStep(args: {
  id: string;
  title: string;
  description: string;
  optionsFrom: string;
  next: Edge[];
  // Forces case context for the guardrails, e.g. { vehicleWarning: true } so G4 phrase checks always apply.
  context?: Proposal['context'];
  itinerary?: ItineraryCheck;
}): BlockDefinition {
  const { id, title, description, optionsFrom, next, context, itinerary } = args;
  return {
    id,
    kind: 'deterministic',
    status: 'OPTIONS_READY',
    title,
    description,
    next,
    run: async (ctx: RunContext): Promise<GateStepOutput> => {
      const templates = ctx.playbook.blocks.find((block) => block.id === optionsFrom)?.templates;
      if (!templates?.length) throw new Error(`Block ${optionsFrom} offers no option templates`);
      let answer = ctx.outputs[optionsFrom] as OptionsAnswer;
      let options = await checkOptions({ ctx, answer, templates, context, itinerary });
      const firstPass = options.map((option) => ({
        optionId: option.id,
        violations: option.gate.violations,
      }));
      let retried = false;
      if (options.some((option) => !option.gate.ok)) {
        ctx.services.log(`gate: re-asking ${optionsFrom}`, firstPass);
        answer = (await ctx.services.rerunAgent({
          blockId: optionsFrom,
          feedback: renderViolations(options),
        })) as OptionsAnswer;
        options = await checkOptions({ ctx, answer, templates, context, itinerary });
        retried = true;
      }
      const gated = options.map((option) => {
        const first = option.gate.violations[0];
        return first
          ? { ...option, blocked: { ruleId: first.ruleId, message: first.message } }
          : option;
      });
      // The recommendation must point at an option that is not blocked.
      const recommendedOk = gated.find((option) => option.recommended && !option.blocked);
      const fallback = recommendedOk ?? gated.find((option) => !option.blocked) ?? null;
      const final = gated.map((option) => ({
        ...option,
        recommended: option.id === fallback?.id,
      }));
      const caught = retried
        ? describeCatches({
            firstPass,
            final,
            quoteBlockMinutes: Number(ctx.params.quoteBlockMinutes ?? 90),
          })
        : [];
      return { options: final, answer, retried, firstPass, caught };
    },
  };
}
