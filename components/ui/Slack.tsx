import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { formatDuration, slackTone } from '@/components/ui/time';
import { TONE_SOFT } from '@/components/ui/tone';

type SlackProps = { slackMs: number | null; label?: string; className?: string };

// Promise slack for one option: green when the customer promise holds with room, red when it breaks.
export function Slack(props: SlackProps) {
  const { slackMs, label, className } = props;
  if (slackMs === null) {
    return (
      <span
        className={cx(
          'border-line-strong text-muted inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed px-2.5 text-xs font-medium',
          className
        )}
      >
        {label ?? 'Promise impact unknown'}
      </span>
    );
  }
  const tone = slackTone(slackMs);
  const text =
    label ??
    (slackMs < 0
      ? `Promise breaks · ${formatDuration(slackMs)} late`
      : `Promise holds · ${formatDuration(slackMs)} spare`);
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap tabular-nums',
        TONE_SOFT[tone],
        className
      )}
    >
      <Icon name={slackMs < 0 ? 'warning' : 'check'} size={12} />
      {text}
    </span>
  );
}
