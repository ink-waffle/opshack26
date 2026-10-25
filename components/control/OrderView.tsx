import Link from 'next/link';
import { Fragment } from 'react';

import { StepList } from '@/components/control/CardView';
import { FactChip } from '@/components/control/FactChip';
import { When } from '@/components/control/When';
import { Badge, Chip } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { EVIDENCE_DISPLAY } from '@/components/ui/evidence';
import { EvidenceMark } from '@/components/ui/EvidenceChip';
import { Icon } from '@/components/ui/Icon';
import { Timeline, TimelineItem } from '@/components/ui/Timeline';
import { formatTime, formatUtc } from '@/lib/control-room/format';
import type { OrderPage, RouteLeg, RouteStop, TimelineEntry } from '@/lib/control-room/order';
import type { FactView } from '@/lib/control-room/types';

function Stop(props: { stop: RouteStop; facts: Record<string, FactView> }) {
  const { stop, facts } = props;
  const fact = stop.factId ? facts[stop.factId] : undefined;
  return (
    <div className='min-w-0 md:max-w-64'>
      <div className='text-muted flex items-center gap-1.5 text-sm'>
        <Icon name={stop.role === 'Delivery' ? 'flag' : 'pin'} size={14} />
        {stop.role}
      </div>
      <div className='font-display text-ink mt-1 text-lg leading-tight font-bold tracking-tight'>
        {stop.city ?? 'Unknown'}
      </div>
      {stop.place && <div className='text-secondary text-sm'>{stop.place}</div>}
      {stop.window ? (
        <div className='mt-2'>
          <div className='text-ink text-base tabular-nums'>{stop.window}</div>
          <div className='text-muted text-sm'>{stop.windowSource}</div>
          {fact && <FactChip fact={fact} className='mt-1.5' />}
        </div>
      ) : (
        <div className='text-muted mt-2 text-sm'>No window recorded</div>
      )}
    </div>
  );
}

function Leg(props: { leg: RouteLeg | undefined; facts: Record<string, FactView> }) {
  const { leg, facts } = props;
  return (
    <div className='flex min-w-0 flex-1 flex-col justify-start md:px-2 md:pt-6'>
      <div className='text-muted text-sm md:text-center'>
        {leg ? [leg.mode, leg.distance].filter(Boolean).join(' · ') : 'Route not planned yet'}
      </div>
      <div className='relative my-2 hidden h-px md:block'>
        <span className='border-line-strong absolute inset-x-0 top-0 border-t border-dashed' />
        <Icon name='arrow' size={14} className='text-line-strong absolute -top-[7px] right-0' />
      </div>
      {leg && leg.crossings.length > 0 && (
        <div className='flex flex-wrap gap-1.5 md:justify-center'>
          {leg.crossings.map((crossing, i) =>
            crossing.factId && facts[crossing.factId] ? (
              <FactChip key={i} fact={facts[crossing.factId]} />
            ) : (
              <Chip key={i} icon='ferry'>
                {crossing.text}
              </Chip>
            )
          )}
        </div>
      )}
    </div>
  );
}

// Pickup → legs → delivery, each window with who set it and the fact behind it.
export function RouteStrip(props: { page: OrderPage }) {
  const { page } = props;
  const { stops, legs, facts } = page;
  return (
    <Card>
      <div className='flex flex-col gap-5 md:flex-row md:items-start md:gap-4'>
        {stops.map((stop, i) => (
          <Fragment key={`${stop.role}-${i}`}>
            {i > 0 && <Leg leg={legs[i - 1]} facts={facts} />}
            <Stop stop={stop} facts={facts} />
          </Fragment>
        ))}
      </div>
    </Card>
  );
}

function Entry(props: { entry: TimelineEntry; facts: Record<string, FactView>; last: boolean }) {
  const { entry, facts, last } = props;
  const at = new Date(entry.at);
  const chips = entry.factIds.map((id) => facts[id]).filter((f): f is FactView => !!f);
  const source =
    chips.length || entry.chip || entry.href ? (
      <>
        {chips.map((fact) => (
          <FactChip key={fact.id} fact={fact} />
        ))}
        {!chips.length && entry.chip && (
          <Chip
            icon='document'
            title={
              entry.chip === 'Agent tool'
                ? 'The facts this tool call wrote are no longer stored'
                : 'A Bahn record with no fact projected from it'
            }
          >
            {entry.chip}
          </Chip>
        )}
        {entry.href && (
          <Chip icon='arrow' href={entry.href}>
            Open the card
          </Chip>
        )}
      </>
    ) : undefined;
  return (
    <TimelineItem
      speaker={entry.speaker}
      role={entry.role}
      kind={entry.kind}
      icon={entry.icon}
      at={<span title={formatUtc(at)}>{formatTime({ at })}</span>}
      source={source}
      last={last}
    >
      {entry.quote ? `“${entry.text}”` : entry.text}
    </TimelineItem>
  );
}

function Day(props: { day: string; entries: TimelineEntry[]; facts: Record<string, FactView> }) {
  const { day, entries, facts } = props;
  return (
    <li>
      <div className='text-secondary bg-surface sticky top-16 z-[2] -mx-1 mb-3 px-1 py-1 text-sm font-semibold'>
        {day}
      </div>
      <Timeline>
        {entries.map((entry, i) => (
          <Entry key={entry.id} entry={entry} facts={facts} last={i === entries.length - 1} />
        ))}
      </Timeline>
    </li>
  );
}

function groupByDay(entries: TimelineEntry[]) {
  const days: { day: string; entries: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const current = days.at(-1);
    if (current && current.day === entry.day) current.entries.push(entry);
    else days.push({ day: entry.day, entries: [entry] });
  }
  return days;
}

// Messages, events, watchman checks, agent steps, tool facts and decisions in one story, oldest first.
export function OrderTimeline(props: { page: OrderPage; recent?: number }) {
  const { page, recent = 30 } = props;
  const { timeline, facts } = page;
  const older = timeline.slice(0, Math.max(0, timeline.length - recent));
  const latest = timeline.slice(older.length);
  return (
    <Card>
      <div className='mb-4 flex flex-wrap items-baseline justify-between gap-2'>
        <h2 className='font-display text-ink text-xl font-bold tracking-tight'>What happened</h2>
        <span className='text-muted text-sm'>
          {timeline.length} items · people, the Bahn system, the watchman and agents
        </span>
      </div>
      {older.length > 0 && (
        <details className='group mb-4'>
          <summary className='text-secondary hover:text-ink flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium'>
            <Icon name='chevron' size={14} className='transition-transform group-open:rotate-90' />
            <span className='group-open:hidden'>Show {older.length} earlier items</span>
            <span className='hidden group-open:inline'>Hide earlier items</span>
          </summary>
          <ol className='mt-4 grid gap-4'>
            {groupByDay(older).map((group) => (
              <Day key={`old-${group.day}`} day={group.day} entries={group.entries} facts={facts} />
            ))}
          </ol>
        </details>
      )}
      {latest.length ? (
        <ol className='grid gap-4'>
          {groupByDay(latest).map((group) => (
            <Day key={group.day} day={group.day} entries={group.entries} facts={facts} />
          ))}
        </ol>
      ) : (
        <p className='text-muted text-base'>Nothing has happened on this order yet.</p>
      )}
    </Card>
  );
}

// Every fact on the order, strongest evidence first.
export function FactsPanel(props: { page: OrderPage }) {
  const { page } = props;
  const total = page.factsByLevel.reduce((sum, group) => sum + group.facts.length, 0);
  return (
    <section>
      <h2 className='text-secondary mb-2 text-sm font-semibold'>On record · {total}</h2>
      <div className='rounded-card bg-surface shadow-card divide-line-soft divide-y'>
        {page.factsByLevel.map((group, i) => (
          <details key={group.level} open={i < 2} className='group px-4 py-3'>
            <summary className='flex cursor-pointer list-none items-center gap-2 text-sm'>
              <EvidenceMark level={group.level} size={13} />
              <span className='text-ink font-semibold'>{EVIDENCE_DISPLAY[group.level].name}</span>
              <span className='text-subtle tabular-nums'>{group.facts.length}</span>
              <Icon
                name='chevron'
                size={14}
                className='text-muted ml-auto transition-transform group-open:rotate-90'
              />
            </summary>
            <p className='text-muted mt-1 text-xs'>{EVIDENCE_DISPLAY[group.level].meaning}</p>
            <ul className='mt-2.5 grid gap-3'>
              {group.facts.map((fact) => (
                <li key={fact.id} className='grid justify-items-start gap-1'>
                  <span className='text-body line-clamp-3 text-sm'>{fact.statement}</span>
                  <FactChip fact={fact} />
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

const RUN_TONE: Record<string, 'info' | 'ok' | 'danger' | 'warn' | 'neutral'> = {
  CLOSED: 'ok',
  FAILED: 'danger',
  ESCALATED: 'neutral',
  AWAITING_DECISION: 'warn',
};

// Agent runs on this order, block by block.
export function RunTraces(props: { page: OrderPage }) {
  const { page } = props;
  if (!page.runs.length)
    return (
      <section>
        <h2 className='text-secondary mb-2 text-sm font-semibold'>Agent runs</h2>
        <p className='text-muted text-sm'>No playbook has run on this order.</p>
      </section>
    );
  return (
    <section>
      <h2 className='text-secondary mb-2 text-sm font-semibold'>Agent runs · {page.runs.length}</h2>
      <div className='grid gap-3'>
        {page.runs.map((run) => (
          <Card key={run.id} padding='sm'>
            <div className='flex flex-wrap items-center gap-2'>
              <Icon name={run.playbook.icon} size={15} className='text-secondary' />
              <span className='text-ink text-base font-semibold'>{run.playbook.title}</span>
              <Badge
                tone={RUN_TONE[run.status] ?? 'info'}
                dot={!RUN_TONE[run.status]}
                pulse={!RUN_TONE[run.status]}
                className='ml-auto'
              >
                {run.statusWords}
              </Badge>
            </div>
            <div className='text-muted mt-0.5 text-sm'>
              Started <When at={run.startedAt} now={page.now} />
              {run.cardId && (
                <>
                  {' · '}
                  <Link
                    href={`/cards/${run.cardId}`}
                    className='text-secondary underline-offset-4 hover:underline'
                  >
                    its card
                  </Link>
                </>
              )}
            </div>
            <div className={cx('border-line-soft mt-3 border-t pt-3')}>
              <StepList steps={run.steps} facts={page.facts} now={page.now} compact />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
