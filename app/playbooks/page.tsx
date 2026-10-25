import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { KIND_COUNT_LABEL, KIND_ORDER } from '@/components/catalog/kinds';
import { Markdown } from '@/components/catalog/Markdown';
import { Section } from '@/components/catalog/Section';
import { SystemOverview } from '@/components/catalog/SystemOverview';
import { GateReplayPanel } from '@/components/control/GateReplayPanel';
import { PageContainer } from '@/components/ui/AppShell';
import { Badge, Chip } from '@/components/ui/Badge';
import { Card, CardSection } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatWhen } from '@/lib/control-room/format';
import { loadNow, simTimeOf } from '@/lib/control-room/time';
import { GUARDRAILS } from '@/lib/gate/actions';
import { resolveRoutingParams } from '@/lib/meta/params';
import { playbookStats } from '@/lib/meta/stats';
import { readSharedRules } from '@/lib/playbooks/prompt';
import { listPlaybooks } from '@/lib/playbooks/registry';
import type { PlaybookDefinition } from '@/lib/playbooks/types';
import { prisma } from '@/lib/prismaClient';
import { TRIGGERS, type TriggerType } from '@/lib/watchman/taxonomy';

export const metadata: Metadata = { title: 'Playbooks' };

const PLAYBOOK_ICON: Record<string, IconName> = {
  'missed-connection': 'ferry',
  'vehicle-warning': 'warning',
  'pickup-unconfirmed': 'clock',
};

// G8 and G10 are not hard blocks in code yet (C1); say so instead of overstating.
const GUARDRAIL_NOTE: Record<string, string> = {
  G8: 'Shown as a warning; the booking step re-checks the quote itself.',
  G10: 'Not checked by code yet.',
};

function plural(count: number, [one, many]: [string, string]) {
  return `${count} ${count === 1 ? one : many}`;
}

async function PlaybookList() {
  const { clock, now } = await loadNow();
  const [stats, routing] = await Promise.all([playbookStats(), resolveRoutingParams()]);
  const playbooks = listPlaybooks();
  const triggersFor = (definition: PlaybookDefinition) => {
    const routed = Object.entries(routing.triggers)
      .filter(([, route]) => route.playbookId === definition.id)
      .map(([type, route]) => ({ type: type as TriggerType, threshold: route.threshold }));
    const extra = definition.triggers
      .filter((type) => !routed.some((r) => r.type === type) && type in TRIGGERS)
      .map((type) => ({ type: type as TriggerType, threshold: null }));
    return [...routed, ...extra];
  };
  return (
    <ul className='grid gap-4 lg:grid-cols-2'>
      {playbooks.map((definition) => {
        const stat = stats[definition.id];
        const counts = KIND_ORDER.map((kind) => ({
          kind,
          count: definition.blocks.filter((block) => block.kind === kind).length,
        })).filter((entry) => entry.count > 0);
        return (
          <Card key={definition.id} as='li' interactive className='flex flex-col'>
            <div className='flex items-start gap-3'>
              <span className='bg-tray text-secondary flex size-10 shrink-0 items-center justify-center rounded-xl'>
                <Icon name={PLAYBOOK_ICON[definition.id] ?? 'flow'} size={20} />
              </span>
              <div className='min-w-0'>
                <h3 className='font-display text-ink text-xl leading-tight font-bold tracking-tight'>
                  <Link
                    href={`/playbooks/${definition.id}`}
                    className='after:absolute after:inset-0'
                  >
                    {definition.title}
                  </Link>
                </h3>
                <p className='text-body mt-1.5 text-base leading-relaxed'>{definition.summary}</p>
              </div>
            </div>
            <CardSection title='Starts when the watchman sees'>
              <div className='flex flex-wrap gap-1.5'>
                {triggersFor(definition).map(({ type, threshold }) => (
                  <Chip key={type} icon='search'>
                    {TRIGGERS[type].label}
                    {threshold !== null && (
                      <span className='text-muted'>
                        {' '}
                        · at least {Math.round(threshold * 100)} % sure
                      </span>
                    )}
                  </Chip>
                ))}
              </div>
            </CardSection>
            <CardSection title={`${definition.blocks.length} steps`}>
              <p className='text-body text-base'>
                {counts
                  .map((entry) => plural(entry.count, KIND_COUNT_LABEL[entry.kind]))
                  .join(' · ')}
              </p>
            </CardSection>
            <div className='border-line-soft mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-sm'>
              <span className='text-muted tabular-nums'>
                {stat?.runs ? plural(stat.runs, ['run', 'runs']) : 'Not run yet'}
                {stat?.lastRunAt
                  ? `, last ${formatWhen({ at: simTimeOf({ real: stat.lastRunAt, clock }), now })}`
                  : ''}
              </span>
              {stat?.approvedAmendments ? (
                <Badge tone='ok' icon='spark'>
                  {plural(stat.approvedAmendments, ['approved change', 'approved changes'])}
                </Badge>
              ) : null}
              {stat?.proposedAmendments ? (
                <Badge tone='warn'>
                  {plural(stat.proposedAmendments, ['change waiting', 'changes waiting'])}
                </Badge>
              ) : null}
              <span className='text-ink ml-auto inline-flex items-center gap-1 font-medium'>
                Open diagram <Icon name='arrow' size={14} />
              </span>
            </div>
          </Card>
        );
      })}
    </ul>
  );
}

async function AgentRules() {
  await connection();
  const [shared, openTriage] = await Promise.all([
    readSharedRules(),
    prisma.card.count({ where: { kind: 'TRIAGE', status: 'OPEN' } }),
  ]);
  return (
    <>
      <div className='grid items-start gap-4 lg:grid-cols-2'>
        <Card>
          <h3 className='font-display text-ink text-lg font-bold tracking-tight'>
            Guardrails, checked by code
          </h3>
          <p className='text-muted mt-1 text-sm'>
            After an agent answers, fixed rules check every option. An option that breaks one is
            shown as blocked and cannot be approved as is.
          </p>
          <ul className='mt-4 grid gap-3'>
            {Object.entries(GUARDRAILS).map(([id, guardrail]) => (
              <li key={id} className='grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3'>
                <span className='text-muted font-mono text-sm leading-6'>{id}</span>
                <div>
                  <div className='text-ink text-base font-medium'>{guardrail.title}</div>
                  <p className='text-body text-base leading-relaxed'>{guardrail.rule}</p>
                  {GUARDRAIL_NOTE[id] && (
                    <p className='text-muted mt-0.5 text-sm'>{GUARDRAIL_NOTE[id]}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className='font-display text-ink text-lg font-bold tracking-tight'>
            What every agent is told
          </h3>
          <p className='text-muted mt-1 text-sm'>
            These rules open every agent’s instructions, in every playbook, before its own task.
          </p>
          <Markdown className='mt-3'>
            {shared.replace(/^# .*\n+/, '').replace(/^These apply.*\n+/m, '')}
          </Markdown>
        </Card>
      </div>
      <Card className='mt-4'>
        <div className='flex flex-wrap items-start gap-4'>
          <span className='bg-tray text-secondary flex size-10 shrink-0 items-center justify-center rounded-xl'>
            <Icon name='inbox' size={20} />
          </span>
          <div className='min-w-0 flex-1 basis-96'>
            <h3 className='font-display text-ink text-lg font-bold tracking-tight'>
              The escape hatch: when nothing fits, a person takes it
            </h3>
            <p className='text-body mt-1.5 text-base leading-relaxed'>
              The system never guesses its way around an unknown situation. Whenever it is outside
              what a playbook covers, it stops and hands the case to a person with the facts it has
              gathered.
            </p>
            <ul className='marker:text-faint mt-3 list-disc space-y-1.5 pl-5 text-base'>
              <li>
                A message matches no trigger on the closed list: the watchman opens a{' '}
                <strong className='text-ink font-medium'>triage card</strong> instead of starting a
                playbook.
              </li>
              <li>
                A playbook’s preconditions do not hold (for example, the order has no ferry leg):
                the run stops before any step and opens a triage card.
              </li>
              <li>
                An agent cannot learn a fact it needs, or every option breaks a guardrail: it says
                so, the card shows what is blocked, and the dispatcher decides.
              </li>
            </ul>
          </div>
          <Link
            href='/'
            className='text-ink inline-flex shrink-0 items-center gap-1 text-sm font-medium'
          >
            {openTriage} triage cards open now <Icon name='arrow' size={14} />
          </Link>
        </div>
      </Card>
    </>
  );
}

export default function PlaybooksPage() {
  return (
    <PageContainer width='wide'>
      <PageHeader
        eyebrow='How the system works'
        title='Playbooks'
        description='Every exception follows a written playbook: a fixed diagram of steps that the same engine runs every time. Open one to see each step, read what its agent is told, and see what it learned from your dispatchers.'
      />
      <Card padding='none'>
        <SystemOverview />
      </Card>
      <Section
        title='The playbooks'
        note='The closed list. A trigger that is not here never starts an agent; it goes to a person.'
      >
        <Suspense
          fallback={
            <div className='grid gap-4 lg:grid-cols-2'>
              <SkeletonCard />
              <SkeletonCard />
            </div>
          }
        >
          <PlaybookList />
        </Suspense>
      </Section>
      <Section
        title='Rules every agent follows'
        note='The same for every playbook. Amendments can add to a playbook, never loosen these.'
      >
        <Suspense fallback={<SkeletonCard />}>
          <AgentRules />
        </Suspense>
      </Section>
      <Section
        id='proven'
        title='Proven on Bahn’s own decisions'
        note='Replayed on every page load through the same rules the agents face; nothing here is precomputed.'
      >
        <Suspense fallback={<SkeletonCard />}>
          <GateReplayPanel />
        </Suspense>
      </Section>
    </PageContainer>
  );
}
