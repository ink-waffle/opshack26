import sys, json
sys.path.insert(0, '/private/tmp/claude-501/-Users-ink-waffle-Work-operationshackathon26/83f187d4-6609-442c-a891-67c1f3f9d5af/scratchpad/scripts')
from load import load
T = load(sys.argv[1])
ref = {o['id']: o['reference'] for o in T['orders']}
ev = {e['id']: e for e in T['operational_events']}
for p in sorted(T['agent_proposals'], key=lambda p: p['created_at']):
    r = p.get('review') or {}
    ex = p.get('execution') or {}
    eff = [ (ev[i]['actor_type'], ev[i]['actor_id'], ev[i]['command']) for i in ex.get('effect_event_ids') or [] if i in ev]
    diff = {}
    if r.get('final_payload') is not None:
        pp, fp = p['proposed_payload'], r['final_payload']
        for k in set(pp)|set(fp):
            if pp.get(k) != fp.get(k): diff[k] = (pp.get(k), fp.get(k))
    print(f"{ref[p['order_id']]} | {p['id']} | {p['proposed_by_agent_id']} | {p['command']} | created {p['created_at'][5:16]} | status {p['status']} | review {r.get('decision')} by {r.get('reviewer_id')} at {(r.get('reviewed_at') or '')[5:16]} | note: {r.get('decision_note')} | diff: {json.dumps(diff, ensure_ascii=False)} | exec: {ex.get('status')} {ex.get('error') or ''} eff={eff}")
    print(f"     proposed={json.dumps(p['proposed_payload'], ensure_ascii=False)} | summary: {p['summary']} | rationale: {p['rationale']}")
print()
for a in T['agents']: print(a)
