'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { LiveClockIndicator } from '@/components/ui/LiveClockIndicator';
import type { ClockState } from '@/lib/clock/math';
import { advanceClock, setClockSpeed } from '@/lib/control-room/actions';
import { OPERATOR_TZ } from '@/lib/control-room/format';

const SPEEDS = [
  { speed: 1, label: '1×', hint: 'real time' },
  { speed: 30, label: '30×', hint: '1 min = 30 min' },
  { speed: 120, label: '120×', hint: '1 min = 2 h' },
];

// The sim clock in the top bar; click it for pause, speed and a one-hour jump.
export function SimClockControl(props: { clock: ClockState }) {
  const { clock } = props;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const paused = clock.speed === 0;

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

  const run = (action: () => Promise<unknown>) =>
    startTransition(async () => void (await action()));

  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label='Simulated time. Open the simulation controls.'
        className='rounded-full focus-visible:outline-2 focus-visible:outline-offset-2'
      >
        <LiveClockIndicator
          clock={clock}
          paused={paused}
          timeZone={OPERATOR_TZ}
          className={cx('hover:shadow-raised transition-shadow', pending && 'opacity-60')}
        />
      </button>
      {open && (
        <div
          role='dialog'
          aria-label='Simulation controls'
          className='rounded-panel bg-surface shadow-raised absolute top-[calc(100%+8px)] right-0 z-50 w-72 p-4'
        >
          <div className='flex items-center gap-2'>
            <span className='bg-info-soft text-info-ink inline-flex h-5 items-center rounded-full px-2 text-xs font-medium'>
              Simulation
            </span>
            <span className='text-muted text-sm'>Demo time, not wall time</span>
          </div>
          <p className='text-secondary mt-2 text-sm'>
            Countdowns, agent waits and the watchman all run on this clock.
          </p>
          <div className='mt-3 grid grid-cols-4 gap-1.5'>
            <ClockButton
              active={paused}
              disabled={pending}
              onClick={() => run(() => setClockSpeed(0))}
              label={
                <>
                  <Icon name='pause' size={12} /> Pause
                </>
              }
            />
            {SPEEDS.map((option) => (
              <ClockButton
                key={option.speed}
                active={clock.speed === option.speed}
                disabled={pending}
                title={option.hint}
                onClick={() => run(() => setClockSpeed(option.speed))}
                label={option.label}
              />
            ))}
          </div>
          <button
            type='button'
            disabled={pending}
            onClick={() => run(() => advanceClock(60))}
            className='border-line-strong text-ink hover:bg-grey-50 mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-full border text-sm font-medium disabled:opacity-50'
          >
            <Icon name='arrow' size={14} /> Jump ahead 1 hour
          </button>
          <p className='text-muted mt-3 text-xs'>
            A jump moves every deadline closer at once; the watchman may flag orders it would
            otherwise reach later.
          </p>
        </div>
      )}
    </div>
  );
}

function ClockButton(props: {
  active: boolean;
  disabled: boolean;
  title?: string;
  onClick: () => void;
  label: React.ReactNode;
}) {
  const { active, disabled, title, onClick, label } = props;
  return (
    <button
      type='button'
      title={title}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 items-center justify-center gap-1 rounded-full text-sm font-medium transition-colors disabled:opacity-50',
        active
          ? 'bg-asphalt text-birch'
          : 'text-secondary hover:bg-grey-50 shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
      )}
    >
      {label}
    </button>
  );
}
