// Deterministic pseudo-randomness keyed by strings (route + date), so mock searches repeat exactly.

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 generator seeded from a string; returns floats in [0, 1). */
export function seededRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(args: { items: readonly T[]; random: () => number }): T {
  const { items, random } = args;
  return items[Math.floor(random() * items.length) % items.length];
}

export function between(args: { min: number; max: number; random: () => number }): number {
  const { min, max, random } = args;
  return Math.round(min + random() * (max - min));
}

export function shortId(seed: string): string {
  return hashString(seed).toString(16).padStart(8, '0');
}
