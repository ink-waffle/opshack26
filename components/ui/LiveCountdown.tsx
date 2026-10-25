'use client';

import { Countdown, type CountdownLayout, type CountdownProps } from '@/components/ui/Countdown';
import { type SimNowSource, useSimNow } from '@/components/ui/useSimNow';

export type LiveCountdownProps = Omit<CountdownProps, 'remainingMs'> &
  SimNowSource & { endsAt: string | number | Date | null };

function toMs(value: string | number | Date): number {
  return typeof value === 'number' ? value : new Date(value).getTime();
}

// Ticks every second against the sim clock. Pass nowMs (sim now at render) or a clock anchor from the server.
export function LiveCountdown(props: LiveCountdownProps) {
  const { endsAt, nowMs, speed, clock, now, ...display } = props;
  const simNow = useSimNow({ nowMs, speed, clock, now });
  if (endsAt === null) return <Countdown remainingMs={null} {...display} />;
  if (simNow === null) return <CountdownPlaceholder layout={display.layout} />;
  return <Countdown remainingMs={toMs(endsAt) - simNow} {...display} />;
}

function CountdownPlaceholder(props: { layout?: CountdownLayout }) {
  if (props.layout === 'inline' || props.layout === 'compact') {
    return <span className='animate-pulse-soft bg-grey-100 inline-block h-4 w-24 rounded' />;
  }
  return <div className='animate-pulse-soft rounded-panel bg-tray h-[5.5rem] min-w-52' />;
}
