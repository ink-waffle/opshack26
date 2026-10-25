// Serializable view models handed from server pages to client components.

import type { EvidenceLevel, FactSourceType } from '@/lib/generated/prisma/client';

export type FactSourceView = {
  type: FactSourceType;
  // "Bahn record · Travel reservation", "Agent tool · Searched ferries", "Operator decision".
  title: string;
  // Record id, tool call reference or card id (shown in mono).
  detail: string | null;
  href: string | null;
  raw: string;
};

export type FactView = {
  id: string;
  kind: string;
  kindLabel: string;
  level: EvidenceLevel;
  // Short chip text: "Driver said · 09:20".
  label: string;
  statement: string;
  source: FactSourceView;
  observedLocal: string;
  observedUtc: string;
  age: string;
  caution: string | null;
  hasRecord: boolean;
};

export type RecordRow = { label: string; value: string };

export type FactRecordView = { title: string; rows: RecordRow[] } | null;

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
