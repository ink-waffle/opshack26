// definePlaybookTask: a playbook definition becomes a Trigger.dev task whose id is the playbook id.

import { metadata, task } from '@trigger.dev/sdk';

import { triggerAdapter } from '@/lib/playbooks/adapters/trigger';
import { definePlaybook } from '@/lib/playbooks/interpreter';
import { runPlaybook } from '@/lib/playbooks/runtime';
import type { PlaybookDefinition, PlaybookPayload } from '@/lib/playbooks/types';

export function definePlaybookTask(definition: PlaybookDefinition) {
  const playbook = definePlaybook(definition);
  return task({
    id: playbook.id,
    // Compute only; waits on tokens, wait.for and child agent runs are checkpointed.
    maxDuration: 1800,
    // A retry would re-run every agent block; failures go to a person instead.
    retry: { maxAttempts: 1 },
    run: async (payload: PlaybookPayload, { ctx }) => {
      metadata.set('playbookId', playbook.id);
      metadata.set('orderId', payload.orderId);
      return runPlaybook({
        definition: playbook,
        payload,
        adapter: triggerAdapter(),
        triggerRunId: ctx.run.id,
      });
    },
  });
}
