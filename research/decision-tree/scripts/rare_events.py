import sys, json, collections
sys.path.insert(0, '/private/tmp/claude-501/-Users-ink-waffle-Work-operationshackathon26/83f187d4-6609-442c-a891-67c1f3f9d5af/scratchpad/scripts')
from load import load
T = load(sys.argv[1])
ref = {o['id']: o['reference'] for o in T['orders']}
routine = set("""order.created plan.created availability.confirmed plan.activated offer.published offer.accepted assignment.booked order.status_changed assignment.started vehicle.picked_up proof.submitted expense.submitted expense.reviewed vehicle.delivered assignment.completed plan.completed proof.approved proof.require travel.booked expense.auto_recorded document.verified""".split())
by = collections.defaultdict(list)
for e in T['operational_events']:
    if e['command'] not in routine:
        by[ref.get(e['order_id'], e['order_id'])].append(e['command'])
for k in sorted(by): print(k, collections.Counter(by[k]))
# conversations per order with message count and categories
print()
mc = collections.Counter(m['conversation_id'] for m in T['messages'])
for c in sorted(T['conversations'], key=lambda c: ref.get(c['order_id'],'')):
    print(ref.get(c['order_id']), c['id'], c['category'], c['channel'], c['status'], c['counterparty_type'], 'msgs=',mc[c['id']], 'waiting_on=',c.get('waiting_on'), 'rel=', [ref.get(x) for x in c.get('related_order_ids') or []])
