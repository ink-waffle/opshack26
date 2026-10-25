import sys, json, collections
sys.path.insert(0, '/private/tmp/claude-501/-Users-ink-waffle-Work-operationshackathon26/83f187d4-6609-442c-a891-67c1f3f9d5af/scratchpad/scripts')
from load import load
T = load(sys.argv[1])
orders = {o['id']: o for o in T['orders']}
flags = collections.defaultdict(list)
def add(oid, tag):
    if oid: flags[oid].append(tag)
for a in T['alerts']: add(a['order_id'], f"alert:{a['signal']}/{a['status']}")
for a in T['incidents']: add(a['order_id'], f"incident:{a['kind']}/{a['status']}")
for a in T['work_items']: add(a['order_id'], f"wi:{a['kind']}/{a['status']}")
for a in T['agent_proposals']: add(a['order_id'], f"prop:{a['command']}/{a['status']}")
for a in T['endpoint_claims']: add(a['order_id'], f"claim:{a['field']}/{a['resolution_status']}")
for a in T['transport_plans']:
    if a['status'] not in ('ACTIVE','COMPLETED','DRAFT') or a.get('replaced_at'): add(a['order_id'], f"plan:{a['status']}")
for a in T['work_assignments']:
    if a['status']=='CANCELLED' or a.get('cancelled_at'): add(a['order_id'], f"asg_cancel:{a.get('cancellation_reason')}")
for a in T['travel_options']:
    if a['status'] not in ('AVAILABLE','QUOTED'): add(a['order_id'], f"topt:{a['kind']}/{a['status']}")
for a in T['travel_reservations']:
    if a['status'] not in ('BOOKED','CONFIRMED','COMPLETED') or a.get('replacement_reservation_id') or a.get('amendment_request'): add(a['order_id'], f"tres:{a['kind']}/{a['status']}")
for a in T['ferry_terminal_events']: add(a['order_id'], f"ferryevt:{a['kind']}")
for a in T['proofs']:
    if a['status']=='REJECTED': add(a['order_id'], f"proof_rej:{a['kind']}")
for a in T['custody_reports']: add(a['order_id'], "custody_report")
for a in T['custody_assets']: add(a['order_id'], f"custody_asset:{a['status']}")
for a in T['site_visits']: add(a['order_id'], f"site_visit:{a['outcome']}")
for a in T['order_notes']: add(a['order_id'], f"note:{a.get('purpose')}")
for a in T['expenses']:
    if a['status'] in ('REJECTED','SUPERSEDED','SUBMITTED'): add(a['order_id'], f"exp:{a['kind']}/{a['status']}")
for a in T['documents']:
    if a['status'] not in ('SIGNED','APPROVED','COMPLETE','RECEIVED','FILED'): pass
for a in T['travel_confirmations']: add(a['order_id'], "travel_conf")
for a in T['internal_notifications']: add(a['order_id'], f"notif:{a['activity']}")
convs = collections.defaultdict(list)
for c in T['conversations']:
    add(c['order_id'], f"conv:{c['category']}/{c['status']}")
for t in T['support_inbox_threads']:
    for o in t['linked_order_ids']: add(o, f"inbox_linked:{t['link_state']}")
    for o in t['candidate_order_ids']: add(o, f"inbox_cand:{t['link_state']}")
for o in T['orders']:
    if o['cancelled_at']: add(o['id'], f"order_cancelled:{o.get('cancellation_reason')}")
# market offer exposures / reach / editorial signals
for a in T['market_offer_exposures']: add(a['order_id'], f"exposure:{a['status']}")
for a in T['market_offer_reach_checks']: add(a['order_id'], "reach_check")
ed = set(s['order_id'] for s in T['market_offer_demand_signals'] if s['sample_tier']=='EDITORIAL_CASE')
for o in ed: add(o, "demand_editorial")
# events with exceptional commands
cmds = collections.Counter(e['command'] for e in T['operational_events'])
print("COMMANDS:", json.dumps(cmds, indent=0))
for o in sorted(orders.values(), key=lambda x: x['reference']):
    f = flags.get(o['id'], [])
    print(o['reference'], o['id'], o['status'], o['display_lane'], o['route_kind'], '|', '; '.join(f))
