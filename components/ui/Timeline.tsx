import type { ReactNode } from 'react';

import { cx } from '@/components/ui/cx';
import { Icon, type IconName } from '@/components/ui/Icon';

export type TimelineKind =
  'driver' | 'customer' | 'site' | 'provider' | 'agent' | 'operator' | 'system';

const KIND_ICON: Record<TimelineKind, IconName> = {
  driver: 'driver',
  customer: 'building',
  site: 'pin',
  provider: 'ferry',
  agent: 'agent',
  operator: 'operator',
  system: 'info',
};

const KIND_MARKER: Record<TimelineKind, string> = {
  driver: 'bg-surface text-secondary shadow-[0_0_0_1.5px_var(--color-line-strong)]',
  customer: 'bg-surface text-secondary shadow-[0_0_0_1.5px_var(--color-line-strong)]',
  site: 'bg-surface text-secondary shadow-[0_0_0_1.5px_var(--color-line-strong)]',
  provider: 'bg-surface text-secondary shadow-[0_0_0_1.5px_var(--color-line-strong)]',
  agent: 'bg-info-soft text-info-ink shadow-[0_0_0_1.5px_var(--color-info-line)]',
  operator: 'bg-asphalt text-birch',
  system: 'bg-grey-50 text-muted shadow-[0_0_0_1.5px_var(--color-line)]',
};

// What happened, in order: who said or did what, when, and the record behind it.
export function Timeline(props: { className?: string; children: ReactNode }) {
  const { className, children } = props;
  return <ol className={cx('relative grid', className)}>{children}</ol>;
}

type TimelineItemProps = {
  speaker: ReactNode;
  role?: ReactNode;
  at?: ReactNode;
  kind?: TimelineKind;
  icon?: IconName;
  source?: ReactNode;
  last?: boolean;
  className?: string;
  children?: ReactNode;
};

export function TimelineItem(props: TimelineItemProps) {
  const { speaker, role, at, kind = 'system', icon, source, last, className, children } = props;
  return (
    <li className={cx('relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3', className)}>
      {!last && (
        <span
          aria-hidden='true'
          className='bg-line-soft absolute top-7 bottom-0 left-[11px] w-0.5'
        />
      )}
      <span
        className={cx(
          'relative z-[1] mt-0.5 flex size-6 items-center justify-center rounded-full',
          KIND_MARKER[kind]
        )}
      >
        <Icon name={icon ?? KIND_ICON[kind]} size={13} />
      </span>
      <div className={cx('min-w-0', last ? 'pb-1' : 'pb-5')}>
        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5'>
          <span className='text-ink text-base font-semibold'>{speaker}</span>
          {role && <span className='text-muted text-sm'>{role}</span>}
          {at && (
            <span className='text-muted ml-auto text-sm whitespace-nowrap tabular-nums'>{at}</span>
          )}
        </div>
        {children && (
          <div className='text-body mt-0.5 max-w-[72ch] text-base [overflow-wrap:anywhere]'>
            {children}
          </div>
        )}
        {source && <div className='mt-1.5 flex flex-wrap gap-1.5'>{source}</div>}
      </div>
    </li>
  );
}
