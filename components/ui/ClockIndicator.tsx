import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';

export type ClockIndicatorProps = {
  simNowMs: number | null;
  speed?: number;
  paused?: boolean;
  timeZone?: string;
  className?: string;
};

export function formatClock(
  ms: number,
  timeZone = 'UTC'
): { day: string; time: string; zone: string } {
  const date = new Date(ms);
  const day = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return { day, time: `${pick('hour')}:${pick('minute')}`, zone: pick('timeZoneName') ?? timeZone };
}

// The simulated "now" in the top bar, so nobody mistakes demo time for wall time.
export function ClockIndicator(props: ClockIndicatorProps) {
  const { simNowMs, speed = 1, paused, timeZone = 'UTC', className } = props;
  const parts = simNowMs === null ? null : formatClock(simNowMs, timeZone);
  return (
    <div
      className={cx(
        'bg-surface shadow-pill inline-flex h-9 items-center gap-2 rounded-full pr-1.5 pl-3 text-sm',
        className
      )}
      title={`Simulated time (${timeZone})${paused ? ', paused' : speed !== 1 ? `, running ${speed}× real time` : ''}`}
    >
      <Icon name='clock' size={14} className='text-muted' />
      {parts ? (
        <span className='whitespace-nowrap'>
          <span className='text-muted'>{parts.day}</span>{' '}
          <span className='text-ink font-semibold tabular-nums'>{parts.time}</span>{' '}
          <span className='text-muted text-xs'>{parts.zone}</span>
        </span>
      ) : (
        <span className='animate-pulse-soft bg-grey-100 inline-block h-3.5 w-28 rounded' />
      )}
      <span
        className={cx(
          'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium',
          paused ? 'bg-grey-100 text-secondary' : 'bg-info-soft text-info-ink'
        )}
      >
        {paused ? (
          <>
            <Icon name='pause' size={11} /> Paused
          </>
        ) : (
          <>
            <span className='animate-pulse-soft bg-info size-1.5 rounded-full' aria-hidden='true' />
            Sim {speed !== 1 ? `${speed}×` : 'live'}
          </>
        )}
      </span>
    </div>
  );
}
