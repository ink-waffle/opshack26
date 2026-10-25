// Pure constants (no DB, no fs): safe to import anywhere, including client components.

export const BAHN_SNAPSHOT_AT = new Date('2026-10-21T09:00:00Z');

// Every dataset collection; each one is the table bahn.<collection>.
export const BAHN_COLLECTIONS = [
  'addresses',
  'agent_proposals',
  'agents',
  'alerts',
  'assignment_steps',
  'conversations',
  'custody_asset_events',
  'custody_assets',
  'custody_reports',
  'customers',
  'documents',
  'drivers',
  'endpoint_claims',
  'expenses',
  'ferry_terminal_events',
  'ferry_terminals',
  'incidents',
  'internal_notifications',
  'market_offer_demand_signals',
  'market_offer_demand_windows',
  'market_offer_exposures',
  'market_offer_reach_checks',
  'market_offers',
  'messages',
  'operational_events',
  'operators',
  'order_endpoint_details',
  'order_items',
  'order_notes',
  'orders',
  'proofs',
  'site_visits',
  'sites',
  'support_inbox_messages',
  'support_inbox_threads',
  'terminal_road_estimates',
  'time_windows',
  'tracking_observations',
  'transport_plans',
  'transport_points',
  'transport_segments',
  'travel_confirmations',
  'travel_options',
  'travel_reservations',
  'vehicles',
  'work_assignments',
  'work_items',
] as const;

export type BahnCollection = (typeof BAHN_COLLECTIONS)[number];

// A dataset record as it appears in the jsonl files (snake_case keys).
export type BahnRecord = { id: string } & Record<string, unknown>;

export function isBahnCollection(name: string): name is BahnCollection {
  return (BAHN_COLLECTIONS as readonly string[]).includes(name);
}
