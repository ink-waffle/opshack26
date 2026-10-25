import json, sys, os, collections
d = sys.argv[1]
for f in sorted(os.listdir(d)):
    if not f.endswith('.jsonl'): continue
    keys = collections.Counter()
    n=0
    for line in open(os.path.join(d,f)):
        r = json.loads(line); n+=1
        keys.update(r.keys())
    print(f"== {f} ({n}): " + ", ".join(f"{k}" + (f"[{c}]" if c!=n else "") for k,c in keys.items()))
