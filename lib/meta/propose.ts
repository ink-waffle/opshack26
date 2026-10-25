// The proposer: an agent (no tools) that turns one operator correction into 0–2 candidate amendments.

import { runAgent } from '@/lib/agents';
import { renderGuardrailsForAgents } from '@/lib/gate/actions';
import { compactOutput } from '@/lib/meta/judge';
import type { LearningCase } from '@/lib/meta/load';
import { type ProposerAnswer, proposerAnswerSchema } from '@/lib/meta/types';
import { currentValue, parameterWhitelist } from '@/lib/meta/whitelist';
import { readPlaybookFile } from '@/lib/playbooks/prompt';
import { renderTemplatesForAgents } from '@/lib/playbooks/templates';

const SYSTEM_PROMPT = `You improve the playbooks of Bahn's car-delivery control room. A playbook is a fixed diagram of steps; some steps are AI agents with written instructions, some are rule checks with numeric thresholds. Operators approve, edit or reject the decision cards the playbook prepares. When an operator corrects a card, you propose how the playbook should change so the next card already does what the operator wanted.

You may propose at most two amendments:
- INSTRUCTION: one or two imperative sentences appended to ONE agent step's instructions (give its blockId). Write a general rule for future cases of this playbook, in the playbook's own terms ("when the car would arrive more than 12 hours early…"). Never mention this order, its reference, people's names, fact ids, dates or prices.
- PARAMETER: new values for whitelisted numeric keys only, inside their ranges, when the correction is clearly about a threshold or a timing (how long to wait, how fresh a quote must be, how sure the router must be).

Rules:
- Target the step whose output the operator changed. Prefer one precise INSTRUCTION over several vague ones.
- An amendment can add checks, change the order of work, change which option is recommended or how a message is worded. It can never remove a human approval, loosen a guardrail (G1–G12), promise the customer anything, or contradict the playbook rules.
- Do not repeat an amendment that is already approved.
- If the correction only makes sense for this one order (a sick driver, a one-off customer wish), set generalizes = false and return no amendments.
- Write the rationale for the chief dispatcher, who does not read code: what the operator corrected, and why this should apply next time.`;

function section(title: string, body: string): string {
  return `## ${title}\n\n${body.trim() || '_none_'}`;
}

/** The proposer's prompt: playbook, the agent steps that fed the card, the card, the correction and the whitelist. */
export async function buildProposerPrompt(learning: LearningCase): Promise<string> {
  const { definition, card, options, agentBlocks, approved, params, correction, decision } =
    learning;
  const rules = await readPlaybookFile({ definition, file: 'rules.md' }).catch(() => '');
  const steps = definition.blocks
    .map((block) => {
      const wait = block.wait
        ? ` Waits up to ${block.wait.defaultMinutes} min, but wakes ${block.wait.bufferMinutes} min before the next commitment.`
        : '';
      return `- \`${block.id}\` (${block.kind}) ${block.title}: ${block.description}${wait}`;
    })
    .join('\n');
  const agentSections = agentBlocks.map((item) =>
    [
      `### Agent step \`${item.block.id}\`: ${item.block.title}`,
      `Tools: ${(item.block.tools ?? []).join(', ') || 'none'}.`,
      '#### Current instructions',
      item.instructions,
      ...(item.block.templates ? [renderTemplatesForAgents(item.block.templates)] : []),
      '#### Approved amendments already appended',
      item.amendments.length ? item.amendments.map((a) => `- ${a.text}`).join('\n') : '_none_',
      '#### What it answered on this card (recorded output)',
      '```json',
      JSON.stringify(compactOutput({ block: item.block, output: item.blockRun.output }), null, 1),
      '```',
    ].join('\n\n')
  );
  const cardText = [
    `Title: ${card.title}`,
    `Summary: ${card.summary}`,
    ...(options?.items ?? []).map(
      (option) =>
        `- Option ${option.id}${option.recommended ? ' (recommended)' : ''}: ${option.label}. ${option.detail} Cost ${option.costLabel}.${option.blocked ? ` Blocked by ${option.blocked.ruleId}.` : ''}\n${option.actions.map((action) => `  - ${action.id} ${action.actionClass}: ${action.description}${action.message ? ` — text: “${action.message}”` : ''}`).join('\n')}`
    ),
    options?.recommendation
      ? `Recommendation: ${options.recommendation.optionId}, ${options.recommendation.why}`
      : '',
  ].join('\n');
  const whitelist = parameterWhitelist(definition)
    .map(
      (spec) =>
        `- \`${spec.key}\` = ${currentValue({ spec, params })} ${spec.unit} (allowed ${spec.min}–${spec.max}): ${spec.label}. ${spec.appliedBy}`
    )
    .join('\n');
  const playbookWide = approved.filter((a) => a.kind === 'INSTRUCTION' && !a.blockId);
  return [
    `# Playbook: ${definition.title} (\`${definition.id}\`)`,
    definition.summary,
    section('Steps', steps),
    section('Playbook rules', rules),
    section(
      'Guardrails (fixed, never loosened)',
      renderGuardrailsForAgents().split('## Who approves')[0]
    ),
    section('Approved playbook-wide amendments', playbookWide.map((a) => `- ${a.text}`).join('\n')),
    ...agentSections,
    section('The decision card the operator saw', cardText),
    section(
      `The operator's decision (${decision.action}, by ${decision.decidedBy})`,
      correction || 'No note.'
    ),
    section('Whitelisted parameters (current values)', whitelist),
    'Propose the amendments now. Return them through the structured output tool.',
  ].join('\n\n');
}

export async function proposeAmendments(
  learning: LearningCase
): Promise<{ answer: ProposerAnswer; costUsd: number; prompt: string }> {
  const prompt = await buildProposerPrompt(learning);
  const result = await runAgent({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    outputSchema: proposerAnswerSchema,
    mcpServers: {},
    allowedTools: [],
    model: 'sonnet',
    timeoutMs: 5 * 60_000,
    maxBudgetUsd: 1,
  });
  return { answer: result.output, costUsd: result.costUsd, prompt };
}
