import Link from 'next/link';
import type { ReactNode } from 'react';

import { cx } from '@/components/ui/cx';
import { Icon, type IconName } from '@/components/ui/Icon';
import { type Tone, TONE_DOT, TONE_SOFT } from '@/components/ui/tone';

type BadgeProps = {
  tone?: Tone;
  dot?: boolean;
  icon?: IconName;
  pulse?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
};

// A short status word on a soft tone fill: "Awaiting decision", "Agent working", "Booked".
export function Badge(props: BadgeProps) {
  const { tone = 'neutral', dot, icon, pulse, title, className, children } = props;
  return (
    <span
      title={title}
      className={cx(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        TONE_SOFT[tone],
        className
      )}
    >
      {dot && (
        <span
          aria-hidden='true'
          className={cx('size-1.5 rounded-full', TONE_DOT[tone], pulse && 'animate-pulse-soft')}
        />
      )}
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

type ChipProps = {
  icon?: IconName;
  tone?: Tone;
  mono?: boolean;
  href?: string;
  title?: string;
  className?: string;
  children: ReactNode;
};

const CHIP_TONE: Record<Tone, string> = {
  neutral: 'border-line text-secondary',
  danger: 'border-danger-line text-danger-ink',
  warn: 'border-warn-line text-warn-ink',
  ok: 'border-ok-line text-ok-ink',
  info: 'border-info-line text-info-ink',
};

// An outlined pill for a fact about the thing: plate, route, customer. Becomes a link with href.
export function Chip(props: ChipProps) {
  const { icon, tone = 'neutral', mono, href, title, className, children } = props;
  const classes = cx(
    'inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full border bg-surface px-2.5 py-0.5 text-sm leading-tight',
    CHIP_TONE[tone],
    mono && 'font-mono text-xs tracking-normal',
    href && 'transition-colors hover:border-line-strong hover:text-ink',
    className
  );
  const body = (
    <>
      {icon && <Icon name={icon} size={13} className='opacity-70' />}
      <span className='truncate'>{children}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} title={title} className={classes}>
        {body}
      </Link>
    );
  }
  return (
    <span title={title} className={classes}>
      {body}
    </span>
  );
}
