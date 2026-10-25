import { formatUtc, formatWhen } from '@/lib/control-room/format';

// A desk time with its zone ("09:42 EEST", or with the day when it is not today), UTC on hover.
export function When(props: { at: Date | string; now: Date; className?: string }) {
  const { now, className } = props;
  const at = typeof props.at === 'string' ? new Date(props.at) : props.at;
  return (
    <time dateTime={at.toISOString()} title={formatUtc(at)} className={className}>
      {formatWhen({ at, now })}
    </time>
  );
}
