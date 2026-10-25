// Every playbook definition (no Trigger tasks, no side effects): used by the router, the catalog and scripts.

import type { PlaybookDefinition } from '@/lib/playbooks/types';
import { driverUnavailableDefinition } from '@/playbooks/driver-unavailable/playbook';
import { missedConnectionDefinition } from '@/playbooks/missed-connection/playbook';
import { pickupUnconfirmedDefinition } from '@/playbooks/pickup-unconfirmed/playbook';
import { vehicleWarningDefinition } from '@/playbooks/vehicle-warning/playbook';

const PLAYBOOKS: PlaybookDefinition[] = [
  missedConnectionDefinition,
  vehicleWarningDefinition,
  pickupUnconfirmedDefinition,
  driverUnavailableDefinition,
];

export function listPlaybooks(): PlaybookDefinition[] {
  return PLAYBOOKS;
}

export function getPlaybook(id: string): PlaybookDefinition | null {
  return PLAYBOOKS.find((playbook) => playbook.id === id) ?? null;
}

/** Playbooks a watchman trigger type routes to. */
export function playbooksForTrigger(triggerType: string): PlaybookDefinition[] {
  return PLAYBOOKS.filter((playbook) => playbook.triggers.includes(triggerType));
}
