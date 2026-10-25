import { definePlaybookTask } from '@/lib/playbooks/task';
import { missedConnectionDefinition } from '@/playbooks/missed-connection/playbook';

export const missedConnection = definePlaybookTask(missedConnectionDefinition);
