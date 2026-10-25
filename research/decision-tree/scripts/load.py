import json, os, collections
def load(d):
    T = {}
    for f in os.listdir(d):
        if f.endswith('.jsonl'):
            T[f[:-6]] = [json.loads(l) for l in open(os.path.join(d,f))]
    return T
