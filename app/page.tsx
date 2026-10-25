import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AutoRefresh } from '@/components/control/AutoRefresh';
import {
  AgentList,
  DecisionQueueRow,
  RecentList,
  SectionHeader,
  TriageList,
} from '@/components/control/QueueRows';
import { PageContainer } from '@/components/ui/AppShell';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { formatDayTime, formatTime, plural } from '@/lib/control-room/format';
import { getControlRoom } from '@/lib/control-room/home';

export const metadata: Metadata = { title: 'Control room' };

export default function ControlRoomPage() {
  return (
    <PageContainer>
      <Suspense fallback={<ControlRoomSkeleton />}>
        <ControlRoom />
      </Suspense>
    </PageContainer>
  );
}

async function ControlRoom() {
  const data = await getControlRoom();
  const { counts, clock, now, watchman } = data;
  const headline =
    counts.decisions === 0
      ? 'Nothing needs your decision'
      : `${counts.decisions === 1 ? '1 order needs' : `${counts.decisions} orders need`} your decision`;
  const lastCheck = watchman.lastSignalAt
    ? formatTime({ at: new Date(watchman.lastSignalAt) })
    : null;

  return (
    <>
      <AutoRefresh />
      <header className='pt-8 pb-7'>
        <h1 className='font-display text-ink text-3xl font-extrabold tracking-tight'>{headline}</h1>
        <ul className='text-secondary mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-base'>
          <Counter dot='bg-warn' value={counts.decisions} label='need a decision' />
          <Counter
            dot='bg-info'
            value={counts.agents}
            label={counts.agents === 1 ? 'agent working' : 'agents working'}
          />
          <Counter dot='bg-grey-400' value={counts.triage} label='worth a look' />
          <Counter
            dot='bg-ok'
            value={counts.quiet}
            label='quiet'
            title={`${counts.quiet} of ${counts.active} active orders have no open card and no agent run.`}
          />
        </ul>
      </header>

      <section aria-labelledby='decisions'>
        <SectionHeader
          title='Needs your decision'
          note='Sorted by when the decision is due. The reason sits next to the clock.'
        />
        {data.decisions.length ? (
          <ul className='grid gap-2.5'>
            {data.decisions.map((row) => (
              <DecisionQueueRow key={row.id} row={row} clock={clock} />
            ))}
          </ul>
        ) : (
          <EmptyState
            title='No decisions waiting'
            action={
              <ButtonLink href='/orders' size='sm' icon='search'>
                Show all orders
              </ButtonLink>
            }
          >
            {counts.agents
              ? `Agents are working on ${plural({ count: counts.agents, one: 'order' })}; they bring a card here when a person must choose. `
              : 'No agent is working on an order right now. '}
            The watchman reads every new message and checks {counts.active} active orders against
            the clock every minute.
          </EmptyState>
        )}
      </section>

      <div className='mt-12 grid items-start gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
        <section aria-labelledby='triage'>
          <SectionHeader
            title='Worth a look'
            count={data.triage.length}
            note='An agent handed these back, or no playbook fits them. Each card says why and what was found.'
          />
          {data.triage.length ? (
            <TriageList rows={data.triage} clock={clock} />
          ) : (
            <EmptyState size='inline' icon='inbox' title='Nothing unusual came in'>
              Messages no playbook covers, and orders an agent hands back (an error, a rejection, a
              card nobody decided in time), land here with what was found.
            </EmptyState>
          )}
        </section>

        <section aria-labelledby='agents'>
          <SectionHeader title='Agents on it' count={data.agents.length} />
          {data.agents.length ? (
            <AgentList rows={data.agents} now={now} />
          ) : (
            <EmptyState size='inline' icon='agent' title='No agent is working right now'>
              When the watchman routes an order to a playbook, its run shows here step by step.
            </EmptyState>
          )}
          {data.recent.length > 0 && (
            <div className='mt-8'>
              <h3 className='text-secondary mb-1.5 text-sm font-semibold'>Decided recently</h3>
              <RecentList rows={data.recent} now={now} />
            </div>
          )}
        </section>
      </div>

      <footer className='border-line text-muted mt-14 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-4 text-sm'>
        <Icon name='shield' size={14} />
        <span>
          Watchman: {counts.active} active orders under watch
          {lastCheck ? ` · last flag at ${lastCheck}` : ' · nothing flagged yet'} ·{' '}
          {plural({ count: watchman.signalsLastHour, one: 'flag' })} in the last simulated hour ·
          checks every minute and on every message.
        </span>
        <span className='sr-only'>Simulated now {formatDayTime({ at: now })}</span>
      </footer>
    </>
  );
}

function Counter(props: { dot: string; value: number; label: string; title?: string }) {
  const { dot, value, label, title } = props;
  return (
    <li className='flex items-center gap-2' title={title}>
      <span aria-hidden='true' className={`size-2 rounded-full ${dot}`} />
      <span>
        <span className='text-ink font-semibold tabular-nums'>{value}</span> {label}
      </span>
    </li>
  );
}

function ControlRoomSkeleton() {
  return (
    <div aria-busy='true'>
      <div className='grid gap-3 pt-8 pb-7'>
        <Skeleton className='h-9 w-96 max-w-full' />
        <Skeleton className='h-4 w-80 max-w-full' />
      </div>
      <Skeleton className='mb-4 h-6 w-48' />
      <div className='grid gap-2.5'>
        <SkeletonCard />
      </div>
    </div>
  );
}
