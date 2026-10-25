import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { BlockPanel } from '@/components/catalog/BlockPanel';
import { KIND_META, KIND_ORDER } from '@/components/catalog/kinds';
import { Markdown } from '@/components/catalog/Markdown';
import { PlaybookExplorer } from '@/components/catalog/PlaybookExplorer';
import { Section } from '@/components/catalog/Section';
import { amendmentsForBlock, playbookDiagram } from '@/components/catalog/view';
import { PageContainer } from '@/components/ui/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Card, CardSection, Panel } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { resolveRoutingParams } from '@/lib/meta/params';
import { blockStats } from '@/lib/meta/stats';
import { currentValue, parameterWhitelist } from '@/lib/meta/whitelist';
import { resolveParams } from '@/lib/playbooks/amendments';
import { getPlaybookCatalog } from '@/lib/playbooks/catalog';
import { getPlaybook } from '@/lib/playbooks/registry';
import { TRIGGERS, type TriggerType } from '@/lib/watchman/taxonomy';

export const metadata: Metadata = { title: 'Playbook' };

const UNIT: Record<string, string> = { minutes: 'min', hours: 'h', count: '', probability: '' };

function formatValue(value: number, unit: string) {
  if (unit === 'probability') return `${Math.round(value * 100)} %`;
  return `${value}${UNIT[unit] ? ` ${UNIT[unit]}` : ''}`;
}

function Legend() {
  return (
    <ul className='text-secondary flex flex-wrap gap-x-5 gap-y-1.5 text-sm'>
      {KIND_ORDER.map((kind) => (
        <li key={kind} className='flex items-center gap-1.5'>
          <Icon name={KIND_META[kind].icon} size={14} className='text-muted' />
          {KIND_META[kind].label}
        </li>
      ))}
      <li className='text-muted ml-auto'>Click a step to read it</li>
    </ul>
  );
}

async function PlaybookDetail(props: {
  params: PageProps<'/playbooks/[id]'>['params'];
  searchParams: PageProps<'/playbooks/[id]'>['searchParams'];
}) {
  const [{ id }, query] = await Promise.all([props.params, props.searchParams]);
  const definition = getPlaybook(id);
  if (!definition) notFound();
  const [catalog, stats, routing] = await Promise.all([
    getPlaybookCatalog(id),
    blockStats({ playbookId: id }),
    resolveRoutingParams(),
  ]);
  if (!catalog) notFound();
  const approved = [
    ...catalog.amendments,
    ...catalog.blocks.flatMap((block) => block.amendments),
  ].sort((a, b) => (a.decidedAt?.getTime() ?? 0) - (b.decidedAt?.getTime() ?? 0));
  const params = resolveParams({ definition, amendments: approved });
  const diagram = playbookDiagram({ definition, amendments: approved });
  const panels = Object.fromEntries(
    definition.blocks.map((block) => [
      block.id,
      <BlockPanel
        key={block.id}
        definition={definition}
        block={block}
        instructions={catalog.blocks.find((b) => b.id === block.id)?.instructions ?? null}
        amendments={amendmentsForBlock({ amendments: approved, block })}
        stats={stats[block.id] ?? null}
        params={params}
      />,
    ])
  );
  const triggers = Object.entries(routing.triggers)
    .filter(([, route]) => route.playbookId === id)
    .map(([type, route]) => ({ type: type as TriggerType, threshold: route.threshold }));
  const whitelist = parameterWhitelist(definition);
  const selected = typeof query.block === 'string' ? query.block : null;
  const agentCount = definition.blocks.filter((block) => block.kind === 'agent').length;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href='/playbooks' className='hover:text-ink inline-flex items-center gap-1'>
            <Icon name='chevron' size={12} className='rotate-180' /> All playbooks
          </Link>
        }
        title={definition.title}
        description={definition.summary}
        meta={
          <>
            <span>{definition.blocks.length} steps</span>
            <span>{agentCount} with an AI agent</span>
            <span>
              {approved.length
                ? `${approved.length} approved ${approved.length === 1 ? 'change' : 'changes'}`
                : 'No approved changes yet'}
            </span>
          </>
        }
      />
      <PlaybookExplorer
        nodes={diagram.nodes}
        edges={diagram.edges}
        height={diagram.height}
        panels={panels}
        initialId={selected}
        legend={<Legend />}
        intro={
          <Card>
            <h3 className='font-display text-ink text-lg font-bold tracking-tight'>
              How to read this diagram
            </h3>
            <p className='text-body mt-2 text-base leading-relaxed'>
              The engine starts at the top and follows the arrows. Where a step has several arrows,
              the words on each arrow say when it is taken. The same diagram runs every time;
              nothing happens that is not drawn here.
            </p>
            <ul className='mt-4 grid gap-3'>
              {KIND_ORDER.map((kind) => (
                <li key={kind} className='flex items-start gap-3'>
                  <Icon
                    name={KIND_META[kind].icon}
                    size={16}
                    className='text-secondary mt-0.5 shrink-0'
                  />
                  <div>
                    <div className='text-ink text-base font-medium'>{KIND_META[kind].label}</div>
                    <p className='text-muted text-sm leading-relaxed'>{KIND_META[kind].plain}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Panel className='mt-4'>
              <p className='text-secondary text-sm'>
                Click any step to read its instructions, what it hands on, the changes the chief
                dispatcher approved for it, and how it has run so far.
              </p>
            </Panel>
          </Card>
        }
      />

      <div className='mt-12 grid items-start gap-4 lg:grid-cols-2'>
        <Card>
          <h3 className='font-display text-ink text-lg font-bold tracking-tight'>When it starts</h3>
          <CardSection title='The watchman routes these here' divided={false} className='mt-3'>
            <ul className='grid gap-2'>
              {triggers.map(({ type, threshold }) => (
                <li key={type} className='text-body flex items-start gap-2 text-base'>
                  <Icon name='search' size={14} className='text-muted mt-1 shrink-0' />
                  <span>
                    {TRIGGERS[type].label}
                    <span className='text-muted'>
                      {' '}
                      · when Jev is at least {Math.round(threshold * 100)} % sure, or a clock
                      monitor fires
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardSection>
          <CardSection title='Before any step runs, these must hold'>
            <ul className='grid gap-2'>
              {definition.preconditions.map((precondition) => (
                <li key={precondition.id} className='text-body flex items-start gap-2 text-base'>
                  <Icon name='check' size={14} className='text-muted mt-1 shrink-0' />
                  {precondition.description}
                </li>
              ))}
            </ul>
            <p className='text-muted mt-2 text-sm'>
              If one does not, the run stops and a person gets a triage card.
            </p>
          </CardSection>
        </Card>
        <Card>
          <h3 className='font-display text-ink text-lg font-bold tracking-tight'>
            Settings the chief dispatcher can change
          </h3>
          <p className='text-muted mt-1 text-sm'>
            The only numbers an amendment may change. Everything else needs a developer.
          </p>
          <ul className='divide-line-soft mt-3 divide-y'>
            {whitelist.map((spec) => {
              const value = currentValue({
                spec,
                params: { ...params, ...routingValues(routing, spec.key) },
              });
              const changed = value !== spec.default;
              return (
                <li key={spec.key} className='flex items-baseline justify-between gap-4 py-2'>
                  <span className='text-body text-base'>{spec.label}</span>
                  <span className='shrink-0 text-right'>
                    <span className='text-ink font-medium tabular-nums'>
                      {formatValue(value, spec.unit)}
                    </span>
                    {changed && (
                      <Badge tone='ok' className='ml-2'>
                        was {formatValue(spec.default, spec.unit)}
                      </Badge>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Section
        title='Playbook rules'
        note='Every agent in this playbook receives these, after the rules every agent follows.'
      >
        <Card>
          <Markdown>{catalog.rules.replace(/^# .*\n+/, '')}</Markdown>
        </Card>
      </Section>

      <Section
        title='Changes learned from dispatchers'
        note='Approved by the chief dispatcher; every future run of this playbook uses them.'
      >
        {approved.length ? (
          <ul className='grid gap-2.5'>
            {approved.map((amendment) => (
              <li key={amendment.id}>
                <Card padding='sm'>
                  <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
                    <span className='text-muted text-sm'>
                      {amendment.blockId
                        ? (definition.blocks.find((b) => b.id === amendment.blockId)?.title ??
                          amendment.blockId)
                        : 'Whole playbook'}
                    </span>
                    <Link
                      href={`/meta#${amendment.id}`}
                      className='text-ink text-sm font-medium underline underline-offset-2'
                    >
                      Where it came from
                    </Link>
                  </div>
                  <p className='text-ink mt-1 text-base leading-relaxed'>{amendment.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card padding='sm'>
            <p className='text-muted text-base'>
              None yet. When a dispatcher edits or rejects a card from this playbook, the proposed
              change appears on the{' '}
              <Link href='/meta' className='text-ink underline underline-offset-2'>
                meta page
              </Link>{' '}
              for the chief dispatcher.
            </p>
          </Card>
        )}
      </Section>
    </>
  );
}

function routingValues(
  routing: Awaited<ReturnType<typeof resolveRoutingParams>>,
  key: string
): Record<string, number> {
  const match = /^routing\.([A-Z_]+)\.threshold$/.exec(key);
  const route = match ? routing.triggers[match[1] as TriggerType] : null;
  return route ? { [key]: route.threshold } : {};
}

export default function PlaybookPage(props: PageProps<'/playbooks/[id]'>) {
  return (
    <PageContainer width='wide'>
      <Suspense
        fallback={
          <div className='pt-8'>
            <Skeleton className='h-8 w-72' />
            <div className='mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]'>
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        }
      >
        <PlaybookDetail params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </PageContainer>
  );
}
