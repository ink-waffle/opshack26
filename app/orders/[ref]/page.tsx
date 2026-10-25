import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { AutoRefresh } from '@/components/control/AutoRefresh';
import { FactsPanel, OrderTimeline, RouteStrip, RunTraces } from '@/components/control/OrderView';
import { PageContainer } from '@/components/ui/AppShell';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { LiveCountdown } from '@/components/ui/LiveCountdown';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { getOrderPage, type OrderPage } from '@/lib/control-room/order';

export const metadata: Metadata = { title: 'Order' };

export default function OrderRoute(props: PageProps<'/orders/[ref]'>) {
  return (
    <PageContainer width='wide' className='max-w-7xl'>
      <Suspense fallback={<OrderSkeleton />}>
        <OrderContent params={props.params} />
      </Suspense>
    </PageContainer>
  );
}

async function OrderContent(props: { params: Promise<{ ref: string }> }) {
  const { ref } = await props.params;
  const page = await getOrderPage({ ref: decodeURIComponent(ref) });
  if (!page) notFound();
  const { order } = page;
  return (
    <>
      <AutoRefresh />
      <nav className='pt-6'>
        <Link
          href='/orders'
          className='text-muted hover:text-ink inline-flex items-center gap-1.5 text-sm'
        >
          <Icon name='arrow' size={14} className='rotate-180' />
          Orders
        </Link>
      </nav>
      <header className='flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pt-4 pb-6'>
        <div className='min-w-0'>
          <div className='text-muted mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
            <span className='text-secondary font-mono'>{order.ref}</span>
            <span aria-hidden='true'>·</span>
            <span>{order.statusLabel}</span>
            {order.plate && (
              <>
                <span aria-hidden='true'>·</span>
                <span className='font-mono'>{order.plate}</span>
              </>
            )}
          </div>
          <h1 className='font-display text-ink text-3xl font-extrabold tracking-tight'>
            {[order.car, order.route].filter(Boolean).join(' · ')}
          </h1>
          {order.customer && (
            <p className='text-md text-secondary mt-1.5'>
              For {order.customer}
              {order.customerTier ? (
                <span className='text-muted'> · {order.customerTier} customer</span>
              ) : null}
            </p>
          )}
        </div>
      </header>

      <OpenCards page={page} />
      <RouteStrip page={page} />

      <div className='mt-8 grid items-start gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]'>
        <OrderTimeline page={page} />
        <div className='grid gap-8'>
          <RunTraces page={page} />
          <FactsPanel page={page} />
        </div>
      </div>
    </>
  );
}

function OpenCards(props: { page: OrderPage }) {
  const { page } = props;
  if (!page.openCards.length) return null;
  return (
    <div className='mb-4 grid gap-2.5'>
      {page.openCards.map((card) => (
        <Card key={card.id} padding='sm' className='flex flex-wrap items-center gap-x-6 gap-y-3'>
          <div className='min-w-0 flex-1 basis-72'>
            <Badge tone={card.kind === 'DECISION' ? 'warn' : 'neutral'}>
              {card.kind === 'DECISION' ? 'Needs your decision' : 'Worth a look'}
            </Badge>
            <div className='font-display text-md text-ink mt-1 font-bold tracking-tight'>
              {card.title}
            </div>
          </div>
          <LiveCountdown
            layout='compact'
            label={card.kind === 'DECISION' ? 'Decide in' : 'Next deadline'}
            clock={page.clock}
            endsAt={card.decideBy}
            until={card.until}
            reason={card.reason}
            className='max-w-80'
          />
          <ButtonLink
            href={`/cards/${card.id}`}
            variant={card.kind === 'DECISION' ? 'primary' : 'secondary'}
            iconRight='arrow'
          >
            Open the card
          </ButtonLink>
        </Card>
      ))}
    </div>
  );
}

function OrderSkeleton() {
  return (
    <div aria-busy='true'>
      <div className='grid gap-3 pt-10 pb-6'>
        <Skeleton className='h-4 w-40' />
        <Skeleton className='h-9 w-96 max-w-full' />
      </div>
      <Skeleton className='rounded-card h-36 w-full' />
      <div className='mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]'>
        <SkeletonCard />
        <Skeleton className='rounded-card h-64 w-full' />
      </div>
    </div>
  );
}
