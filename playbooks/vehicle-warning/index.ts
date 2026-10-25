import { definePlaybookTask } from '@/lib/playbooks/task';
import { vehicleWarningDefinition } from '@/playbooks/vehicle-warning/playbook';

export const vehicleWarning = definePlaybookTask(vehicleWarningDefinition);
