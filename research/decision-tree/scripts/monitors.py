"""Backtest candidate deterministic monitors over the snapshot. Snapshot = 2026-10-21T09:00Z."""
import sys, json, collections
from datetime import datetime, timedelta
sys.path.insert(0, '/private/tmp/claude-501/-Users-ink-waffle-Work-operationshackathon26/83f187d4-6609-442c-a891-67c1f3f9d5af/scratchpad/scripts')
from load import load
T = load(sys.argv[1])
P = lambda s: datetime.fromisoformat(s.replace('Z','+00:00')) if s else None
SNAP = P('2026-10-21T09:00:00Z')
O = {o['id']: o for o in T['orders']}; ref = {k: v['reference'] for k, v in O.items()}
pts = {p['id']: p for p in T['transport_points']}
segs = {s['id']: s for s in T['transport_segments']}
addr = {a['id']: a for a in T['addresses']}
sites = {s['id']: s for s in T['sites']}
wins = collections.defaultdict(list)
for w in T['time_windows']: wins[w['point_id']].append(w)
def sel(point_id, purposes):
    ws = [w for w in wins[point_id] if w['is_selected'] and w['purpose'] in purposes]
    return ws[0] if ws else None
asg_by_order = collections.defaultdict(list)
for a in T['work_assignments']: asg_by_order[a['order_id']].append(a)
case_orders = set()
for t in ['alerts','incidents','work_items','agent_proposals','endpoint_claims']:
    for r in T[t]: case_orders.add(r['order_id'])
for c in T['conversations']:
    if c['status']=='OPEN': case_orders.add(c['order_id'])
hits = collections.defaultdict(list)
def hit(m, oid, detail): hits[m].append((ref[oid], oid in case_orders, detail))

# M1 ferry cutoff within 6h, booked, no check-in confirmation, no inbound driver message in last 4h
ext_msgs = collections.defaultdict(list)
conv = {c['id']: c for c in T['conversations']}
for m in T['messages']:
    if m['author_type'] in ('driver','customer','site_contact','handoff_contact'):
        ext_msgs[conv[m['conversation_id']]['order_id']].append((P(m['authored_at']), m['author_type']))
for r in T['travel_reservations']:
    if r['kind']=='FERRY' and r['status']=='BOOKED' and r.get('check_in_cutoff_at'):
        co = P(r['check_in_cutoff_at'])
        if SNAP <= co <= SNAP+timedelta(hours=6) and r.get('check_in_confirmation') != 'CONFIRMED_BY_GATE_SCAN':
            recent = [x for x in ext_msgs[r['order_id']] if x[1]=='driver' and SNAP-x[0] <= timedelta(hours=4)]
            hit('M1_FERRY_CUTOFF_SOON_UNCONFIRMED', r['order_id'], f"{r['id']} cutoff {r['check_in_cutoff_at'][5:16]} in {(co-SNAP).seconds//60} min; driver msg in last 4h: {bool(recent)}")
# M2 pickup slot started, assignment not started
for a in T['work_assignments']:
    if a['status']=='ASSIGNED':
        s = segs[a['segment_ids'][0]]; w = sel(s['from_point_id'], ('SELECTED_PICKUP_SLOT',))
        if w and P(w['start_at']) <= SNAP + timedelta(minutes=60):
            hit('M2_SLOT_STARTED_NOT_STARTED', a['order_id'], f"{a['id']} slot {w['start_at'][5:16]}-{w['end_at'][11:16]}")
# M3 driver chain conflict: positioning.previous_order_id differs from the actually preceding active assignment
by_driver = collections.defaultdict(list)
for a in T['work_assignments']:
    if a['status'] in ('ASSIGNED','IN_PROGRESS'):
        s = segs[a['segment_ids'][0]]
        w = sel(s['from_point_id'], ('SELECTED_PICKUP_SLOT',))
        dw = sel(s['to_point_id'], ('CUSTOMER_DELIVERY_PROMISE','REQUESTED_DELIVERY_SLOT','SELECTED_DELIVERY_SLOT'))
        by_driver[a['driver_id']].append((P(w['start_at']) if w else None, a, s, dw))
for d, lst in by_driver.items():
    lst = sorted([x for x in lst if x[0]], key=lambda x: x[0])
    for i in range(1, len(lst)):
        prev, cur = lst[i-1], lst[i]
        pa = cur[1].get('positioning') or {}
        prev_city = addr[pts[prev[2]['to_point_id']]['address_id']]['city']
        nxt_city = addr[pts[cur[2]['from_point_id']]['address_id']]['city']
        prev_end = P(prev[3]['end_at']) if prev[3] else None
        gap_h = (cur[0]-prev_end).total_seconds()/3600 if prev_end else None
        detail = f"{d}: prev {ref[prev[1]['order_id']]} ends {prev_city} {prev[3]['end_at'][5:16] if prev[3] else '?'} -> next {ref[cur[1]['order_id']]} starts {nxt_city} {cur[0].isoformat()[5:16]} gap {gap_h:.1f}h; positioning record prev={ref.get(pa.get('previous_order_id'))} release={pa.get('planned_release_city')} assess={pa.get('assessment')} booked={pa.get('positioning_reservation_ids')}"
        if pa and pa.get('previous_order_id') != prev[1]['order_id']:
            hit('M3_DRIVER_CHAIN_CONFLICT', cur[1]['order_id'], 'positioning names a different previous duty | ' + detail)
        elif pa and pa.get('planned_release_city') != prev_city:
            hit('M3_DRIVER_CHAIN_CONFLICT', cur[1]['order_id'], 'release city differs from previous segment end | ' + detail)
        if prev_city != nxt_city and not (pa.get('positioning_reservation_ids')):
            hit('M4_POSITIONING_NOT_EVIDENCED', cur[1]['order_id'], detail)
# M5 delivered, required signed handover missing, or delivery/pickup proof submitted but unreviewed > 24h
docs = collections.defaultdict(list)
for dct in T['documents']: docs[dct['order_id']].append(dct)
for o in T['orders']:
    if o['status']=='DELIVERED':
        dsite = sites.get(o.get('delivery_site_id'))
        miss = [dd['id'] for dd in docs[o['id']] if dd['kind']=='SIGNED_HANDOVER' and dd['status']=='MISSING']
        if miss or (dsite and dsite['requires_signed_release'] and not any(dd['kind']=='SIGNED_HANDOVER' and dd['status'] in ('SIGNED','VERIFIED','APPROVED') for dd in docs[o['id']])):
            hit('M5a_SIGNED_HANDOVER_GAP', o['id'], f"site requires signed release={dsite['requires_signed_release'] if dsite else None}; missing docs={miss}")
for p in T['proofs']:
    if p['status']=='SUBMITTED' and SNAP-P(p['submitted_at']) > timedelta(hours=24):
        hit('M5b_PROOF_UNREVIEWED_24H', p['order_id'], f"{p['kind']} submitted {p['submitted_at'][5:16]}")
# M6 overdue owned work
for w in T['work_items']:
    if w['status']!='DONE' and P(w['due_at']) < SNAP:
        hit('M6_OVERDUE_WORK_ITEM', w['order_id'], f"{w['kind']} due {w['due_at'][5:16]} overdue {(SNAP-P(w['due_at'])).total_seconds()/3600:.1f}h")
# M7 customer/site message unanswered > 4h or first reply delay > 4h (recorded history)
msgs_by_conv = collections.defaultdict(list)
for m in T['messages']: msgs_by_conv[m['conversation_id']].append(m)
for cid, ms in msgs_by_conv.items():
    ms = sorted(ms, key=lambda m: m['authored_at'])
    for i, m in enumerate(ms):
        if m['author_type'] in ('customer','site_contact','driver','handoff_contact') and m['visibility']=='PUBLIC':
            nxt = [x for x in ms[i+1:] if x['author_type'] in ('operator','agent') and x['visibility']=='PUBLIC']
            end = P(nxt[0]['authored_at']) if nxt else SNAP
            if (end-P(m['authored_at'])) > timedelta(hours=4):
                hit('M7_INBOUND_UNANSWERED_4H', conv[cid]['order_id'], f"{m['id']} {m['author_type']} {m['authored_at'][5:16]} reply after {(end-P(m['authored_at'])).total_seconds()/3600:.1f}h{' (none yet)' if not nxt else ''}: {m['body'][:60]}")
# M8 stale tracking for in-progress assignments (>3h), not inside a booked ferry window
lastobs = {}
for t in T['tracking_observations']:
    k = t['assignment_id']
    if k not in lastobs or P(t['observed_at']) > P(lastobs[k]['observed_at']): lastobs[k] = t
for a in T['work_assignments']:
    if a['status']=='IN_PROGRESS':
        t = lastobs.get(a['id'])
        if not t: hit('M8_NO_TRACKING', a['order_id'], a['id'])
        elif SNAP-P(t['observed_at']) > timedelta(hours=3): hit('M8_STALE_TRACKING_3H', a['order_id'], f"{a['id']} last obs {t['observed_at'][5:16]} {t['location_quality']}")
# M9 promise vs tracking ETA (ETA after promise end)
for a in T['work_assignments']:
    if a['status']=='IN_PROGRESS' and a['id'] in lastobs:
        s = segs[a['segment_ids'][0]]; dw = sel(s['to_point_id'], ('CUSTOMER_DELIVERY_PROMISE',))
        eta = P(lastobs[a['id']].get('estimated_delivery_at'))
        if dw and eta and eta > P(dw['end_at']):
            hit('M9_TRACKING_ETA_AFTER_PROMISE', a['order_id'], f"eta {eta.isoformat()[5:16]} > promise end {dw['end_at'][5:16]} ({lastobs[a['id']]['location_quality']})")
# M10 ferry capacity: earliest available quote vs promise (arrival + 3h buffer) ; sold-out present
for oid in set(t['order_id'] for t in T['travel_options'] if t['kind']=='FERRY'):
    q = [t for t in T['travel_options'] if t['order_id']==oid and t['kind']=='FERRY']
    sold = [t for t in q if t['status']=='SOLD_OUT']
    avail = sorted([t for t in q if t['status']=='AVAILABLE_QUOTE'], key=lambda t: t['departure_at'])
    o = O[oid]
    dps = [p for p in T['transport_points'] if p['plan_id']==o['active_plan_id'] and p['order_boundary']=='DELIVERY']
    dw = sel(dps[0]['id'], ('CUSTOMER_DELIVERY_PROMISE',)) if dps else None
    booked = [r for r in T['travel_reservations'] if r['order_id']==oid and r['kind']=='FERRY' and r['status']=='BOOKED']
    if sold and avail and dw:
        a0 = avail[0]; slack = (P(dw['end_at']) - (P(a0['arrival_at'])+timedelta(hours=3))).total_seconds()/3600
        hit('M10_FERRY_SOLD_OUT', oid, f"sold {sold[0]['departure_at'][5:16]}; next avail {a0['departure_at'][5:16]} arr {a0['arrival_at'][5:16]} quote checked {a0['checked_at'][5:16]} (age {(SNAP-P(a0['checked_at'])).total_seconds()/3600:.1f}h); promise end {dw['end_at'][5:16]}; slack {slack:.1f}h; booked ferry={bool(booked)}")
# M11 live offer while pickup endpoint needs verification and a blocking site statement exists (structured part only)
for of in T['market_offers']:
    if of['status']=='PUBLISHED':
        for oid in (of.get('order_ids') or [of['order_id']]):
            eps = [e for e in T['order_endpoint_details'] if e['order_id']==oid and e['boundary']=='PICKUP']
            if any(e['access_status']=='NEEDS_VERIFICATION' and e.get('stated_by')=='SITE_CONTACT' for e in eps):
                hit('M11_LIVE_OFFER_SITE_UNVERIFIED', oid, of['id'])
# M12 booked/market, pickup within 48h, pickup contact or access unconfirmed (expected to be noisy)
for o in T['orders']:
    if o['status'] in ('NEW','WAITING_FOR_PICKUP') and o['active_plan_id'] and not o['cancelled_at']:
        pps = [p for p in T['transport_points'] if p['plan_id']==o['active_plan_id'] and p['order_boundary']=='PICKUP']
        if not pps: continue
        w = sel(pps[0]['id'], ('SELECTED_PICKUP_SLOT',))
        if w and SNAP <= P(w['start_at']) <= SNAP+timedelta(hours=48):
            eps = [e for e in T['order_endpoint_details'] if e['order_id']==o['id'] and e['boundary']=='PICKUP']
            if any(e['contact_status']!='CONFIRMED' or e['access_status']!='CONFIRMED' for e in eps):
                hit('M12_PICKUP_48H_UNCONFIRMED', o['id'], f"slot {w['start_at'][5:16]} contact={[e['contact_status'] for e in eps]} access={[e['access_status'] for e in eps]}")
tot = collections.Counter()
for m in sorted(hits):
    rows = hits[m]
    print(f"=== {m}: {len(rows)} hits, {sum(1 for r in rows if r[1])} on orders already showing a case signal, {sum(1 for r in rows if not r[1])} on quiet orders")
    for r in rows: print('   ', r[0], 'case' if r[1] else 'QUIET', '|', r[2])
allhit = set(r[0] for rows in hits.values() for r in rows)
print('orders hit by any monitor:', len(allhit))
