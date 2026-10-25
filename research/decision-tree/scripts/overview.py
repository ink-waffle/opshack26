import json, sys, collections, os
D = sys.argv[1]
def load(n):
    with open(os.path.join(D, n + '.jsonl')) as f:
        return [json.loads(l) for l in f if l.strip()]
orders = {o['id']: o for o in load('orders')}
print('ORDER KEYS:', list(next(iter(orders.values())).keys()))
print('status', collections.Counter(o['status'] for o in orders.values()))
print('lane', collections.Counter(o.get('display_lane') for o in orders.values()))
print()
for name in ['alerts','incidents','agent_proposals','work_items','endpoint_claims','internal_notifications','order_notes','support_inbox_threads','custody_reports','site_visits']:
    rows = load(name)
    print('=====', name, len(rows), 'keys:', list(rows[0].keys()))
for a in load('alerts'):
    print('ALERT', orders.get(a.get('order_id'),{}).get('reference'), a.get('type') or a.get('kind'), a.get('status'), a.get('severity'), '|', (a.get('summary') or a.get('message') or '')[:160])
print()
for i in load('incidents'):
    print('INCIDENT', orders.get(i.get('order_id'),{}).get('reference'), i.get('type') or i.get('kind'), i.get('status'), '|', (i.get('summary') or i.get('description') or '')[:200])
print()
for p in load('agent_proposals'):
    r = p.get('review') or {}
    print('PROPOSAL', orders.get(p['order_id'],{}).get('reference'), p['command'], p['status'], '| review:', r.get('decision') or r.get('outcome'), (r.get('note') or r.get('comment') or '')[:120], '|', p['summary'][:150])
print()
for w in load('work_items'):
    print('WORK', orders.get(w.get('order_id'),{}).get('reference'), w.get('type') or w.get('kind'), w.get('status'), w.get('created_by'), '|', (w.get('summary') or '')[:140], '| next:', (w.get('next_action') or '')[:100])
print()
convs = load('conversations')
print('CONV categories', collections.Counter(c.get('category') for c in convs))
print('CONV status', collections.Counter(c.get('status') for c in convs))
print('CONV waiting_on', collections.Counter(c.get('waiting_on') for c in convs))
