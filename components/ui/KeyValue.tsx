import type { ReactNode } from 'react';

import { cx } from '@/components/ui/cx';
import { type Tone, TONE_TEXT } from '@/components/ui/tone';

type KeyValueListProps = { divided?: boolean; className?: string; children: ReactNode };

// A <dl> of facts: label on the left, value in the middle, evidence chip on the right.
export function KeyValueList(props: KeyValueListProps) {
  const { divided, className, children } = props;
  return (
    <dl className={cx('grid', divided ? 'divide-line-soft divide-y' : 'gap-y-1.5', className)}>
      {children}
    </dl>
  );
}

type KeyValueProps = {
  label: ReactNode;
  hint?: ReactNode;
  aside?: ReactNode;
  tone?: Tone;
  mono?: boolean;
  className?: string;
  children: ReactNode;
};

export function KeyValue(props: KeyValueProps) {
  const { label, hint, aside, tone, mono, className, children } = props;
  return (
    <div
      className={cx(
        'grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)] items-baseline gap-x-4 py-1.5 sm:grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)_auto]',
        className
      )}
    >
      <dt className='text-muted text-sm'>{label}</dt>
      <dd
        className={cx(
          'text-ink min-w-0 text-base',
          mono && 'font-mono text-sm',
          tone && tone !== 'neutral' && TONE_TEXT[tone]
        )}
      >
        {children}
        {hint && <span className='text-muted mt-0.5 block text-sm'>{hint}</span>}
      </dd>
      {aside && (
        <dd className='col-start-2 mt-1 sm:col-start-3 sm:mt-0 sm:justify-self-end'>{aside}</dd>
      )}
    </div>
  );
}
