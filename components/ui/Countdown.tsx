import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { type CountdownThresholds, countdownTone, formatDuration } from '@/components/ui/time';
import type { Tone } from '@/components/ui/tone';

export type CountdownLayout = 'block' | 'compact' | 'inline';

export type CountdownProps = CountdownThresholds & {
  remainingMs: number | null;
  reason?: string;
  until?: string;
  label?: string;
  layout?: CountdownLayout;
  className?: string;
};

const BLOCK: Record<Tone, string> = {
  neutral: 'bg-tray shadow-[inset_0_0_0_1px_var(--color-line-soft)]',
  info: 'bg-info-soft',
  ok: 'bg-ok-soft',
  warn: 'bg-warn-soft',
  danger: 'bg-danger-soft',
};

const INK: Record<Tone, string> = {
  neutral: 'text-ink',
  info: 'text-info-ink',
  ok: 'text-ok-ink',
  warn: 'text-warn-ink',
  danger: 'text-danger-ink',
};

// Large numerals can carry the brighter brand hue and still pass contrast.
const BIG: Record<Tone, string> = { ...INK, warn: 'text-orange-600', danger: 'text-red-600' };

// Time left to decide, and why that moment matters. null means no deadline, said plainly.
export function Countdown(props: CountdownProps) {
  const {
    remainingMs,
    reason,
    until,
    label = 'Decide in',
    layout = 'block',
    warnBelowMs,
    dangerBelowMs,
    className,
  } = props;
  const tone = countdownTone(remainingMs, { warnBelowMs, dangerBelowMs });
  const none = remainingMs === null;
  const overdue = remainingMs !== null && remainingMs < 0;
  const value = none ? 'No deadline' : formatDuration(remainingMs);
  const lead = none ? null : overdue ? 'Overdue by' : label;
  const when = until ? (overdue ? `was due ${until}` : `until ${until}`) : null;
  const why = none
    ? (reason ?? 'Nothing we have promised depends on this yet.')
    : [when, reason].filter(Boolean).join(' · ');

  if (layout === 'inline') {
    return (
      <span
        role='timer'
        aria-live='off'
        className={cx('inline-flex min-w-0 items-baseline gap-1.5 text-sm', className)}
      >
        <Icon name='clock' size={14} className={cx('shrink-0 translate-y-0.5', INK[tone])} />
        {lead && <span className='text-muted shrink-0 whitespace-nowrap'>{lead}</span>}
        <span className={cx('shrink-0 font-semibold whitespace-nowrap tabular-nums', INK[tone])}>
          {value}
        </span>
        {why && <span className='text-muted min-w-0 truncate'>· {why}</span>}
      </span>
    );
  }

  if (layout === 'compact') {
    return (
      <div role='timer' aria-live='off' className={cx('min-w-0 text-sm', className)}>
        <div className='flex items-baseline gap-1.5 whitespace-nowrap'>
          <Icon name='clock' size={14} className={cx('shrink-0 translate-y-0.5', INK[tone])} />
          {lead && <span className='text-muted'>{lead}</span>}
          <span
            className={cx(
              'font-semibold tabular-nums',
              none ? 'text-secondary' : INK[tone],
              !none && 'text-base'
            )}
          >
            {value}
          </span>
        </div>
        {why && <div className='text-muted mt-0.5 line-clamp-2 pl-5'>{why}</div>}
      </div>
    );
  }

  return (
    <div
      role='timer'
      aria-live='off'
      className={cx('rounded-panel min-w-52 px-4 py-3', BLOCK[tone], className)}
    >
      {lead && (
        <div className={cx('text-sm font-medium', tone === 'neutral' ? 'text-muted' : INK[tone])}>
          {lead}
        </div>
      )}
      <div
        className={cx(
          'font-display leading-tight font-bold tracking-tight whitespace-nowrap tabular-nums',
          none ? 'text-muted text-lg' : cx('text-2xl', BIG[tone])
        )}
      >
        {value}
      </div>
      {why && <div className='text-secondary mt-1 max-w-64 text-sm'>{why}</div>}
    </div>
  );
}
