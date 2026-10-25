'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition } from 'react';

import { cx } from '@/components/ui/cx';
import { EVIDENCE_DISPLAY } from '@/components/ui/evidence';
import { EvidenceMark } from '@/components/ui/EvidenceChip';
import { Icon } from '@/components/ui/Icon';
import { loadFactRecord } from '@/lib/control-room/actions';
import type { FactRecordView, FactView } from '@/lib/control-room/types';

// Same fills as D1's EvidenceChip, so a clickable fact looks exactly like a static one.
const CHIP = {
  REQUESTED: 'border-dashed border-grey-300 bg-transparent text-muted',
  STATED: 'border-dashed border-grey-400 bg-transparent text-grey-700',
  QUOTED: 'border-line-strong bg-surface text-body',
  PLANNED: 'border-grey-300 bg-surface text-body',
  BOOKED: 'border-info-line bg-info-soft text-teal-800',
  OBSERVED: 'border-ok-line bg-ok-soft text-green-800',
  VERIFIED: 'border-green-600 bg-ok-soft text-green-800',
} as const;

type FactChipProps = { fact: FactView; label?: string; className?: string };

// An evidence chip that opens the fact's source: statement, level, record, time with zone and UTC.
export function FactChip(props: FactChipProps) {
  const { fact, label, className } = props;
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const toggle = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setAlignRight(rect.left + 368 > window.innerWidth);
    setOpen((value) => !value);
  };

  const display = EVIDENCE_DISPLAY[fact.level];
  return (
    <span ref={ref} className={cx('relative inline-flex max-w-full', className)}>
      <button
        type='button'
        onClick={toggle}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`${display.name}: ${fact.statement}`}
        className={cx(
          'hover:shadow-pill inline-flex h-6 max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-xs font-medium whitespace-nowrap transition-[filter,box-shadow] hover:brightness-[0.97]',
          CHIP[fact.level],
          open && 'shadow-pill'
        )}
      >
        <EvidenceMark level={fact.level} />
        <span className='truncate'>{label ?? fact.label}</span>
        {fact.caution && <Icon name='warning' size={12} className='text-warn-ink -mr-0.5' />}
      </button>
      {open && <SourceView id={popoverId} fact={fact} alignRight={alignRight} />}
    </span>
  );
}

function SourceView(props: { id: string; fact: FactView; alignRight: boolean }) {
  const { id, fact, alignRight } = props;
  const display = EVIDENCE_DISPLAY[fact.level];
  const [record, setRecord] = useState<FactRecordView | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  const showRecord = () =>
    startTransition(async () => {
      setRecord(await loadFactRecord(fact.id));
    });

  return (
    <span
      id={id}
      role='dialog'
      aria-label='Where this fact comes from'
      className={cx(
        'rounded-panel bg-surface shadow-raised absolute top-[calc(100%+6px)] z-50 block w-[22rem] max-w-[calc(100vw-2rem)] p-4 text-left font-normal whitespace-normal',
        alignRight ? 'right-0' : 'left-0'
      )}
    >
      <span className='flex items-center gap-1.5 text-sm'>
        <EvidenceMark level={fact.level} size={14} />
        <span className='text-ink font-semibold'>{display.name}</span>
        <span className='text-muted'>· {display.meaning}</span>
      </span>
      <span className='text-ink mt-2 block text-base leading-snug'>{fact.statement}</span>
      {fact.caution && (
        <span className='text-warn-ink mt-2 flex items-start gap-1.5 text-sm'>
          <Icon name='warning' size={14} className='mt-0.5' />
          {fact.caution}
        </span>
      )}
      <span className='border-line-soft mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t pt-3 text-sm'>
        <span className='text-muted'>Source</span>
        <span className='text-body min-w-0'>
          {fact.source.title}
          {fact.source.detail && (
            <span className='text-muted block truncate font-mono text-xs'>
              {fact.source.detail}
            </span>
          )}
        </span>
        <span className='text-muted'>Observed</span>
        <span className='text-body' title={fact.observedUtc}>
          {fact.observedLocal}
          <span className='text-muted block text-xs'>
            {fact.age} · {fact.observedUtc}
          </span>
        </span>
        <span className='text-muted'>Kind</span>
        <span className='text-body'>{fact.kindLabel}</span>
      </span>
      <span className='mt-3 flex flex-wrap items-center gap-3 text-sm'>
        {fact.hasRecord && record === undefined && (
          <button
            type='button'
            onClick={showRecord}
            disabled={pending}
            className='text-ink hover:text-secondary decoration-line-strong inline-flex items-center gap-1 font-medium underline underline-offset-4 disabled:opacity-50'
          >
            <Icon name='document' size={14} />
            {pending ? 'Opening the record…' : 'Show the record'}
          </button>
        )}
        {fact.source.href && (
          <Link
            href={fact.source.href}
            className='text-ink decoration-line-strong inline-flex items-center gap-1 font-medium underline underline-offset-4'
          >
            Open the card
            <Icon name='arrow' size={14} />
          </Link>
        )}
      </span>
      {record === null && (
        <span className='text-muted mt-2 block text-sm'>No record is stored behind this fact.</span>
      )}
      {record && (
        <span className='bg-tray rounded-panel mt-3 block max-h-64 overflow-y-auto px-3 py-2.5'>
          <span className='text-secondary mb-1.5 block text-xs font-semibold'>{record.title}</span>
          <span className='grid grid-cols-[minmax(5rem,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
            {record.rows.map((row) => (
              <span key={row.label} className='contents'>
                <span className='text-muted'>{row.label}</span>
                <span className='text-body [overflow-wrap:anywhere]'>{row.value}</span>
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}

// A row of fact chips with a quiet "+n more" when there are many.
export function FactChips(props: {
  facts: (FactView | undefined)[];
  max?: number;
  className?: string;
}) {
  const { facts, max = 6, className } = props;
  const list = facts.filter((fact): fact is FactView => !!fact);
  const [all, setAll] = useState(false);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, max);
  return (
    <span className={cx('flex flex-wrap items-center gap-1.5', className)}>
      {shown.map((fact) => (
        <FactChip key={fact.id} fact={fact} />
      ))}
      {list.length > shown.length && (
        <button
          type='button'
          onClick={() => setAll(true)}
          className='text-muted hover:text-ink h-6 rounded-full px-2 text-xs font-medium'
        >
          +{list.length - shown.length} more
        </button>
      )}
    </span>
  );
}
