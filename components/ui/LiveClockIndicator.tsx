'use client';

import { ClockIndicator, type ClockIndicatorProps } from '@/components/ui/ClockIndicator';
import { type SimNowSource, useSimNow } from '@/components/ui/useSimNow';

export type LiveClockIndicatorProps = Omit<ClockIndicatorProps, 'simNowMs'> & SimNowSource;

// Top-bar sim clock that ticks; give it the clock anchor from control.sim_clock.
export function LiveClockIndicator(props: LiveClockIndicatorProps) {
  const { nowMs, clock, now, ...display } = props;
  const speed = props.speed ?? clock?.speed ?? 1;
  const simNow = useSimNow({ nowMs, speed: display.paused ? 0 : speed, clock, now });
  return <ClockIndicator simNowMs={simNow} {...display} speed={speed} />;
}
