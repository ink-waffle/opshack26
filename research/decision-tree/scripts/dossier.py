import sys, json, collections
sys.path.insert(0, '/private/tmp/claude-501/-Users-ink-waffle-Work-operationshackathon26/83f187d4-6609-442c-a891-67c1f3f9d5af/scratchpad/scripts')
from load import load
T = load(sys.argv[1])
refs = sys.argv[2:]
byid = {}
for t, rows in T.items():
    for r in rows:
        if 'id' in r: byid[r['id']] = (t, r)
ords = {o['reference']: o for o in T['orders']}
def j(r, drop=()):
    return json.dumps({k:v for k,v in r.items() if k not in drop and v not in (None, [], {})}, ensure_ascii=False)
def rows(t, oid, key='order_id'):
    return [r for r in T[t] if r.get(key)==oid]
for ref in refs:
    o = ords[ref]; oid = o['id']
    print("#"*100); print("ORDER", ref, j(o))
    cust = byid[o['customer_id']][1]; print("CUSTOMER", j(cust))
    for it in rows('order_items', oid):
        v = byid[it['vehicle_id']][1]; print("ITEM", it['id'], it['role'], it.get('cmr_mode'), '|', j(v))
    for p in rows('transport_plans', oid):
        print("PLAN", j(p))
        for pt in [x for x in T['transport_points'] if x['plan_id']==p['id']]:
            a = byid[pt['address_id']][1]
            s = byid[pt['site_id']][1] if pt.get('site_id') else None
            print("  POINT", pt['id'], pt['sequence'], pt['role'], pt.get('order_boundary'), '| ADDR', j(a, drop=('id',)))
            if s: print("     SITE", s['id'], s['name'], s['kind'], s['handover_mode'], s['opening_hours'], 'notice', s['advance_notice_minutes'], 'rule:', s['release_document_rule'], 'signed_release', s['requires_signed_release'], '| pickup:', s['pickup_access_note'], '| delivery:', s['delivery_access_note'])
        for sg in [x for x in T['transport_segments'] if x['plan_id']==p['id']]:
            print("  SEG", j(sg))
    for r in rows('time_windows', oid): print("WINDOW", j(r, drop=('order_id',)))
    for r in rows('order_endpoint_details', oid): print("ENDPOINT", j(r, drop=('order_id',)))
    for r in rows('endpoint_claims', oid): print("CLAIM", j(r, drop=('order_id',)))
    for r in T['market_offers']:
        if r['order_id']==oid or oid in (r.get('order_ids') or []): print("OFFER", j(r))
    for r in rows('market_offer_exposures', oid): print("EXPOSURE", j(r))
    for r in rows('market_offer_reach_checks', oid): print("REACH", j(r))
    sig = [r for r in rows('market_offer_demand_signals', oid)]
    if sig: print("DEMAND_SIGNALS", len(sig), collections.Counter((s['offer_id'], s['kind'], s['sample_tier']) for s in sig))
    for r in rows('work_assignments', oid):
        d = byid[r['driver_id']][1]
        print("ASSIGNMENT", j(r), '| DRIVER', j(d))
    for r in sorted(rows('assignment_steps', oid), key=lambda x:(x['assignment_id'], x['sequence'])): print("STEP", j(r, drop=('order_id',)))
    for r in rows('travel_options', oid): print("TOPTION", j(r, drop=('order_id',)))
    for r in rows('travel_reservations', oid): print("TRES", j(r, drop=('order_id',)))
    for r in rows('travel_confirmations', oid): print("TCONF", j(r, drop=('order_id',)))
    for r in rows('ferry_terminal_events', oid): print("FERRYEVT", j(r, drop=('order_id',)))
    for r in sorted(rows('tracking_observations', oid), key=lambda x:x['observed_at']): print("TRACK", r['id'], r['assignment_id'][-6:], 'obs', r['observed_at'][:16], 'rcv', r['received_at'][:16], r['location_quality'], 'rem', r['distance_remaining_km'], 'eta', r.get('estimated_delivery_at'), r.get('source'), r.get('observation_kind') or '', r.get('context_note') or '', r.get('reservation_id') or '')
    for r in rows('alerts', oid): print("ALERT", j(r, drop=('order_id',)))
    for r in rows('incidents', oid): print("INCIDENT", j(r, drop=('order_id',)))
    for r in rows('work_items', oid): print("WORKITEM", j(r, drop=('order_id',)))
    for r in rows('agent_proposals', oid): print("PROPOSAL", json.dumps(r, ensure_ascii=False))
    for r in rows('internal_notifications', oid): print("NOTIF", j(r, drop=('order_id',)))
    for r in rows('proofs', oid): print("PROOF", j(r, drop=('order_id',)))
    for r in rows('documents', oid): print("DOC", j(r, drop=('order_id',)))
    for r in rows('expenses', oid): print("EXPENSE", j(r, drop=('order_id',)))
    for r in rows('custody_reports', oid): print("CUSTODY_REPORT", j(r, drop=('order_id',)))
    for r in rows('custody_assets', oid): print("CUSTODY_ASSET", j(r, drop=('order_id',)))
    for r in rows('custody_asset_events', oid): print("CUSTODY_EVT", j(r, drop=('order_id',)))
    for r in rows('site_visits', oid): print("SITE_VISIT", j(r, drop=('order_id',)))
    for r in rows('order_notes', oid): print("NOTE", j(r, drop=('order_id',)))
    for t in T['support_inbox_threads']:
        if oid in t['linked_order_ids'] or oid in t['candidate_order_ids']:
            print("INBOX_THREAD", j(t))
            for m in [m for m in T['support_inbox_messages'] if m['thread_id']==t['id']]: print("   INBOX_MSG", j(m))
    convs = [c for c in T['conversations'] if c['order_id']==oid or oid in (c.get('related_order_ids') or [])]
    for c in convs: print("CONV", j(c))
    # chronological timeline: events + messages
    tl = []
    for e in rows('operational_events', oid):
        tl.append((e['recorded_at'], 'EVT', f"{e['command']} [{e['actor_type']}:{e['actor_id']}/{e['source']}] {e['target_type']}:{e['target_id']} {e.get('from_state')}->{e.get('to_state')} {json.dumps(e.get('changes'), ensure_ascii=False)} ({e['id']})"))
    for c in convs:
        for m in [m for m in T['messages'] if m['conversation_id']==c['id']]:
            tl.append((m['authored_at'], 'MSG', f"[{c['id']} {c['category']}] {m['author_type']}:{m['author_id']}{'('+m['author_name_snapshot']+')' if m.get('author_name_snapshot') else ''} -> {m['recipient_type']}:{m['recipient_id']} via {m['channel']}/{m['visibility']} ({m['id']}){' refs='+str(m['evidence_refs']) if m.get('evidence_refs') else ''}: {m['body']}"))
    print("---- TIMELINE")
    for t, k, s in sorted(tl): print(t, k, s)
