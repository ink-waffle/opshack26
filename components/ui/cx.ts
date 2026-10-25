type ClassValue = string | false | null | undefined | 0;

// Joins truthy class names; no dedupe or merge, keep overrides last.
export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}
