import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PageContainer } from '@/components/ui/AppShell';
import { Badge, Chip } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardFooter, CardHeader, CardSection, Panel } from '@/components/ui/Card';
import { ClockIndicator } from '@/components/ui/ClockIndicator';
import { Countdown } from '@/components/ui/Countdown';
import { cx } from '@/components/ui/cx';
import { EmptyState } from '@/components/ui/EmptyState';
import { EvidenceChip, EvidenceLegend } from '@/components/ui/EvidenceChip';
import { Icon, ICON_NAMES, type IconName } from '@/components/ui/Icon';
import { KeyValue, KeyValueList } from '@/components/ui/KeyValue';
import { LiveClockIndicator } from '@/components/ui/LiveClockIndicator';
import { LiveCountdown } from '@/components/ui/LiveCountdown';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Slack } from '@/components/ui/Slack';
import { Timeline, TimelineItem } from '@/components/ui/Timeline';

export const metadata: Metadata = { title: 'Design' };

const MIN = 60_000;
const HOUR = 60 * MIN;
// Dataset snapshot time, used as a fixed sim "now" so this page needs no database.
const SIM_NOW = Date.parse('2026-10-21T09:00:00Z');

export default function DesignPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow='Design system · components/ui'
        title='How the control room looks'
        description="Bahn's birch paper and asphalt ink. One wide display face says what is wrong; plain sentences say everything else. Colour is spent only on what needs a person."
        actions={<LiveClockIndicator nowMs={SIM_NOW} speed={60} />}
      />

      <Section
        title='Decision card'
        note='What a person sees: what happened, what the agent already did, options with their effect on the promise, and one clear action.'
      >
        <DecisionCardExample />
      </Section>

      <Section
        title='The queue'
        note='Only orders that need a person, sorted by when the decision is due. The reason sits next to the clock.'
      >
        <div className='grid gap-2.5'>
          <QueueRow
            id='CD-420322'
            icon='warning'
            route='Hamburg → Odense · Bentley Continental GT'
            title='Car stopped with a red warning light'
            remainingMs={8 * MIN + 5_000}
            reason='owner must choose roadside or tow'
            status={
              <Badge tone='danger' dot>
                Driver waiting
              </Badge>
            }
          />
          <QueueRow
            id='CD-420299'
            icon='ferry'
            route='Leipzig → Helsinki · BMW M4'
            title='Ferry sold out, rebooking timed out'
            remainingMs={42 * MIN}
            reason='reconcile the timed-out booking before buying'
            status={<Badge tone='warn'>Awaiting decision</Badge>}
          />
          <QueueRow
            id='CD-420449'
            icon='driver'
            route='Hamburg → Odense · Toyota Corolla'
            title='Driver unwell, positioning trip already paid'
            remainingMs={1 * HOUR + 25 * MIN}
            reason='until 10:25, departure of the paid train'
            status={
              <Badge tone='info' dot pulse>
                Agent asking driver
              </Badge>
            }
          />
          <QueueRow
            id='CD-420154'
            icon='ferry'
            route='Marseille → Lahti · Audi Q8 e-tron'
            title='Missed check-in, next sailing has space'
            remainingMs={null}
            reason='promise holds either way; decide when convenient'
            status={<Badge>Options ready</Badge>}
          />
        </div>
      </Section>

      <Section
        title='Evidence'
        note='Every fact shows how sure we are. Weak evidence is hollow and dashed; the disc fills as it gets stronger. Hover a chip for its source and time.'
      >
        <Card>
          <EvidenceLegend />
          <div className='border-line-soft mt-6 flex flex-wrap gap-2 border-t pt-5'>
            <EvidenceChip
              level='REQUESTED'
              label='Asked Finnlines'
              source='tool:ask_provider:call-81f2'
              at='21 Oct 09:01 · no reply yet'
            />
            <EvidenceChip
              level='STATED'
              label='Driver said'
              source='bahn.messages:msg-55c0e2'
              at='21 Oct 07:20 · 1 h 40 min ago'
            />
            <EvidenceChip
              level='QUOTED'
              label='Quote · 2 h old'
              source='bahn.travel_quotes:travel-xf29ed1732d895f37'
              at='21 Oct 07:00'
              caution='Older than 90 min. Re-check before booking or showing as capacity.'
            />
            <EvidenceChip level='PLANNED' label='In the plan' source='bahn.order_legs:leg-2' />
            <EvidenceChip
              level='BOOKED'
              label='Booked'
              source='bahn.travel_reservations:res-x0320cdf029cd4c96'
              at='20 Oct 16:12'
              href='#evidence'
            />
            <EvidenceChip
              level='OBSERVED'
              label='Gate scan'
              source='bahn.tracking_events:evt-6a1d'
              at='21 Oct 06:48'
            />
            <EvidenceChip
              level='VERIFIED'
              label='Signed CMR'
              source='operator:card-77 · photo checked'
              at='21 Oct 08:30'
            />
          </div>
        </Card>
      </Section>

      <Section
        title='Countdowns'
        note='Decide-by, with the reason. Calm above an hour, orange under an hour, red under 15 minutes. No deadline is said plainly, not hidden.'
      >
        <div className='grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          <Countdown
            remainingMs={26 * HOUR}
            until='Thu 11:00'
            reason='pickup slot opens in Leipzig'
          />
          <Countdown
            remainingMs={42 * MIN}
            until='09:42'
            reason='before buying, reconcile the timed-out booking'
          />
          <LiveCountdown
            nowMs={SIM_NOW}
            endsAt={SIM_NOW + 9 * MIN + 30_000}
            until='09:09'
            reason='driver can wait at the service area until then'
          />
          <Countdown
            remainingMs={-12 * MIN}
            until='08:48'
            reason='check-in cutoff at Travemünde passed'
          />
          <Countdown remainingMs={null} />
          <div className='rounded-panel border-line grid content-start gap-2.5 border px-4 py-3'>
            <div className='text-muted text-sm font-medium'>Inline, for lists</div>
            <Countdown layout='inline' remainingMs={8 * MIN + 5_000} reason='owner decides' />
            <Countdown layout='inline' remainingMs={42 * MIN} reason='reconcile first' />
            <Countdown layout='inline' remainingMs={3 * HOUR + 10 * MIN} reason='pickup' />
            <Countdown layout='inline' remainingMs={null} />
          </div>
        </div>
      </Section>

      <Section
        title='Actions and status'
        note='One asphalt button per card: the thing to do. Status words sit on soft tone fills.'
      >
        <Card>
          <div className='flex flex-wrap items-center gap-2'>
            <Button variant='primary' icon='check'>
              Approve A
            </Button>
            <Button variant='secondary' icon='edit'>
              Edit
            </Button>
            <Button variant='danger' icon='cross'>
              Reject
            </Button>
            <Button variant='quiet' icon='agent'>
              Ask agent to…
            </Button>
            <span className='bg-line mx-2 h-6 w-px' />
            <Button variant='primary' size='sm'>
              Approve
            </Button>
            <Button size='sm'>Edit</Button>
            <Button variant='quiet' size='sm'>
              Show all facts
            </Button>
            <Button variant='primary' size='sm' disabled>
              Booking…
            </Button>
          </div>
          <div className='border-line-soft mt-5 flex flex-wrap items-center gap-2 border-t pt-5'>
            <Badge tone='danger' dot>
              Promise at risk
            </Badge>
            <Badge tone='warn'>Awaiting decision</Badge>
            <Badge tone='info' dot pulse>
              Agent working
            </Badge>
            <Badge tone='ok' icon='check'>
              Closed
            </Badge>
            <Badge>Escalated to chief</Badge>
            <span className='bg-line mx-2 h-6 w-px' />
            <Chip icon='car' mono>
              WBA31AW050F8Z9X12
            </Chip>
            <Chip icon='building' href='#'>
              Kavellora Car House
            </Chip>
            <Chip icon='arrow'>Import · 1 780 km</Chip>
          </div>
          <div className='border-line-soft mt-5 flex flex-wrap items-center gap-2 border-t pt-5'>
            <Slack slackMs={42 * HOUR} />
            <Slack slackMs={2 * HOUR + 30 * MIN} />
            <Slack slackMs={-3 * HOUR} />
            <Slack slackMs={null} />
          </div>
        </Card>
      </Section>

      <Section
        title='Facts and conversation'
        note='Facts as label, value and evidence. Conversations as a timeline with the record behind each line.'
      >
        <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
          <Card>
            <h3 className='text-secondary mb-2 text-sm font-semibold'>Facts</h3>
            <KeyValueList divided>
              <KeyValue
                label='Pickup'
                hint='Leipzig, Kavellora yard'
                aside={<EvidenceChip level='PLANNED' label='Ops plan' />}
              >
                Thu 23 Oct, 09:00–11:00
              </KeyValue>
              <KeyValue
                label='Promise'
                hint='Helsinki, private address'
                aside={<EvidenceChip level='BOOKED' label='Customer order' />}
              >
                Mon 27 Oct, 11:00–13:00
              </KeyValue>
              <KeyValue
                label='Receiver'
                tone='warn'
                aside={<EvidenceChip level='REQUESTED' label='Asked customer' />}
              >
                Not confirmed
              </KeyValue>
              <KeyValue
                label='Ferry quote'
                hint='Travemünde → Helsinki, 24 Oct 12:00'
                aside={
                  <EvidenceChip
                    level='QUOTED'
                    label='2 h old'
                    caution='Older than 90 min. Re-check before booking.'
                  />
                }
              >
                EUR 387
              </KeyValue>
              <KeyValue label='Quote ref' mono>
                travel-xf29ed1732d895f37
              </KeyValue>
            </KeyValueList>
          </Card>
          <Card>
            <h3 className='text-secondary mb-4 text-sm font-semibold'>Conversation</h3>
            <Timeline>
              <TimelineItem
                kind='provider'
                speaker='Finnlines'
                role='Ferry'
                at='07:00'
                source={<EvidenceChip level='QUOTED' label='Sold out 23 Oct' />}
              >
                Overnight sailing on 23 Oct is sold out. 24 Oct 12:00 has space.
              </TimelineItem>
              <TimelineItem
                kind='system'
                speaker='Booking request'
                at='07:10'
                source={<EvidenceChip level='REQUESTED' label='Timed out, no reference' />}
              >
                Approved booking of the 24 Oct 12:00 sailing timed out. Outcome unknown.
              </TimelineItem>
              <TimelineItem
                kind='driver'
                speaker='Camille Emberwick'
                role='Driver'
                at='07:20'
                source={<EvidenceChip level='STATED' label='Driver said' />}
              >
                Can you send me the ferry reference? I can work if the overnight stop is arranged.
              </TimelineItem>
              <TimelineItem kind='agent' speaker='Agent' role='Ferry rebooking' at='09:01' last>
                Asked Finnlines whether the 07:10 request created a booking. Nothing bought.
              </TimelineItem>
            </Timeline>
          </Card>
        </div>
      </Section>

      <Section
        title='Empty and loading'
        note='Empty says what is true and what was checked. Loading keeps the shape of what is coming.'
      >
        <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
          <EmptyState
            title='Nothing needs a person right now'
            action={
              <Button size='sm' icon='search'>
                Show all 100 orders
              </Button>
            }
          >
            97 orders are on track. The watchman checked every order at 09:41 and will check again
            on the next message or in 5 minutes.
          </EmptyState>
          <div className='grid grid-cols-1 content-start gap-4'>
            <SkeletonCard />
            <Card padding='sm'>
              <EmptyState size='inline' icon='inbox' title='No messages on this order yet'>
                Driver and site replies appear here as they arrive.
              </EmptyState>
            </Card>
          </div>
        </div>
      </Section>

      <Section
        title='Foundations'
        note="Palette from bahnexpress.fi. Faces: Archivo Expanded stands in for Owners Wide, Poppins for Duplet Open, Reddit Mono is Bahn's own."
      >
        <div className='grid gap-4 lg:grid-cols-[3fr_2fr]'>
          <Card>
            <h3 className='text-secondary mb-3 text-sm font-semibold'>Neutrals</h3>
            <div className='grid grid-cols-4 gap-2 sm:grid-cols-7'>
              <Swatch name='canvas' value='#f1eee6' className='bg-canvas' />
              <Swatch name='birch' value='#fffef7' className='bg-surface' />
              <Swatch name='line' value='#e2ded4' className='bg-line' />
              <Swatch name='sand' value='#ccc6ba' className='bg-line-strong' />
              <Swatch name='muted' value='#726958' className='bg-muted' />
              <Swatch name='brown' value='#423d33' className='bg-secondary' />
              <Swatch name='asphalt' value='#12110e' className='bg-asphalt' />
            </div>
            <h3 className='text-secondary mt-5 mb-3 text-sm font-semibold'>Tones</h3>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-5'>
              <ToneSwatch tone='danger' label='Danger' use='Promise or safety at stake' />
              <ToneSwatch tone='warn' label='Warn' use='Decide soon' />
              <ToneSwatch tone='info' label='Info' use='Agent or live work' />
              <ToneSwatch tone='ok' label='OK' use='Confirmed, holds' />
              <ToneSwatch tone='neutral' label='Neutral' use='Everything else' />
            </div>
          </Card>
          <Card>
            <h3 className='text-secondary mb-3 text-sm font-semibold'>Type</h3>
            <div className='grid gap-3'>
              <div className='font-display text-ink text-3xl font-extrabold tracking-tight'>
                Page title 30
              </div>
              <div className='font-display text-ink text-xl font-bold tracking-tight'>
                Card title: what is wrong 20
              </div>
              <div className='text-md text-ink'>Lead sentence, 15 regular</div>
              <div className='text-body text-base'>Body text and facts, 14 regular</div>
              <div className='text-muted text-sm'>Labels and meta, 13 regular</div>
              <div className='text-secondary font-mono text-sm'>
                CD-420299 · res-x0320cdf0 · 13 mono
              </div>
            </div>
          </Card>
        </div>
      </Section>

      <Section
        title='Icons'
        note='16 px strokes on one grid. They mark a kind of thing; words carry the meaning.'
      >
        <Card>
          <div className='grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6 lg:grid-cols-9'>
            {ICON_NAMES.map((name) => (
              <div key={name} className='text-secondary flex items-center gap-2 text-sm'>
                <Icon name={name} />
                <span className='truncate'>{name}</span>
              </div>
            ))}
          </div>
          <div className='border-line-soft mt-5 flex flex-wrap items-center gap-3 border-t pt-5'>
            <ClockIndicator simNowMs={SIM_NOW} speed={60} />
            <ClockIndicator simNowMs={SIM_NOW} paused />
            <ClockIndicator simNowMs={null} />
          </div>
        </Card>
      </Section>
    </PageContainer>
  );
}

function Section(props: { title: string; note?: string; children: ReactNode }) {
  const { title, note, children } = props;
  const id = title.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <section id={id} className='mt-12 first-of-type:mt-4'>
      <div className='mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1'>
        <h2 className='font-display text-ink text-xl font-bold tracking-tight'>{title}</h2>
        {note && <p className='text-muted max-w-[64ch] text-sm sm:text-right'>{note}</p>}
      </div>
      {children}
    </section>
  );
}

function DecisionCardExample() {
  return (
    <Card as='article'>
      <CardHeader
        eyebrow={
          <>
            <Icon name='ferry' size={15} className='text-secondary' />
            <span className='text-secondary font-mono'>CD-420299</span>
            <span aria-hidden='true'>·</span>
            <span>Leipzig → Helsinki</span>
            <span aria-hidden='true'>·</span>
            <span>BMW M4 for Kavellora Car House</span>
          </>
        }
        title='Ferry sold out, rebooking timed out'
        meta={
          <span className='flex flex-wrap items-center gap-2'>
            <Badge tone='warn'>Awaiting decision</Badge>
            <Badge tone='info' icon='agent'>
              Agent did 3 checks
            </Badge>
            <Slack slackMs={42 * HOUR} />
          </span>
        }
        aside={
          <Countdown
            remainingMs={42 * MIN}
            until='09:42'
            reason='before buying, reconcile the timed-out booking'
          />
        }
      />

      <CardSection title='What happened'>
        <ul className='grid gap-2'>
          <Happened
            text='The overnight sailing on 23 Oct is sold out.'
            chip={<EvidenceChip level='QUOTED' label='Finnlines · 07:00' />}
          />
          <Happened
            text='Our approved booking of the 24 Oct 12:00 sailing timed out at 07:10 with no reference.'
            chip={<EvidenceChip level='REQUESTED' label='No reply' />}
          />
          <Happened
            text='The driver asked for a ferry reference at 07:20.'
            chip={<EvidenceChip level='STATED' label='Driver said' />}
          />
        </ul>
      </CardSection>

      <CardSection title='What the agent already did' aside='3 checks · 09:01'>
        <ul className='text-body grid gap-1.5 text-base'>
          <Done
            text='Asked Finnlines whether the 07:10 request created a booking. Waiting for the answer.'
            pending
          />
          <Done text='Found space on 24 Oct 12:00, Travemünde → Helsinki, EUR 387.' />
          <Done text='Checked the driver: no next duty, can stay overnight near the terminal.' />
        </ul>
      </CardSection>

      <CardSection title='Options'>
        <div className='grid gap-2.5'>
          <OptionRow
            letter='A'
            recommended
            title='Re-quote, then book the 24 Oct 12:00 sailing and a hotel near the Hamburg terminal'
            detail='Arrives 25 Oct 16:00, two days early. Driver keeps the car and keys overnight.'
            slack={<Slack slackMs={42 * HOUR} />}
            cost='≈ EUR 387 + 1–3 hotel nights'
            who='You approve the purchase'
            evidence={
              <>
                <EvidenceChip
                  level='QUOTED'
                  label='Quote · 2 h old'
                  caution='Older than 90 min. The agent re-checks before booking.'
                />
                <EvidenceChip level='STATED' label='Driver can stay' />
              </>
            }
          />
          <OptionRow
            letter='B'
            title='Wait for the next sold-out recheck'
            detail='Keeps the timed-out request open. Not recommended: the driver has no reference.'
            slack={<Slack slackMs={null} />}
            cost='No cost now'
            who='No approval needed'
          />
        </div>
      </CardSection>

      <Panel className='mt-4' title='The agent will not'>
        <ul className='text-secondary grid gap-1 text-sm'>
          <li className='flex gap-2'>
            <Icon name='lock' size={14} className='text-muted mt-0.5' /> Buy anything before
            Finnlines confirms the 07:10 request made no booking.
          </li>
          <li className='flex gap-2'>
            <Icon name='lock' size={14} className='text-muted mt-0.5' /> Show the quote to anyone as
            booked, or tell the customer a new date.
          </li>
        </ul>
      </Panel>

      <CardFooter>
        <Button variant='primary' icon='check'>
          Approve A
        </Button>
        <Button icon='edit'>Edit</Button>
        <Button variant='danger' icon='cross'>
          Reject
        </Button>
        <Button variant='quiet' icon='agent' className='ml-auto'>
          Ask agent to…
        </Button>
      </CardFooter>
    </Card>
  );
}

function Happened(props: { text: string; chip: ReactNode }) {
  const { text, chip } = props;
  return (
    <li className='flex flex-wrap items-center gap-x-3 gap-y-1'>
      <span className='text-md text-ink min-w-0'>{text}</span>
      {chip}
    </li>
  );
}

function Done(props: { text: string; pending?: boolean }) {
  const { text, pending } = props;
  return (
    <li className='flex gap-2.5'>
      <Icon
        name={pending ? 'clock' : 'check'}
        size={15}
        className={cx('mt-[3px]', pending ? 'text-info-ink' : 'text-ok-ink')}
      />
      <span>{text}</span>
    </li>
  );
}

type OptionRowProps = {
  letter: string;
  title: string;
  detail: string;
  slack: ReactNode;
  cost: string;
  who: string;
  recommended?: boolean;
  evidence?: ReactNode;
};

function OptionRow(props: OptionRowProps) {
  const { letter, title, detail, slack, cost, who, recommended, evidence } = props;
  return (
    <div
      className={cx(
        'rounded-panel grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 px-4 py-3.5',
        recommended
          ? 'bg-surface shadow-[inset_0_0_0_1.5px_var(--color-asphalt)]'
          : 'bg-tray shadow-[inset_0_0_0_1px_var(--color-line-soft)]'
      )}
    >
      <span
        className={cx(
          'font-display flex size-7 items-center justify-center rounded-full text-sm font-bold',
          recommended ? 'bg-asphalt text-birch' : 'bg-grey-100 text-secondary'
        )}
      >
        {letter}
      </span>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-baseline gap-x-2'>
          <span className='text-md text-ink font-semibold'>{title}</span>
          {recommended && <span className='text-ok-ink text-sm font-medium'>Recommended</span>}
        </div>
        <p className='text-secondary mt-0.5 text-base'>{detail}</p>
        <div className='text-muted mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm'>
          {slack}
          <span className='flex items-center gap-1.5'>
            <Icon name='euro' size={14} />
            {cost}
          </span>
          <span className='flex items-center gap-1.5'>
            <Icon name='operator' size={14} />
            {who}
          </span>
        </div>
        {evidence && <div className='mt-2.5 flex flex-wrap gap-1.5'>{evidence}</div>}
      </div>
    </div>
  );
}

type QueueRowProps = {
  id: string;
  icon: IconName;
  route: string;
  title: string;
  remainingMs: number | null;
  reason: string;
  status: ReactNode;
};

function QueueRow(props: QueueRowProps) {
  const { id, icon, route, title, remainingMs, reason, status } = props;
  return (
    <Card as='div' padding='none' interactive>
      <a
        href='#decision-card'
        className='grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 px-4 py-3.5 sm:grid-cols-[2.25rem_minmax(0,1fr)_16rem]'
      >
        <span className='bg-grey-50 text-secondary flex size-9 items-center justify-center rounded-xl'>
          <Icon name={icon} size={18} />
        </span>
        <span className='min-w-0'>
          <span className='text-muted flex flex-wrap items-baseline gap-x-2 text-sm'>
            <span className='text-secondary font-mono'>{id}</span>
            <span>{route}</span>
          </span>
          <span className='mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1'>
            <span className='font-display text-md text-ink font-bold tracking-tight'>{title}</span>
            {status}
          </span>
        </span>
        <span className='col-start-2 sm:col-start-3'>
          <Countdown layout='compact' remainingMs={remainingMs} reason={reason} />
        </span>
      </a>
    </Card>
  );
}

function Swatch(props: { name: string; value: string; className: string }) {
  const { name, value, className } = props;
  return (
    <div>
      <div
        className={cx('h-12 rounded-lg shadow-[inset_0_0_0_1px_rgb(18_17_14/0.08)]', className)}
      />
      <div className='text-ink mt-1.5 text-xs font-medium'>{name}</div>
      <div className='text-2xs text-muted font-mono'>{value}</div>
    </div>
  );
}

const TONE_SWATCH = {
  danger: ['bg-danger', 'bg-danger-soft text-danger-ink'],
  warn: ['bg-warn', 'bg-warn-soft text-warn-ink'],
  info: ['bg-info', 'bg-info-soft text-info-ink'],
  ok: ['bg-ok', 'bg-ok-soft text-ok-ink'],
  neutral: ['bg-grey-400', 'bg-neutral-soft text-neutral-ink'],
} as const;

function ToneSwatch(props: { tone: keyof typeof TONE_SWATCH; label: string; use: string }) {
  const { tone, label, use } = props;
  const [base, soft] = TONE_SWATCH[tone];
  return (
    <div className={cx('rounded-lg px-3 py-2.5', soft)}>
      <div className='flex items-center gap-1.5 text-sm font-semibold'>
        <span className={cx('size-2 rounded-full', base)} />
        {label}
      </div>
      <div className='mt-0.5 text-xs opacity-85'>{use}</div>
    </div>
  );
}
