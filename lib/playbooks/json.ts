import type { Prisma } from '@/lib/generated/prisma/client';

/** Plain JSON copy (Dates → ISO strings, undefined dropped) for Prisma Json columns. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
