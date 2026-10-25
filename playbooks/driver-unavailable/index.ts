import { definePlaybookTask } from '@/lib/playbooks/task';
import { driverUnavailableDefinition } from '@/playbooks/driver-unavailable/playbook';

export const driverUnavailable = definePlaybookTask(driverUnavailableDefinition);
