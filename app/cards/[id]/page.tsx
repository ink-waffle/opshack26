import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { AutoRefresh } from '@/components/control/AutoRefresh';
import {
  Aside,
  DecisionCardView,
  HandOverCardView,
  TriageCardView,
} from '@/components/control/CardView';
import { FactChip } from '@/components/control/FactChip';
import { PageContainer } from '@/components/ui/AppShell';
import { ButtonLink } from '@/components/ui/Button';
import { EVIDENCE_DISPLAY, type EvidenceLevel } from '@/components/ui/evidence';
import { EvidenceLegend } from '@/components/ui/EvidenceChip';
import { Icon } from '@/components/ui/Icon';
import { KeyValue, KeyValueList } from '@/components/ui/KeyValue';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { type CardPage, getCardPage } from '@/lib/control-room/card';
import type { FactView } from '@/lib/control-room/types';

export const metadata: Metadata = { title: 'Card' };

const LEVELS: EvidenceLevel[] = [
  'VERIFIED',
  'OBSERVED',
  'BOOKED',
  'PLANNED',
  'QUOTED',
  'STATED',
  'REQUESTED',
];

export default function CardRoute(props: PageProps<'/cards/[id]'>) {
  return (
    <PageContainer>
      <Suspense fallback={<CardSkeleton />}>
        <CardContent params={props.params} />
      </Suspense>
    </PageContainer>
  );
}

async function CardContent(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const page = await getCardPage({ id });
  if (!page) notFound();
  return (
    <>
      <AutoRefresh />
      <nav className='pt-6 pb-4'>
        <Link
          href='/'
          className='text-muted hover:text-ink inline-flex items-center gap-1.5 text-sm'
        >
          <Icon name='arrow' size={14} className='rotate-180' />
          Control room
        </Link>
      </nav>
      <div className='grid items-start gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_19rem]'>
        {page.card.kind === 'TRIAGE' && page.handover ? (
          <HandOverCardView page={page} />
        ) : page.card.kind === 'TRIAGE' ? (
          <TriageCardView page={page} />
        ) : (
          <DecisionCardView page={page} />
        )}
        <CardAside page={page} />
      </div>
    </>
  );
}

function CardAside(props: { page: CardPage }) {
  const { page } = props;
  const { order, facts } = page;
  const all = Object.values(facts);
  const byLevel = LEVELS.map((level) => ({
    level,
    facts: all.filter((f) => f.level === level),
  })).filter((group) => group.facts.length);
  return (
    <aside className='grid gap-8 lg:sticky lg:top-24'>
      {order && (
        <Aside title='The order'>
          <KeyValueList divided>
            <KeyValue label='Order' mono>
              <Link href={`/orders/${order.ref}`} className='underline-offset-4 hover:underline'>
                {order.ref}
              </Link>
            </KeyValue>
            {order.customer && <KeyValue label='Customer'>{order.customer}</KeyValue>}
            {order.car && (
              <KeyValue label='Car' hint={order.plate ?? 'Plate not recorded'}>
                {order.car}
              </KeyValue>
            )}
            {order.route && <KeyValue label='Route'>{order.route}</KeyValue>}
            <KeyValue label='Status'>{order.statusLabel}</KeyValue>
          </KeyValueList>
          <ButtonLink
            href={`/orders/${order.ref}`}
            variant='quiet'
            size='sm'
            iconRight='arrow'
            className='mt-2 -ml-3.5'
          >
            Full timeline and facts
          </ButtonLink>
        </Aside>
      )}
      {page.card.kind === 'DECISION' && byLevel.length > 0 && (
        <Aside title={`What this card rests on · ${all.length}`}>
          <div className='grid gap-4'>
            {byLevel.map((group) => (
              <LevelGroup key={group.level} level={group.level} facts={group.facts} />
            ))}
          </div>
          <EvidenceLegend compact className='border-line mt-5 border-t pt-4' />
        </Aside>
      )}
      {page.card.kind === 'TRIAGE' && <EvidenceLegend compact />}
    </aside>
  );
}

function LevelGroup(props: { level: EvidenceLevel; facts: FactView[] }) {
  const { level, facts } = props;
  return (
    <div>
      <div className='text-muted mb-1.5 text-xs font-medium'>
        {EVIDENCE_DISPLAY[level].name} · {facts.length}
      </div>
      <ul className='grid gap-2'>
        {facts.slice(0, 6).map((fact) => (
          <li key={fact.id} className='grid gap-1'>
            <FactChip fact={fact} />
            <span className='text-secondary line-clamp-2 text-sm'>{fact.statement}</span>
          </li>
        ))}
        {facts.length > 6 && (
          <li className='text-muted text-sm'>and {facts.length - 6} more on the order page</li>
        )}
      </ul>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div aria-busy='true'>
      <div className='pt-6 pb-4'>
        <Skeleton className='h-4 w-28' />
      </div>
      <div className='grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]'>
        <SkeletonCard />
        <div className='grid gap-3'>
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-24 w-full' />
        </div>
      </div>
    </div>
  );
}
