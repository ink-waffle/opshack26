import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { AmendmentCard, statusOf } from '@/components/catalog/AmendmentCard';
import { Section } from '@/components/catalog/Section';
import { PageContainer } from '@/components/ui/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { type AmendmentView, listAmendmentViews } from '@/lib/meta/store';
import { listPlaybooks } from '@/lib/playbooks/registry';
import { prisma } from '@/lib/prismaClient';

export const metadata: Metadata = { title: 'Meta' };

const LOOP: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'edit',
    title: 'A dispatcher corrects a card',
    text: 'They edit an option or reject the card, ideally with a note saying why.',
  },
  {
    icon: 'agent',
    title: 'An agent proposes a change',
    text: 'One or two sentences for one step’s instructions, or a new value for a whitelisted setting.',
  },
  {
    icon: 'search',
    title: 'It is replayed on recorded cases',
    text: 'The corrected run and earlier runs are replayed with the change. It is kept only if it does better and breaks nothing.',
  },
  {
    icon: 'operator',
    title: 'The chief dispatcher decides',
    text: 'Nothing changes until approved. After that, every new run of the playbook uses it.',
  },
];

function HowItLearns() {
  return (
    <ol className='grid gap-3 md:grid-cols-4'>
      {LOOP.map((step, index) => (
        <li key={step.title}>
          <Card padding='sm' className='h-full'>
            <div className='flex items-center gap-2'>
              <span className='bg-tray text-secondary flex size-7 items-center justify-center rounded-lg'>
                <Icon name={step.icon} size={15} />
              </span>
              <span className='text-muted text-sm tabular-nums'>{index + 1}</span>
            </div>
            <div className='text-ink mt-2 text-base font-semibold'>{step.title}</div>
            <p className='text-muted mt-1 text-sm leading-relaxed'>{step.text}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}

function History(props: { approved: AmendmentView[] }) {
  const { approved } = props;
  const playbooks = listPlaybooks();
  return (
    <div className='grid items-start gap-4 lg:grid-cols-2'>
      {playbooks.map((playbook) => {
        const items = approved.filter((view) => view.amendment.playbookId === playbook.id);
        return (
          <Card key={playbook.id}>
            <div className='flex items-baseline justify-between gap-4'>
              <Link
                href={`/playbooks/${playbook.id}`}
                className='font-display text-ink text-lg font-bold tracking-tight'
              >
                {playbook.title}
              </Link>
              <span className='text-muted text-sm tabular-nums'>
                {items.length ? `${items.length} approved` : 'none yet'}
              </span>
            </div>
            {items.length > 0 && (
              <ol className='border-line mt-3 grid gap-3 border-l pl-4'>
                {items.map((view) => (
                  <li key={view.amendment.id} className='relative'>
                    <span className='bg-ok absolute top-2 -left-[1.3rem] size-2 rounded-full' />
                    <div className='text-muted text-sm'>
                      {view.blockTitle ??
                        (view.amendment.kind === 'PARAMETER' ? 'Settings' : 'Whole playbook')}
                    </div>
                    <p className='text-ink text-base leading-relaxed'>{view.amendment.text}</p>
                    <a
                      href={`#${view.amendment.id}`}
                      className='text-secondary text-sm underline underline-offset-2'
                    >
                      Backtest and source
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        );
      })}
    </div>
  );
}

async function MetaContent() {
  await connection();
  const [views, corrected] = await Promise.all([
    listAmendmentViews(),
    prisma.card.count({ where: { kind: 'DECISION', status: { in: ['EDITED', 'REJECTED'] } } }),
  ]);
  const proposed = views.filter((view) => view.amendment.status === 'PROPOSED');
  const approved = views
    .filter((view) => view.amendment.status === 'APPROVED')
    .sort(
      (a, b) => (a.amendment.decidedAt?.getTime() ?? 0) - (b.amendment.decidedAt?.getTime() ?? 0)
    );
  const rejected = views.filter((view) => view.amendment.status === 'REJECTED');
  return (
    <>
      <Section
        title={
          <span className='inline-flex items-center gap-2.5'>
            Waiting for the chief dispatcher
            {proposed.length > 0 && <Badge tone='warn'>{proposed.length}</Badge>}
          </span>
        }
        note={`${corrected === 1 ? '1 card was' : `${corrected} cards were`} edited or rejected so far; each one is a lesson.`}
      >
        {proposed.length ? (
          <div className='grid gap-5'>
            {proposed.map((view) => (
              <AmendmentCard key={view.amendment.id} view={view} />
            ))}
          </div>
        ) : (
          <EmptyState icon='check' title='Nothing waiting for approval'>
            Proposals appear here a few minutes after a dispatcher edits or rejects a card.
          </EmptyState>
        )}
      </Section>

      <Section title='Approved, per playbook' note='Every new run of the playbook follows these.'>
        <History approved={approved} />
      </Section>

      {approved.length > 0 && (
        <Section title='Approved changes in full'>
          <div className='grid gap-5'>
            {approved.map((view) => (
              <AmendmentCard key={view.amendment.id} view={view} />
            ))}
          </div>
        </Section>
      )}

      {rejected.length > 0 && (
        <Section
          title='Not adopted'
          note='Rejected by the chief dispatcher, or discarded because the replay showed no improvement.'
        >
          <div className='grid gap-3'>
            {rejected.map((view) => (
              <details key={view.amendment.id} className='group'>
                <summary className='rounded-card bg-surface shadow-card flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5'>
                  <Badge tone={statusOf(view).tone}>{statusOf(view).label}</Badge>
                  <span className='text-ink min-w-0 flex-1 text-base'>{view.amendment.text}</span>
                  <Icon
                    name='chevron'
                    size={14}
                    className='text-muted transition-transform group-open:rotate-90'
                  />
                </summary>
                <div className='mt-2'>
                  <AmendmentCard view={view} />
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

export default function MetaPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow='Meta-system'
        title='What the playbooks learn'
        description='When a dispatcher edits or rejects a card, the system proposes how the playbook should change, replays recorded cases to check the change helps and breaks nothing, and waits for the chief dispatcher’s yes.'
      />
      <HowItLearns />
      <Suspense
        fallback={
          <div className='mt-12 grid gap-5'>
            <SkeletonCard />
          </div>
        }
      >
        <MetaContent />
      </Suspense>
    </PageContainer>
  );
}
