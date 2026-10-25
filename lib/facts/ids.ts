// Deterministic fact ids: the same dedupeKey gives the same id in pure projections and in the DB.

function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function factIdFor(dedupeKey: string): string {
  return `f_${cyrb53(dedupeKey).toString(16).padStart(14, '0')}`;
}

/** Records filed on another order (shared sites, related threads, bundle offers) get `@<orderId>` so keys stay unique. */
export function bahnDedupeKey(args: {
  collection: string;
  recordId: string;
  kind: string;
  suffix?: string;
  scopeOrderId?: string | null;
}): string {
  const { collection, recordId, kind, suffix, scopeOrderId } = args;
  return `bahn:${collection}:${recordId}:${kind}${suffix ? `:${suffix}` : ''}${scopeOrderId ? `@${scopeOrderId}` : ''}`;
}
