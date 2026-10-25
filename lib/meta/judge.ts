// Jev as the backtest judge: does an agent output follow the operator's correction, and is it still sensible?

import { decide } from '@/lib/decisions';
import { expandOption, type OptionsAnswer } from '@/lib/playbooks/options';
import type { BlockDefinition } from '@/lib/playbooks/types';

/** What a dispatcher reads of an agent output: options built out by their templates, no fact ids or schemas. */
export function compactOutput(args: { block: BlockDefinition; output: unknown }): unknown {
  const { block, output } = args;
  const parsed = block.outputSchema?.safeParse(output);
  if (!block.templates?.length || !parsed?.success) return output;
  const templates = block.templates;
  const answer = parsed.data as OptionsAnswer;
  return {
    situation: answer.situation,
    recommendation: answer.recommendation,
    options: answer.options.map((answered) => {
      const option = expandOption({ templates, option: answered });
      return {
        id: option.id,
        template: answered.template,
        label: option.label,
        detail: option.detail,
        actions: option.actions.map((action) =>
          [
            action.actionClass,
            action.description,
            action.target ? `cancels: ${action.target}` : '',
            action.message ? `text: “${action.message}”` : '',
          ]
            .filter(Boolean)
            .join(' — ')
        ),
      };
    }),
    agentWillNot: answer.agentWillNot,
  };
}

export async function judgeFollowsCorrection(args: {
  block: BlockDefinition;
  correction: string;
  output: unknown;
}): Promise<{ p: number; costUsd: number }> {
  const { block, correction, output } = args;
  const { answers, costUsd } = await decide({
    state: {
      task: block.title,
      operatorCorrection: correction,
      agentOutput: compactOutput({ block, output }),
    },
    questions: {
      follows: {
        type: 'noul',
        instructions: `An operator corrected an earlier answer of this agent: “${correction}”. Does this agent output follow that correction? Judge what the output recommends and what its actions would do after a yes, not its wording.`,
        criteria: {
          true: 'The recommended plan and its actions do what the correction asks (or the output clearly makes that the first choice).',
          false:
            'The recommended plan ignores, contradicts or only mentions the correction while still doing what the operator corrected.',
        },
      },
    },
  });
  return { p: answers.follows.noul, costUsd };
}

export async function judgeSensible(args: {
  block: BlockDefinition;
  output: unknown;
}): Promise<{ p: number; costUsd: number }> {
  const { block, output } = args;
  const { answers, costUsd } = await decide({
    state: { task: block.title, agentOutput: compactOutput({ block, output }) },
    questions: {
      sensible: {
        type: 'noul',
        instructions:
          'Is this output still a sensible answer to the task for a car-delivery dispatcher: a coherent plan they could approve, nothing contradictory or empty?',
        criteria: {
          true: 'A dispatcher could act on it: the options are coherent and complete, the recommendation fits them.',
          false: 'It is incoherent, empty, contradicts itself, or recommends something unworkable.',
        },
      },
    },
  });
  return { p: answers.sensible.noul, costUsd };
}
