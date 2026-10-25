import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { PageContainer } from '@/components/ui/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LiveCountdown } from '@/components/ui/LiveCountdown';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ClockState } from '@/lib/clock/math';
import {
  getOrderList,
  ORDER_FILTERS,
  type OrderFilter,
  type OrderRow,
} from '@/lib/control-room/orderList';

export const metadata: Metadata = { title: 'Orders' };

const FILTER_LABEL: Record<OrderFilter, string> = {
  all: 'All',
  decision: 'Needs a decision',
  agent: 'Agent working',
  look: 'Worth a look',
  quiet: 'Quiet',
};

export default function OrdersRoute(props: PageProps<'/orders'>) {
  return (
    <PageContainer>
      <PageHeader
        title='Orders'
        description='Every order and what is going on with it. Orders that need a person come first.'
      />
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersContent searchParams={props.searchParams} />
      </Suspense>
    </PageContainer>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function OrdersContent(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.searchParams;
  const q = one(params.q)?.trim() ?? '';
  const requested = one(params.filter) as OrderFilter | undefined;
  const filter: OrderFilter = requested && ORDER_FILTERS.includes(requested) ? requested : 'all';
  const data = await getOrderList({ q, filter });
  const href = (next: OrderFilter) => {
    const search = new URLSearchParams();
    if (q) search.set('q', q);
    if (next !== 'all') search.set('filter', next);
    const text = search.toString();
    return text ? `/orders?${text}` : '/orders';
  };

  return (
    <>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-3'>
        <form action='/orders' className='flex min-w-0 flex-1 basis-80 items-center gap-2'>
          {filter !== 'all' && <input type='hidden' name='filter' value={filter} />}
          <label className='border-line-strong bg-surface focus-within:border-asphalt flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border px-4'>
            <Icon name='search' size={16} className='text-muted' />
            <span className='sr-only'>Search orders</span>
            <input
              name='q'
              defaultValue={q}
              placeholder='Reference, car, plate, customer or city'
              className='text-ink placeholder:text-faint min-w-0 flex-1 bg-transparent text-base outline-none'
            />
          </label>
          <Button type='submit'>Search</Button>
        </form>
        <nav aria-label='Filter orders' className='flex flex-wrap gap-1.5'>
          {ORDER_FILTERS.map((option) => (
            <Link
              key={option}
              href={href(option)}
              aria-current={filter === option ? 'page' : undefined}
              className={cx(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors',
                filter === option
                  ? 'bg-asphalt text-birch'
                  : 'text-secondary hover:bg-ink/5 shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
              )}
            >
              {FILTER_LABEL[option]}
              <span
                className={cx('tabular-nums', filter === option ? 'text-grey-300' : 'text-subtle')}
              >
                {data.counts[option]}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {data.rows.length ? (
        <Card padding='none' className='mt-5'>
          <div className='text-muted border-line-soft hidden grid-cols-[8.5rem_minmax(0,1.1fr)_minmax(0,1.4fr)_15rem] gap-x-5 border-b px-5 py-2.5 text-xs font-medium md:grid'>
            <span>Order</span>
            <span>Car and customer</span>
            <span>Route and promise</span>
            <span>What is going on</span>
          </div>
          <ul>
            {data.rows.map((row, i) => (
              <OrderListRow
                key={row.id}
                row={row}
                clock={data.clock}
                last={i === data.rows.length - 1}
              />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          className='mt-5'
          icon='search'
          title={q ? `No order matches “${q}”` : 'No orders here'}
        >
          Searched {data.total} orders by reference, car, plate, customer and city
          {filter !== 'all' ? `, filtered to “${FILTER_LABEL[filter].toLowerCase()}”` : ''}.
        </EmptyState>
      )}
    </>
  );
}

function OrderListRow(props: { row: OrderRow; clock: ClockState; last: boolean }) {
  const { row, clock, last } = props;
  return (
    <li className={cx(!last && 'border-line-soft border-b')}>
      <Link
        href={`/orders/${row.ref}`}
        className='hover:bg-tray grid grid-cols-1 gap-x-5 gap-y-1.5 px-5 py-3 transition-colors md:grid-cols-[8.5rem_minmax(0,1.1fr)_minmax(0,1.4fr)_15rem]'
      >
        <span>
          <span className='text-ink block font-mono text-sm'>{row.ref}</span>
          <span className='text-muted block text-sm'>{row.statusLabel}</span>
        </span>
        <span className='min-w-0'>
          <span className='text-ink block truncate text-base'>{row.car ?? 'Car not recorded'}</span>
          <span className='text-muted block truncate text-sm'>{row.customer}</span>
        </span>
        <span className='min-w-0'>
          <span className='text-body block truncate text-base'>
            {row.route ?? 'Route not recorded'}
          </span>
          <span className='text-muted block truncate text-sm'>
            {row.promise ? `Promise ${row.promise}` : 'No delivery promise recorded'}
          </span>
        </span>
        <span className='min-w-0'>
          <StateCell row={row} clock={clock} />
        </span>
      </Link>
    </li>
  );
}

function StateCell(props: { row: OrderRow; clock: ClockState }) {
  const { row, clock } = props;
  if (row.state === 'decision')
    return (
      <span className='grid justify-items-start gap-1'>
        <Badge tone='warn'>Needs a decision</Badge>
        <LiveCountdown layout='inline' clock={clock} endsAt={row.decideBy} until={row.until} />
      </span>
    );
  if (row.state === 'agent')
    return (
      <span className='grid justify-items-start gap-1'>
        <Badge tone='info' dot pulse>
          Agent working
        </Badge>
        <span className='text-muted truncate text-sm'>{row.stateNote}</span>
      </span>
    );
  if (row.state === 'look')
    return (
      <span className='grid justify-items-start gap-1'>
        <Badge>Worth a look</Badge>
        {row.decideBy && (
          <LiveCountdown
            layout='inline'
            label='Next deadline'
            clock={clock}
            endsAt={row.decideBy}
          />
        )}
      </span>
    );
  return <span className='text-muted text-sm'>Quiet</span>;
}

function OrdersSkeleton() {
  return (
    <div aria-busy='true' className='grid gap-4'>
      <Skeleton className='h-10 w-full rounded-full' />
      <div className='rounded-card bg-surface shadow-card grid gap-4 p-5'>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className='h-9 w-full' />
        ))}
      </div>
    </div>
  );
}
