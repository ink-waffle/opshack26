import {
  CLAIM_KINDS,
  type ClaimKind,
  type Domain,
  DOMAINS,
  EVIDENCE_LEVELS,
  type EvidenceLevel,
  type EvidenceRequirement,
  FACT_KINDS,
  type FactKind,
  LADDER_CHAINS,
  LEVEL_MEANING,
  levelRank,
} from '@/lib/evidence/ladder';

export type LadderRow = {
  domain: Domain;
  domainLabel: string;
  kind: FactKind;
  label: string;
  level: EvidenceLevel;
  levelRank: number;
  levelNote: string | null;
  sources: string[];
  doesNotProve: string[];
};

export type ClaimRow = {
  domain: Domain;
  kind: ClaimKind;
  label: string;
  requirement: string;
  agentMayAssert: boolean;
  note: string | null;
};

function describeRequirement(requirement: EvidenceRequirement): string {
  const kinds = requirement.kinds.join(' or ');
  const where = requirement.where
    ? ` with ${Object.entries(requirement.where)
        .map(([field, values]) => `${field} ${values.join('/')}`)
        .join(', ')}`
    : '';
  const age = requirement.maxAgeMinutes ? `, checked within ${requirement.maxAgeMinutes} min` : '';
  return `${kinds} at ${requirement.minLevel}+${where}${age}`;
}

export function describeClaimRequirement(kind: ClaimKind): string {
  return CLAIM_KINDS[kind].anyOf.map(describeRequirement).join('; or ');
}

/** One row per fact kind, weakest domain-level first, for the UI ladder view. */
export function ladderRows(): LadderRow[] {
  return (Object.keys(FACT_KINDS) as FactKind[]).map((kind) => {
    const spec = FACT_KINDS[kind];
    return {
      domain: spec.domain,
      domainLabel: DOMAINS[spec.domain],
      kind,
      label: spec.label,
      level: spec.level,
      levelRank: levelRank(spec.level),
      levelNote: 'levelNote' in spec ? spec.levelNote : null,
      sources: [...spec.sources],
      doesNotProve: [...spec.doesNotProve],
    };
  });
}

export function claimRows(): ClaimRow[] {
  return (Object.keys(CLAIM_KINDS) as ClaimKind[]).map((kind) => {
    const spec = CLAIM_KINDS[kind];
    return {
      domain: spec.domain,
      kind,
      label: spec.label,
      requirement: describeClaimRequirement(kind),
      agentMayAssert: spec.agentMayAssert,
      note: 'note' in spec ? spec.note : null,
    };
  });
}

/** Markdown injected into every agent prompt: levels, per-domain rungs and rules, and what each claim needs. */
export function renderLadderForAgents(): string {
  const lines: string[] = [
    '## Evidence ladder',
    '',
    'Every fact has an evidence level. A claim needs a cited fact at or above the level its kind requires.',
    'Cite fact ids for every state you assert. A weaker fact never upgrades a claim: a quote, a driver report, an ETA, a photo or an alert proves nothing above its own level.',
    '',
    '### Levels (weakest → strongest)',
    '',
    ...EVIDENCE_LEVELS.map((level, index) => `${index + 1}. **${level}**: ${LEVEL_MEANING[level]}`),
    '',
    '### Rungs and rules',
    '',
  ];
  for (const chain of LADDER_CHAINS) {
    lines.push(`**${chain.title}**${chain.rungs.length ? `: ${chain.rungs.join(' → ')}` : ''}`);
    for (const rule of chain.rules) lines.push(`- ${rule}`);
    lines.push('');
  }
  lines.push('### Claims and the minimum evidence they need', '');
  lines.push('| Claim | Means | Minimum evidence |', '|---|---|---|');
  for (const row of claimRows()) {
    const requirement = row.agentMayAssert
      ? row.requirement
      : 'never asserted by an agent (human decision)';
    lines.push(`| ${row.kind} | ${row.label} | ${requirement}${row.note ? `. ${row.note}` : ''} |`);
  }
  lines.push(
    '',
    'Phrase weaker evidence as what it is: "quoted at 07:00, not booked", "driver reports", "app estimate", "requested by the customer".'
  );
  return lines.join('\n');
}

/** Short plain criteria for decision-model questions (Jev); optionally only some domains. */
export function renderLadderForDecisions(args: { domains?: Domain[] } = {}): string {
  const { domains } = args;
  const chains = LADDER_CHAINS.filter((chain) => !domains || domains.includes(chain.domain));
  const lines = [
    `Evidence levels, weakest to strongest: ${EVIDENCE_LEVELS.join(' < ')}.`,
    'A statement, quote, estimate or alert never proves a physical state or a commitment.',
    ...chains.flatMap((chain) => chain.rules),
  ];
  return lines.join('\n');
}
