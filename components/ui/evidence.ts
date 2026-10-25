// Display metadata for the evidence ladder; order and names mirror lib/evidence (the single source).
export const EVIDENCE_LEVELS = [
  'REQUESTED',
  'STATED',
  'QUOTED',
  'PLANNED',
  'BOOKED',
  'OBSERVED',
  'VERIFIED',
] as const;

export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const EVIDENCE_DISPLAY: Record<EvidenceLevel, { name: string; meaning: string }> = {
  REQUESTED: { name: 'Requested', meaning: 'We asked for it. No answer yet.' },
  STATED: { name: 'Stated', meaning: 'Someone said so: a driver, site or customer.' },
  QUOTED: { name: 'Quoted', meaning: 'A provider offered it. Not bought, and it goes stale.' },
  PLANNED: { name: 'Planned', meaning: 'In our plan or schedule. Nothing reserved yet.' },
  BOOKED: { name: 'Booked', meaning: 'Reserved with a reference.' },
  OBSERVED: { name: 'Observed', meaning: 'A system event saw it happen: gate scan, pickup event.' },
  VERIFIED: { name: 'Verified', meaning: 'Confirmed by a person or a second independent source.' },
};

export function evidenceRank(level: EvidenceLevel): number {
  return EVIDENCE_LEVELS.indexOf(level);
}
