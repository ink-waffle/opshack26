import { definePlaybookTask } from '@/lib/playbooks/task';
import { pickupUnconfirmedDefinition } from '@/playbooks/pickup-unconfirmed/playbook';

export const pickupUnconfirmed = definePlaybookTask(pickupUnconfirmedDefinition);
