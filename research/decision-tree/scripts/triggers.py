import sys, json, collections
from datetime import datetime
sys.path.insert(0, '/private/tmp/claude-501/-Users-ink-waffle-Work-operationshackathon26/83f187d4-6609-442c-a891-67c1f3f9d5af/scratchpad/scripts')
from load import load
T = load(sys.argv[1])
ref = {o['id']: o['reference'] for o in T['orders']}
P = lambda s: datetime.fromisoformat(s.replace('Z','+00:00'))
conv = {c['id']: c for c in T['conversations']}
# external inbound messages per order (incl related orders)
ext = collections.defaultdict(list)
for m in T['messages']:
    if m['author_type'] in ('driver','customer','site_contact','handoff_contact'):
        c = conv[m['conversation_id']]
        for o in set([c['order_id']] + (c.get('related_order_ids') or [])):
            ext[o].append((P(m['authored_at']), m['author_type'], m['id'], m['body'][:70]))
for t in T['support_inbox_threads']:
    for m in [m for m in T['support_inbox_messages'] if m['thread_id']==t['id'] and m['author_type'] in ('driver','customer')]:
        for o in t['linked_order_ids']: ext[o].append((P(m['authored_at']), m['author_type']+'(inbox)', m['id'], m['body'][:70]))
# structured signals: system/driver_app/terminal events that are not routine lifecycle
struct_cmds = {'alert.raised','travel.check_in_rejected','travel.gate_exception_recorded','order.readiness_assessed','pickup.attempted','offer.booking_cutoff_passed','proof.review','site_visit.arrived','vehicle.delivered','travel.check_in_confirmed'}
st = collections.defaultdict(list)
for e in T['operational_events']:
    if e['command'] in struct_cmds and e['actor_type'] in ('system','driver','operator'):
        src = 'conv' if (e.get('changes') or {}).get('conversation_id') else 'struct'
        if e['command']=='alert.raised' and src=='conv': continue  # text-derived alert
        st[e['order_id']].append((P(e['recorded_at']), e['command'], e['id']))
exc = {'incident.opened','work_item.opened','work.opened','assignment.cancelled','plan.replaced','pickup.window_revised','delivery.window_revised','trade_in.return_window_revised','pickup_window.selected','travel.rebooked','travel.amendment_requested','alert.acknowledged','alert.assessed','alert.owner_assigned','alert.followup_scheduled','alert.resolved','endpoint.access_reopened','endpoint.verification_pending','endpoint.instruction_verified','order.cancelled','market.fee_decided','offer.withdrawn','proof.review','delivery.promise_revised','delivery_window.selected'}
rows=[]
for e in sorted(T['operational_events'], key=lambda e: e['recorded_at']):
    if e['command'] not in exc or e['actor_type']=='driver': continue
    if e['command']=='offer.withdrawn' and (e.get('changes') or {}).get('reason') in ('fee_review','replaced_by_bundle', None): continue
    t = P(e['recorded_at']); o = e['order_id']
    pm = [x for x in ext[o] if x[0] <= t]
    ps = [x for x in st[o] if x[0] <= t and x[2]!=e['id']]
    lm = max(pm) if pm else None
    ls = max(ps) if ps else None
    gm = int((t-lm[0]).total_seconds()/60) if lm else None
    gs = int((t-ls[0]).total_seconds()/60) if ls else None
    rows.append((ref[o], e['recorded_at'][5:16], e['actor_type']+':'+str(e['actor_id']), e['command'], gm, lm[1] if lm else None, lm[2] if lm else None, gs, ls[1] if ls else None))
for r in rows: print(' | '.join(str(x) for x in r))
print(len(rows))
print()
for a in T['alerts']:
    ev = [e for e in T['operational_events'] if e['command']=='alert.raised' and e['target_id']==a['id']][0]
    ch = ev.get('changes') or {}
    src = 'CONVERSATION' if ch.get('conversation_id') else ('TRACKING' if ch.get('tracking_observation_id') else ('PROOF' if ch.get('proof_id') else ('DRIVER_REPORT_MSG' if ch.get('driver_report_message_id') else ('WINDOW_CALC' if ch.get('selected_pickup_window_id') else 'OTHER:'+json.dumps(ch)))))
    pm = [x for x in ext[a['order_id']] if x[0] <= P(a['triggered_at'])]
    lm = max(pm) if pm else None
    gap = int((P(a['triggered_at'])-lm[0]).total_seconds()/60) if lm else None
    print(ref[a['order_id']], a['id'], a['signal'], a['severity'], a['status'], 'source=',src, 'actor=', ev['actor_type'], ev['source'], '| last ext msg gap min:', gap, lm[1] if lm else '')
