import Link from 'next/link';

import { cx } from '@/components/ui/cx';
import { EVIDENCE_DISPLAY, EVIDENCE_LEVELS, type EvidenceLevel } from '@/components/ui/evidence';
import { Icon } from '@/components/ui/Icon';

const CHIP: Record<EvidenceLevel, string> = {
  REQUESTED: 'border-dashed border-grey-300 bg-transparent text-muted',
  STATED: 'border-dashed border-grey-400 bg-transparent text-grey-700',
  QUOTED: 'border-line-strong bg-surface text-body',
  PLANNED: 'border-grey-300 bg-surface text-body',
  BOOKED: 'border-info-line bg-info-soft text-teal-800',
  OBSERVED: 'border-ok-line bg-ok-soft text-green-800',
  VERIFIED: 'border-green-600 bg-ok-soft text-green-800',
};

const MARK_COLOR: Record<EvidenceLevel, string> = {
  REQUESTED: 'text-ev-requested',
  STATED: 'text-ev-stated',
  QUOTED: 'text-ev-quoted',
  PLANNED: 'text-ev-planned',
  BOOKED: 'text-ev-booked',
  OBSERVED: 'text-ev-observed',
  VERIFIED: 'text-ev-verified',
};

const WEDGE: Partial<Record<EvidenceLevel, string>> = {
  QUOTED: 'M6 6V1.25A4.75 4.75 0 0 1 10.75 6Z',
  PLANNED: 'M6 6V1.25A4.75 4.75 0 0 1 6 10.75Z',
  BOOKED: 'M6 6V1.25A4.75 4.75 0 1 1 1.25 6Z',
};

// A Harvey ball that fills up as evidence gets stronger: dashed ring = asked, full disc = seen.
export function EvidenceMark(props: { level: EvidenceLevel; size?: number; className?: string }) {
  const { level, size = 12, className } = props;
  const full = level === 'OBSERVED' || level === 'VERIFIED';
  const wedge = WEDGE[level];
  return (
    <svg
      viewBox='0 0 12 12'
      width={size}
      height={size}
      aria-hidden='true'
      focusable='false'
      className={cx('shrink-0', MARK_COLOR[level], className)}
    >
      <circle
        cx='6'
        cy='6'
        r='4.75'
        fill={full ? 'currentColor' : 'none'}
        stroke='currentColor'
        strokeWidth='1.3'
        strokeDasharray={level === 'REQUESTED' ? '1.7 1.5' : undefined}
      />
      {wedge && <path d={wedge} fill='currentColor' />}
      {level === 'VERIFIED' && (
        <path
          d='M3.7 6.1 5.3 7.6 8.4 4.5'
          fill='none'
          stroke='var(--color-birch)'
          strokeWidth='1.4'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      )}
    </svg>
  );
}

export type EvidenceChipProps = {
  level: EvidenceLevel;
  label?: string;
  source?: string;
  at?: string;
  caution?: string;
  href?: string;
  className?: string;
};

// One fact's strength at a glance; hover or focus shows level, source and time. Links to the source with href.
export function EvidenceChip(props: EvidenceChipProps) {
  const { level, label, source, at, caution, href, className } = props;
  const display = EVIDENCE_DISPLAY[level];
  const text = label ?? display.name;
  const describe = [`${display.name}: ${text}`, source, at, caution].filter(Boolean).join('. ');
  const classes = cx(
    'group/ev relative inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-xs font-medium whitespace-nowrap',
    CHIP[level],
    href && 'transition-[filter,box-shadow] hover:shadow-pill hover:brightness-[0.98]',
    className
  );
  const body = (
    <>
      <EvidenceMark level={level} />
      <span className='truncate'>{text}</span>
      {caution && <Icon name='warning' size={12} className='text-warn-ink -mr-0.5' />}
      <span
        role='tooltip'
        className='bg-asphalt text-birch shadow-tooltip pointer-events-none invisible absolute bottom-[calc(100%+6px)] left-0 z-30 w-max max-w-72 rounded-lg px-3 py-2 text-left text-xs leading-snug font-normal whitespace-normal opacity-0 transition-opacity duration-100 group-hover/ev:visible group-hover/ev:opacity-100 group-focus-visible/ev:visible group-focus-visible/ev:opacity-100'
      >
        <span className='flex items-center gap-1.5 font-medium'>
          <EvidenceMark level={level} className='text-birch' />
          {display.name}
          <span className='text-grey-300 font-normal'>· {display.meaning}</span>
        </span>
        {source && <span className='text-2xs text-grey-200 mt-1 block font-mono'>{source}</span>}
        {at && <span className='text-grey-200 mt-0.5 block'>{at}</span>}
        {caution && <span className='mt-1 block text-orange-200'>{caution}</span>}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-label={describe} className={classes}>
        {body}
      </Link>
    );
  }
  return (
    <span tabIndex={0} aria-label={describe} className={cx(classes, 'cursor-default')}>
      {body}
    </span>
  );
}

// The whole ladder, weakest to strongest, for legends and the catalog.
export function EvidenceLegend(props: { className?: string; compact?: boolean }) {
  const { className, compact } = props;
  if (compact) {
    return (
      <ol className={cx('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
        {EVIDENCE_LEVELS.map((level) => (
          <li key={level} className='text-secondary flex items-center gap-1.5 text-xs'>
            <EvidenceMark level={level} />
            {EVIDENCE_DISPLAY[level].name}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className={className}>
      <ol className='grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7'>
        {EVIDENCE_LEVELS.map((level) => (
          <li key={level} className='min-w-0'>
            <span className='flex items-center gap-2'>
              <EvidenceMark level={level} size={14} />
              <span className='text-ink text-sm font-semibold'>{EVIDENCE_DISPLAY[level].name}</span>
            </span>
            <span className='text-muted mt-1 block text-xs'>{EVIDENCE_DISPLAY[level].meaning}</span>
          </li>
        ))}
      </ol>
      <div
        aria-hidden='true'
        className='text-subtle mt-3 hidden items-center gap-3 text-xs lg:flex'
      >
        <span>Weaker</span>
        <span className='h-px flex-1 bg-[linear-gradient(90deg,var(--color-grey-200),var(--color-green-600))]' />
        <span>Stronger</span>
      </div>
    </div>
  );
}
