// Server-side checks on an operator's decision before it reaches the run (pure, so it is unit-tested).

import { parseOptions } from '@/lib/control-room/options';
import { approvalProblem } from '@/lib/playbooks/decision';
import type { DecisionPayload } from '@/lib/playbooks/types';

/** Why this decision is refused (null = send it): an unknown or blocked option, or an edit the run cannot carry out. */
export function decisionRefusal(args: {
  options: unknown;
  decision: DecisionPayload;
}): string | null {
  const { options, decision } = args;
  if (decision.action === 'reject') return null;
  const option = parseOptions(options).items.find((item) => item.id === decision.optionId);
  if (!option) return `Option ${decision.optionId ?? '?'} is not on this card.`;
  return approvalProblem({
    option: {
      id: option.id,
      blocked: option.blocked
        ? { ruleId: option.blocked.ruleId, message: option.blocked.message }
        : null,
      gate: {
        ok: option.gateOk,
        violations: option.violations.map((v) => ({ ruleId: v.ruleId, message: v.message })),
        warnings: [],
      },
      actions: option.actions,
    },
    decision,
  });
}
