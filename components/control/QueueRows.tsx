import Link from 'next/link';
import type { ReactNode } from 'react';

import { When } from '@/components/control/When';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LiveCountdown } from '@/components/ui/LiveCountdown';
import type { ClockState } from '@/lib/clock/math';
import type { AgentRow, DecisionRow, RecentRow, TriageRow } from '@/lib/control-room/home';
import type { OrderSummary } from '@/lib/control-room/orders';

export function OrderLine(props: { order: OrderSummary | null; className?: string }) {
  const { order, className } = props;
  if (!order) return <span className={cx('text-muted text-sm', className)}>No order</span>;
  return (
    <span
      className={cx('text-muted flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm', className)}
    >
      <span className='text-secondary font-mono'>{order.ref}</span>
      {order.route && <span>{order.route}</span>}
      {order.car && (
        <>
          <span aria-hidden='true'>·</span>
          <span className='truncate'>{order.car}</span>
        </>
      )}
    </span>
  );
}

function IconTile(props: { icon: IconName; tone?: 'neutral' | 'info' }) {
  const { icon, tone = 'neutral' } = props;
  return (
    <span
      className={cx(
        'flex size-9 shrink-0 items-center justify-center rounded-xl',
        tone === 'info' ? 'bg-info-soft text-info-ink' : 'bg-grey-50 text-secondary'
      )}
    >
      <Icon name={icon} size={18} />
    </span>
  );
}

// A decision waiting for a person: what is wrong, what the agent recommends, and how long is left.
export function DecisionQueueRow(props: { row: DecisionRow; clock: ClockState }) {
  const { row, clock } = props;
  return (
    <Card as='li' padding='none' interactive>
      <Link
        href={`/cards/${row.id}`}
        className='grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2.5 px-4 py-3.5 sm:grid-cols-[2.25rem_minmax(0,1fr)_17rem]'
      >
        <IconTile icon={row.playbook.icon} />
        <span className='min-w-0'>
          <OrderLine order={row.order} />
          <span className='mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1'>
            <span className='font-display text-md text-ink font-bold tracking-tight'>
              {row.title}
            </span>
            <Badge>{row.optionCount === 1 ? '1 option' : `${row.optionCount} options`}</Badge>
          </span>
          {row.recommended && (
            <span className='text-secondary mt-1 block truncate text-sm'>
              <span className='text-muted'>Agent recommends </span>
              {row.recommended}
            </span>
          )}
        </span>
        <span className='col-start-2 sm:col-start-3'>
          <LiveCountdown
            layout='compact'
            clock={clock}
            endsAt={row.decideBy}
            until={row.until}
            reason={row.reason}
          />
        </span>
      </Link>
    </Card>
  );
}

function TriageItem(props: { row: TriageRow; clock: ClockState; last: boolean }) {
  const { row, clock, last } = props;
  return (
    <li className={cx(!last && 'border-line-soft border-b')}>
      <Link
        href={`/cards/${row.id}`}
        className='hover:bg-tray grid grid-cols-1 gap-x-4 gap-y-1.5 px-4 py-3 transition-colors sm:grid-cols-[minmax(0,1fr)_12.5rem]'
      >
        <span className='min-w-0'>
          <OrderLine order={row.order} />
          <span className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1'>
            <span className='text-ink text-base font-medium'>{row.title}</span>
            {row.handover && (
              <Badge tone='warn' icon='inbox'>
                Agent handed over
              </Badge>
            )}
          </span>
          {row.quote && (
            <span className='text-secondary mt-0.5 block truncate text-sm'>
              {row.speaker && <span className='text-muted'>{row.speaker}: </span>}“{row.quote}”
            </span>
          )}
        </span>
        <span className='self-start sm:pt-0.5'>
          <LiveCountdown
            layout='compact'
            label='Next deadline'
            clock={clock}
            endsAt={row.decideBy}
            until={row.until}
            reason={row.decideBy ? row.reason : 'Nothing booked depends on it yet.'}
          />
        </span>
      </Link>
    </li>
  );
}

// Escape-hatch cards: no playbook fits, but a person should look. Quiet, and folded after the first few.
export function TriageList(props: { rows: TriageRow[]; clock: ClockState; show?: number }) {
  const { rows, clock, show = 4 } = props;
  const head = rows.slice(0, show);
  const tail = rows.slice(show);
  return (
    <Card padding='none'>
      <ul>
        {head.map((row, i) => (
          <TriageItem
            key={row.id}
            row={row}
            clock={clock}
            last={i === head.length - 1 && !tail.length}
          />
        ))}
      </ul>
      {tail.length > 0 && (
        <details className='group border-line-soft border-t'>
          <summary className='text-secondary hover:text-ink flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-sm font-medium'>
            <Icon name='chevron' size={14} className='transition-transform group-open:rotate-90' />
            <span className='group-open:hidden'>Show {tail.length} more</span>
            <span className='hidden group-open:inline'>Show fewer</span>
          </summary>
          <ul className='border-line-soft border-t'>
            {tail.map((row, i) => (
              <TriageItem key={row.id} row={row} clock={clock} last={i === tail.length - 1} />
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

// A run the agent is carrying out by itself, with the step it is on in plain words.
export function AgentList(props: { rows: AgentRow[]; now: Date }) {
  const { rows, now } = props;
  return (
    <Card padding='none'>
      <ul>
        {rows.map((row, i) => (
          <li key={row.runId} className={cx(i < rows.length - 1 && 'border-line-soft border-b')}>
            <Link
              href={row.order ? `/orders/${row.order.ref}` : '#'}
              className='hover:bg-tray flex items-start gap-3 px-4 py-3 transition-colors'
            >
              <IconTile icon={row.playbook.icon} tone='info' />
              <span className='min-w-0 flex-1'>
                <OrderLine order={row.order} />
                <span className='text-ink mt-0.5 block text-base font-medium'>{row.step}</span>
                <span className='text-muted mt-0.5 block text-sm'>
                  {row.playbook.title} · since <When at={row.since} now={now} />
                </span>
              </span>
              <Badge tone='info' dot pulse>
                Working
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function RecentList(props: { rows: RecentRow[]; now: Date }) {
  const { rows, now } = props;
  return (
    <ul className='grid gap-1'>
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/cards/${row.id}`}
            className='hover:bg-surface rounded-panel grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5 px-2 py-2 transition-colors'
          >
            <Icon
              name={row.tone === 'ok' ? 'check' : row.tone === 'danger' ? 'cross' : 'clock'}
              size={15}
              className={cx(
                'mt-[3px]',
                row.tone === 'ok'
                  ? 'text-ok-ink'
                  : row.tone === 'danger'
                    ? 'text-danger-ink'
                    : 'text-muted'
              )}
            />
            <span className='min-w-0'>
              <span className='text-body block truncate text-sm'>
                <span className='text-secondary font-mono'>{row.order?.ref}</span> {row.title}
              </span>
              <span className='text-muted block text-sm'>
                {row.outcome}
                {row.decidedAt && (
                  <>
                    {' at '}
                    <When at={row.decidedAt} now={now} />
                  </>
                )}{' '}
                · {row.next}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SectionHeader(props: { title: string; count?: number; note?: ReactNode }) {
  const { title, count, note } = props;
  return (
    <div className='mb-3.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1'>
      <h2 className='font-display text-ink flex items-baseline gap-2 text-xl font-bold tracking-tight'>
        {title}
        {count !== undefined && (
          <span className='text-subtle font-sans text-base font-medium tabular-nums'>{count}</span>
        )}
      </h2>
      {note && <p className='text-muted max-w-[60ch] text-sm sm:text-right'>{note}</p>}
    </div>
  );
}
