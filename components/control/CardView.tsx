import Link from 'next/link';
import type { ReactNode } from 'react';

import { ApproveOptionButton, DecisionActions } from '@/components/control/DecisionActions';
import { FactChip, FactChips } from '@/components/control/FactChip';
import { MoreLines } from '@/components/control/MoreLines';
import { TriageActions } from '@/components/control/TriageActions';
import { When } from '@/components/control/When';
import { Badge } from '@/components/ui/Badge';
import { Card, CardFooter, CardHeader, CardSection, Panel } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LiveCountdown } from '@/components/ui/LiveCountdown';
import { Slack } from '@/components/ui/Slack';
import { formatDuration } from '@/components/ui/time';
import type { CardPage, StepView } from '@/lib/control-room/card';
import { formatWhen, humanize } from '@/lib/control-room/format';
import { isApprovable, type ItineraryView, type OptionView } from '@/lib/control-room/options';
import type { FactView } from '@/lib/control-room/types';
import { actorWords } from '@/lib/text';

const STATUS_BADGE: Record<
  string,
  { tone: 'warn' | 'ok' | 'danger' | 'neutral' | 'info'; text: string }
> = {
  OPEN: { tone: 'warn', text: 'Awaiting decision' },
  APPROVED: { tone: 'ok', text: 'Approved' },
  EDITED: { tone: 'ok', text: 'Approved with changes' },
  REJECTED: { tone: 'danger', text: 'Rejected' },
  EXPIRED: { tone: 'danger', text: 'Expired, nobody decided' },
  CANCELLED: { tone: 'neutral', text: 'Closed' },
};

const TRIAGE_BADGE: Record<string, { tone: 'warn' | 'ok' | 'neutral'; text: string }> = {
  OPEN: { tone: 'neutral', text: 'Worth a look' },
  APPROVED: { tone: 'ok', text: 'Handled' },
  CANCELLED: { tone: 'neutral', text: 'Dismissed or folded into a decision' },
};

function Eyebrow(props: { page: CardPage }) {
  const { page } = props;
  const { order, playbook } = page;
  return (
    <>
      <Icon name={playbook.icon} size={15} className='text-secondary' />
      {order ? (
        <Link
          href={`/orders/${order.ref}`}
          className='text-secondary hover:text-ink font-mono underline-offset-4 hover:underline'
        >
          {order.ref}
        </Link>
      ) : (
        <span>No order</span>
      )}
      {order?.route && (
        <>
          <span aria-hidden='true'>·</span>
          <span>{order.route}</span>
        </>
      )}
      {order?.car && (
        <>
          <span aria-hidden='true'>·</span>
          <span>
            {order.car}
            {order.customer ? ` for ${order.customer}` : ''}
          </span>
        </>
      )}
    </>
  );
}

function StepIcon(props: { step: StepView }) {
  const { step } = props;
  const failed = step.status === 'FAILED';
  const icon: IconName = failed
    ? 'warning'
    : step.kind === 'agent'
      ? 'agent'
      : step.kind === 'execute'
        ? 'flow'
        : 'shield';
  return (
    <span
      className={cx(
        'mt-0.5 flex size-6 items-center justify-center rounded-full',
        failed
          ? 'bg-danger-soft text-danger-ink'
          : step.kind === 'agent'
            ? 'bg-info-soft text-info-ink'
            : 'bg-grey-50 text-muted shadow-[0_0_0_1px_var(--color-line)]'
      )}
    >
      <Icon name={icon} size={13} />
    </span>
  );
}

function modelName(model: string | null): string | null {
  if (!model) return null;
  const match = model.match(/(haiku|sonnet|opus)/i);
  return match ? humanize(match[1]) : model;
}

export function StepList(props: {
  steps: StepView[];
  facts: Record<string, FactView>;
  now: Date;
  compact?: boolean;
}) {
  const { steps, facts, now, compact } = props;
  return (
    <ol className='grid gap-3.5'>
      {steps.map((step) => (
        <li key={step.id} className='grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3'>
          <StepIcon step={step} />
          <div className='min-w-0'>
            <div className='flex flex-wrap items-baseline gap-x-2'>
              <span className='text-ink text-base font-medium'>{step.title}</span>
              <span className='text-muted ml-auto text-sm whitespace-nowrap tabular-nums'>
                {step.at && <When at={step.at} now={now} />}
                {[
                  step.kind === 'agent' ? modelName(step.model) : null,
                  step.durationMs && step.durationMs > 1000
                    ? formatDuration(step.durationMs)
                    : null,
                ]
                  .filter(Boolean)
                  .map((part) => ` · ${part}`)
                  .join('')}
              </span>
            </div>
            {step.summary && (
              <p
                className={cx(
                  'text-secondary mt-0.5',
                  compact ? 'line-clamp-3 text-sm' : 'text-base'
                )}
              >
                {step.summary}
              </p>
            )}
            {step.kind === 'agent' && step.callsKnown && step.calls.length === 0 && (
              <p className='text-muted mt-1 flex items-center gap-1.5 text-sm'>
                <Icon name='info' size={13} />
                No new lookups in this step; it worked from what was already on record.
              </p>
            )}
            {step.calls.length > 0 && (
              <ul className='mt-2 grid gap-2'>
                {step.calls.map((call, i) => (
                  <li key={i} className='flex gap-2.5'>
                    <Icon
                      name={call.isError ? 'warning' : 'check'}
                      size={15}
                      className={cx(
                        'mt-[3px] shrink-0',
                        call.isError ? 'text-warn-ink' : 'text-ok-ink'
                      )}
                    />
                    <div className='min-w-0'>
                      <MoreLines
                        lines={[call.summary]}
                        max={1}
                        itemClassName='text-body text-base'
                      />
                      <FactChips
                        facts={call.factIds.map((id) => facts[id])}
                        max={2}
                        className='mt-1.5'
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

const PLAN_ICON: Record<OptionView['actions'][number]['plan']['mode'], IconName> = {
  now: 'check',
  waits: 'clock',
  manual: 'operator',
  done: 'agent',
};

/** "After yes: 2 steps run now, 3 wait for a condition, 1 is for a person" (matches what execute does). */
function afterYesSummary(option: OptionView): string {
  const count = (mode: string) => option.actions.filter((a) => a.plan.mode === mode).length;
  const steps = (n: number) => (n === 1 ? '1 step' : `${n} steps`);
  const parts = [
    count('now') ? `${steps(count('now'))} ${count('now') === 1 ? 'runs' : 'run'} now` : null,
    count('waits')
      ? `${count('waits')} ${count('waits') === 1 ? 'waits' : 'wait'} for something else first`
      : null,
    count('manual') ? `${count('manual')} for a person in Bahn’s system` : null,
  ].filter(Boolean);
  return parts.length
    ? `After yes: ${parts.join(', ')}`
    : `After yes: ${steps(option.actions.length)}`;
}

const LEG_ICON: Record<string, IconName> = {
  FERRY: 'ferry',
  TRAIN: 'train',
  FLIGHT: 'plane',
  BUS: 'truck',
  HOTEL: 'hotel',
};

const LEG_STATUS: Record<string, string> = { keep: 'Keep', new: 'New', cancel: 'Cancel' };

/** The whole remaining trip under an option: each booked or new leg, what happens to it, and why. */
function ItineraryLegs(props: { itinerary: ItineraryView }) {
  const { itinerary } = props;
  return (
    <div className='mt-2.5'>
      <p className='text-muted text-sm'>
        {itinerary.feasible ? 'The rest of the trip' : 'The rest of the trip does not work out'}
      </p>
      <ul className='mt-1 grid gap-1.5'>
        {itinerary.legs.map((leg, i) => {
          const cancelled = leg.status === 'cancel';
          const handled = cancelled || Boolean(leg.replacedBy);
          return (
            <li key={i} className='grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2'>
              <Badge className='justify-center'>{LEG_STATUS[leg.status]}</Badge>
              <div className='min-w-0 text-sm'>
                <span
                  className={cx(
                    'flex items-start gap-1.5',
                    cancelled ? 'text-muted line-through' : 'text-body'
                  )}
                >
                  <Icon
                    name={LEG_ICON[leg.kind] ?? 'pin'}
                    size={13}
                    className='mt-[3px] shrink-0'
                  />
                  {leg.description}
                </span>
                {leg.problem && (
                  <span className={cx('block', handled ? 'text-muted' : 'text-warn-ink')}>
                    {leg.problem}
                  </span>
                )}
                {leg.replacedBy && (
                  <span className='text-muted block'>Replaced by {leg.replacedBy}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OptionBlock(props: {
  option: OptionView;
  why: string | null;
  facts: Record<string, FactView>;
  cardId: string;
  open: boolean;
  chosen: boolean;
}) {
  const { option, why, facts, cardId, open, chosen } = props;
  const blocked = option.blocked ?? option.violations[0] ?? null;
  const highlight = chosen || (option.recommended && !blocked);
  return (
    <div
      className={cx(
        'rounded-panel grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 px-4 py-3.5',
        highlight
          ? 'bg-surface shadow-[inset_0_0_0_1.5px_var(--color-asphalt)]'
          : 'bg-tray shadow-[inset_0_0_0_1px_var(--color-line-soft)]'
      )}
    >
      <span
        className={cx(
          'font-display flex size-7 items-center justify-center rounded-full text-sm font-bold',
          highlight ? 'bg-asphalt text-birch' : 'bg-grey-100 text-secondary'
        )}
      >
        {option.id}
      </span>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-baseline gap-x-2'>
          <span className='text-md text-ink font-semibold'>{option.label}</span>
          {option.recommended && (
            <span className='text-ok-ink text-sm font-medium'>Recommended</span>
          )}
          {chosen && <span className='text-ink text-sm font-medium'>Chosen</span>}
        </div>
        {option.detail && <p className='text-secondary mt-0.5 text-base'>{option.detail}</p>}
        {option.recommended && why && (
          <p className='text-body mt-1.5 text-sm'>
            <span className='text-muted'>Why: </span>
            {why}
          </p>
        )}
        <div className='text-muted mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm'>
          <Slack slackMs={option.slackMs} />
          <span className='flex items-center gap-1.5'>
            <Icon name='euro' size={14} />
            {option.costLabel ?? 'Cost unknown'}
          </span>
          <span className='flex items-center gap-1.5'>
            <Icon name='operator' size={14} />
            {option.whoMustAgree}
          </span>
        </div>
        {option.promise?.window && (
          <p className='text-muted mt-1.5 text-sm'>
            Promise {option.promise.window}
            {option.promise.eta ? ` · expected ${option.promise.eta}` : ''}
            {option.promise.verdict === 'early' && option.promise.earlyHours
              ? ` · ${Math.round(option.promise.earlyHours)} h early, custody needed`
              : ''}
          </p>
        )}
        {blocked && (
          <div className='bg-danger-soft text-danger-ink rounded-panel mt-2.5 flex items-start gap-2 px-3 py-2 text-sm'>
            <Icon name='lock' size={14} className='mt-0.5 shrink-0' />
            <span>
              <span className='font-semibold'>Blocked: {blocked.title}.</span> {blocked.message}
            </span>
          </div>
        )}
        {option.warnings.map((warning, i) => (
          <p key={i} className='text-warn-ink mt-2 flex items-start gap-1.5 text-sm'>
            <Icon name='warning' size={14} className='mt-0.5 shrink-0' />
            {warning.message}
          </p>
        ))}
        {option.driverNotes.map((note) => (
          <p key={note} className='text-warn-ink mt-2 flex items-start gap-1.5 text-sm'>
            <Icon name='driver' size={14} className='mt-0.5 shrink-0' />
            {note}
          </p>
        ))}
        {option.itinerary && option.itinerary.legs.length > 0 && (
          <ItineraryLegs itinerary={option.itinerary} />
        )}
        <FactChips facts={option.factIds.map((id) => facts[id])} max={3} className='mt-2.5' />
        {option.actions.length > 0 && (
          <details className='group mt-3'>
            <summary className='text-secondary hover:text-ink flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium'>
              <Icon
                name='chevron'
                size={14}
                className='transition-transform group-open:rotate-90'
              />
              {afterYesSummary(option)}
            </summary>
            <ol className='mt-2 grid gap-2 pl-5'>
              {option.actions.map((action, i) => (
                <li
                  key={action.id}
                  className='grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 text-base'
                >
                  <span className='text-muted tabular-nums'>{i + 1}.</span>
                  <div className='min-w-0'>
                    <span className='text-body'>{action.description}</span>
                    <span className='text-muted block text-sm'>
                      {action.classLabel}
                      {action.needsYes ? '' : ' · allowed without a yes'}
                    </span>
                    {action.plan.reason && (
                      <span
                        className={cx(
                          'mt-0.5 flex items-start gap-1.5 text-sm',
                          action.plan.mode === 'waits' ? 'text-warn-ink' : 'text-muted'
                        )}
                      >
                        <Icon
                          name={PLAN_ICON[action.plan.mode]}
                          size={13}
                          className='mt-[3px] shrink-0'
                        />
                        {action.plan.reason}
                      </span>
                    )}
                    {action.quoteFactId && facts[action.quoteFactId] && (
                      <FactChip fact={facts[action.quoteFactId]} className='mt-1' />
                    )}
                    {action.message && (
                      <blockquote className='border-line-strong text-secondary mt-1.5 border-l-2 pl-3 text-sm'>
                        {action.message}
                      </blockquote>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </details>
        )}
        {option.reversibility && (
          <p className='text-muted mt-2.5 flex items-start gap-1.5 text-sm'>
            <Icon name='info' size={14} className='mt-0.5 shrink-0' />
            {option.reversibility}
          </p>
        )}
        {open && !option.recommended && !blocked && (
          <div className='mt-3'>
            <ApproveOptionButton cardId={cardId} optionId={option.id} />
          </div>
        )}
      </div>
    </div>
  );
}

// Notes the playbook prefixes for the record; they fold away so the lines a decision turns on stay in view.
const RECORD_NOTE = /^(Call notes|Agent[’']s reading):\s*/i;

function NoteLine(props: { note: string }) {
  const { note } = props;
  const prefix = note.match(RECORD_NOTE)?.[1];
  return (
    <li className='text-secondary flex gap-2.5 text-sm'>
      <Icon name='shield' size={14} className='text-muted mt-0.5 shrink-0' />
      <span>
        {prefix && /reading/i.test(prefix) && (
          <span className='text-muted'>The agent’s reading: </span>
        )}
        {note.replace(RECORD_NOTE, '')}
      </span>
    </li>
  );
}

function AgentNotes(props: { notes: string[] }) {
  const { notes } = props;
  const key = notes.filter((note) => !RECORD_NOTE.test(note)).slice(0, 3);
  const rest = notes.filter((note) => !key.includes(note));
  return (
    <div className='mt-3.5'>
      {key.length > 0 && (
        <ul className='grid gap-1.5'>
          {key.map((note) => (
            <NoteLine key={note} note={note} />
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <details className={cx('group', key.length > 0 && 'mt-2.5')}>
          <summary className='text-secondary hover:text-ink flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium'>
            <Icon name='chevron' size={14} className='transition-transform group-open:rotate-90' />
            <span className='group-open:hidden'>
              Show the agent’s {key.length ? 'other ' : ''}notes ({rest.length})
            </span>
            <span className='hidden group-open:inline'>Hide the agent’s notes</span>
          </summary>
          <ul className='mt-2 grid gap-1.5'>
            {rest.map((note) => (
              <NoteLine key={note} note={note} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Decided(props: { page: CardPage }) {
  const { page } = props;
  const { decision, now } = page;
  if (!decision) return null;
  const verb =
    {
      approve: 'Approved',
      edit: 'Approved with changes',
      reject: 'Rejected',
      handled: 'Handled',
      dismissed: 'Dismissed',
    }[decision.action] ?? humanize(decision.action);
  return (
    <div className='rounded-panel bg-tray min-w-52 px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line-soft)]'>
      <div className='text-muted text-sm font-medium'>Decision</div>
      <div className='font-display text-ink text-lg leading-tight font-bold tracking-tight'>
        {verb}
        {decision.optionId && decision.action !== 'reject' ? ` ${decision.optionId}` : ''}
      </div>
      <div className='text-secondary mt-1 max-w-64 text-sm'>
        {decision.decidedBy ? `by ${actorWords(decision.decidedBy)}` : ''}
        {decision.decidedAt && (
          <>
            {' at '}
            <When at={decision.decidedAt} now={now} />
          </>
        )}
      </div>
    </div>
  );
}

function NextPanel(props: { page: CardPage }) {
  const { page } = props;
  const { next, decision, facts, now } = page;
  if (!decision) return null;
  return (
    <CardSection
      title='What happens next'
      aside={next ? (next.finished ? next.statusWords : 'In progress') : undefined}
    >
      <div className='grid gap-3'>
        {Boolean(decision.note || decision.editedMessages > 0 || decision.removedActions > 0) && (
          <Panel>
            <ul className='text-body grid gap-1 text-base'>
              {decision.editedMessages > 0 && (
                <li className='text-muted'>
                  {decision.editedMessages === 1
                    ? 'One message was reworded.'
                    : `${decision.editedMessages} messages were reworded.`}
                </li>
              )}
              {decision.removedActions > 0 && (
                <li className='text-muted'>
                  {decision.removedActions === 1
                    ? 'One step was skipped.'
                    : `${decision.removedActions} steps were skipped.`}
                </li>
              )}
              {decision.note && (
                <li>
                  <span className='text-muted'>
                    {decision.action === 'edit' ? 'Reason, for the record: ' : 'Note: '}
                  </span>
                  “{decision.note}”
                </li>
              )}
            </ul>
          </Panel>
        )}
        {!next && <p className='text-muted text-base'>No agent run is attached to this card.</p>}
        {next?.refused && (
          <div className='bg-danger-soft text-danger-ink rounded-panel flex items-start gap-2 px-3 py-2 text-sm'>
            <Icon name='lock' size={14} className='mt-0.5 shrink-0' />
            <span>
              <span className='font-semibold'>Not carried out.</span> {next.refused}
            </span>
          </div>
        )}
        {next?.handOverCardId && (
          <Link
            href={`/cards/${next.handOverCardId}`}
            className='text-ink inline-flex items-center gap-1.5 text-base font-medium underline-offset-4 hover:underline'
          >
            <Icon name='inbox' size={15} />
            Handed to a person: open the “worth a look” card
            <Icon name='arrow' size={14} />
          </Link>
        )}
        {next && !next.finished && next.current && (
          <p className='text-info-ink flex items-center gap-2 text-base font-medium'>
            <span className='bg-info animate-pulse-soft size-2 rounded-full' aria-hidden='true' />
            {next.current}
          </p>
        )}
        {next?.steps.map((step) => (
          <div key={step.id} className='grid gap-2.5'>
            <StepList steps={[step]} facts={facts} now={now} />
            {step.kind === 'execute' && next.effects.length > 0 && (
              <ul className='grid gap-2 pl-9'>
                {next.effects.map((effect, i) => (
                  <li key={i} className='flex gap-2.5'>
                    <Icon
                      name={
                        effect.status === 'DONE'
                          ? 'check'
                          : effect.status === 'FAILED'
                            ? 'warning'
                            : 'clock'
                      }
                      size={15}
                      className={cx(
                        'mt-[3px] shrink-0',
                        effect.status === 'DONE'
                          ? 'text-ok-ink'
                          : effect.status === 'FAILED'
                            ? 'text-danger-ink'
                            : effect.status === 'WAITING'
                              ? 'text-warn-ink'
                              : 'text-muted'
                      )}
                    />
                    <div className='min-w-0'>
                      <span className='text-body text-base'>{effect.statement}</span>
                      <FactChips
                        facts={effect.factIds.map((id) => facts[id])}
                        max={2}
                        className='mt-1'
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {next?.finished && (
          <p className='text-muted text-sm'>
            The run is {next.statusWords.toLowerCase()}. Every booking and message above is on the
            order&apos;s timeline.
          </p>
        )}
      </div>
    </CardSection>
  );
}

export function DecisionCardView(props: { page: CardPage }) {
  const { page } = props;
  const { card, options, facts, steps, clock, now } = page;
  const open = card.status === 'OPEN';
  const badge = STATUS_BADGE[card.status] ?? {
    tone: 'neutral' as const,
    text: humanize(card.status),
  };
  const recommended = options.items.find((o) => o.recommended);
  const checks = steps.reduce((sum, step) => sum + step.calls.length, 0);
  const chosenId = page.decision?.action !== 'reject' ? page.decision?.optionId : null;
  return (
    <Card as='article'>
      <CardHeader
        eyebrow={<Eyebrow page={page} />}
        title={card.title}
        meta={
          <span className='flex flex-wrap items-center gap-2'>
            <Badge tone={badge.tone}>{badge.text}</Badge>
            {checks > 0 && (
              <Badge tone='info' icon='agent'>
                Agent did {checks} {checks === 1 ? 'check' : 'checks'}
              </Badge>
            )}
            {recommended && open && <Slack slackMs={recommended.slackMs} />}
          </span>
        }
        aside={
          open ? (
            <LiveCountdown
              clock={clock}
              endsAt={card.decideBy}
              until={card.until}
              reason={card.reason}
            />
          ) : (
            <Decided page={page} />
          )
        }
      />

      {card.summaryLines.length > 0 && (
        <CardSection title='What happened'>
          <MoreLines lines={card.summaryLines} max={3} itemClassName='text-md text-ink' />
          <FactChips
            facts={varied(page.cardFactIds.map((id) => facts[id]))}
            max={5}
            className='mt-3'
          />
        </CardSection>
      )}

      {(steps.length > 0 || options.notes.length > 0 || options.caught.length > 0) && (
        <CardSection
          title='What the agent already did'
          aside={
            steps.length
              ? `${steps.length} steps · ${formatWhen({ at: new Date(steps[0].at ?? card.createdAt), now })}`
              : undefined
          }
        >
          <StepList steps={steps} facts={facts} now={now} />
          {options.caught.length > 0 && (
            <div className='bg-info-soft rounded-panel mt-3.5 px-3.5 py-3'>
              <div className='text-info-ink flex items-center gap-1.5 text-sm font-semibold'>
                <Icon name='shield' size={14} />
                Caught before you saw it
              </div>
              <ul className='text-body mt-1.5 grid gap-1.5 text-sm'>
                {options.caught.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {options.notes.length > 0 && <AgentNotes notes={options.notes} />}
        </CardSection>
      )}

      <CardSection title={options.items.length === 1 ? 'The option' : 'Options'}>
        {options.items.length ? (
          <div className='grid gap-2.5'>
            {options.items.map((option) => (
              <OptionBlock
                key={option.id}
                option={option}
                why={options.recommendation?.why ?? null}
                facts={facts}
                cardId={card.id}
                open={open && card.hasToken}
                chosen={!!chosenId && chosenId === option.id}
              />
            ))}
          </div>
        ) : (
          <p className='text-muted text-base'>
            The agent brought no options; reject to hand it back.
          </p>
        )}
      </CardSection>

      {options.agentWillNot.length > 0 && (
        <Panel className='mt-4' title='The agent will not'>
          <ul className='text-secondary grid gap-1 text-sm'>
            {options.agentWillNot.map((item) => (
              <li key={item} className='flex gap-2'>
                <Icon name='lock' size={14} className='text-muted mt-0.5 shrink-0' /> {item}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {!open && <NextPanel page={page} />}

      {open && (
        <CardFooter>
          {card.hasToken ? (
            <DecisionActions
              cardId={card.id}
              options={options.items.map((option) => ({
                id: option.id,
                label: option.label,
                recommended: option.recommended,
                approvable: isApprovable(option),
                blockedNote: isApprovable(option)
                  ? null
                  : `${(option.blocked ?? option.violations[0])?.title ?? 'A rule'}: ${(option.blocked ?? option.violations[0])?.message ?? 'blocked'}`,
                actions: option.actions.map((a) => ({
                  id: a.id,
                  classLabel: a.classLabel,
                  description: a.description,
                  message: a.message,
                })),
              }))}
            />
          ) : (
            <p className='text-muted text-sm'>
              The agent is still preparing this card. The buttons appear once it is waiting for you.
            </p>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

export function TriageCardView(props: { page: CardPage }) {
  const { page } = props;
  const { card, triage, facts, clock, now } = page;
  const open = card.status === 'OPEN';
  const badge = TRIAGE_BADGE[card.status] ?? {
    tone: 'neutral' as const,
    text: humanize(card.status),
  };
  const gathered = page.cardFactIds
    .filter((id) => id !== triage?.messageFactId)
    .map((id) => facts[id])
    .filter((f): f is FactView => !!f);
  const messageFact = triage?.messageFactId ? facts[triage.messageFactId] : undefined;
  return (
    <Card as='article'>
      <CardHeader
        eyebrow={<Eyebrow page={page} />}
        title={card.title}
        meta={
          <span className='flex flex-wrap items-center gap-2'>
            <Badge tone={badge.tone}>{badge.text}</Badge>
            <span className='text-muted text-sm'>
              No playbook covers this, so a person should look.
            </span>
          </span>
        }
        aside={
          open ? (
            <LiveCountdown
              clock={clock}
              endsAt={card.decideBy}
              label='Next deadline'
              until={card.until}
              reason={card.decideBy ? card.reason : 'Nothing booked depends on it yet.'}
            />
          ) : (
            <Decided page={page} />
          )
        }
      />

      <CardSection title='What came in'>
        {triage?.body ? (
          <figure className='bg-tray rounded-panel px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--color-line-soft)]'>
            <figcaption className='text-muted flex flex-wrap items-baseline gap-x-2 text-sm'>
              <span className='text-ink font-semibold'>{triage.speakerName ?? triage.speaker}</span>
              {triage.speakerName && <span>{triage.speaker}</span>}
              {triage.channel && <span>· {humanize(triage.channel).toLowerCase()}</span>}
              {triage.at && <When at={triage.at} now={now} className='ml-auto tabular-nums' />}
            </figcaption>
            <blockquote className='text-md text-ink mt-1.5'>“{triage.body}”</blockquote>
            {messageFact && <FactChip fact={messageFact} className='mt-2.5' />}
          </figure>
        ) : (
          <p className='text-muted text-base'>The triggering message could not be found.</p>
        )}
      </CardSection>

      {triage && triage.labels.length === 0 && triage.why && (
        <CardSection title='What the watchman read in it'>
          <p className='text-secondary text-base'>{triage.why}</p>
        </CardSection>
      )}

      {triage && triage.labels.length > 0 && (
        <CardSection
          title='What the watchman read in it'
          aside={
            triage.watchmanAt ? formatWhen({ at: new Date(triage.watchmanAt), now }) : undefined
          }
        >
          <ul className='flex flex-wrap gap-2'>
            {triage.labels.map((label) => (
              <li
                key={label.label}
                className='bg-grey-50 text-secondary rounded-full px-2.5 py-0.5 text-sm'
              >
                {label.label} <span className='text-muted'>· {label.likelihood}</span>
              </li>
            ))}
          </ul>
          <p className='text-muted mt-2 text-sm'>
            No playbook covers these yet, so no agent acts on it. Below is what Bahn’s records show
            for the order.
          </p>
        </CardSection>
      )}

      <CardSection
        title='What the records show'
        aside={gathered.length ? `${gathered.length} items` : undefined}
      >
        {gathered.length ? (
          <FactList facts={gathered} />
        ) : (
          <p className='text-muted text-base'>Nothing is on record for this order yet.</p>
        )}
      </CardSection>

      {open ? (
        <CardFooter>
          <TriageActions cardId={card.id} />
        </CardFooter>
      ) : (
        page.decision?.note && (
          <Panel className='mt-4'>
            <p className='text-body text-base'>
              <span className='text-muted'>Note: </span>“{page.decision.note}”
            </p>
          </Panel>
        )
      )}
    </Card>
  );
}

const HANDOVER_WORDS: Record<string, string> = {
  failed: 'The agent stopped with an error',
  rejected: 'You rejected the options',
  expired: 'Nobody decided in time',
  refused: 'The decision was not carried out',
  watchman: 'The watchman could not read this',
  stopped: 'The playbook handed it over',
};

// A run that stopped without carrying out a decision: why, what it did, and the facts it found.
export function HandOverCardView(props: { page: CardPage }) {
  const { page } = props;
  const { card, handover, steps, facts, clock, now } = page;
  if (!handover) return <TriageCardView page={page} />;
  const open = card.status === 'OPEN';
  const gathered = page.cardFactIds.map((id) => facts[id]).filter((f): f is FactView => !!f);
  return (
    <Card as='article'>
      <CardHeader
        eyebrow={<Eyebrow page={page} />}
        title={card.title}
        meta={
          <span className='flex flex-wrap items-center gap-2'>
            <Badge tone={open ? 'warn' : 'neutral'} icon='inbox'>
              {open ? 'Handed to you' : (TRIAGE_BADGE[card.status]?.text ?? humanize(card.status))}
            </Badge>
            <span className='text-muted text-sm'>
              {HANDOVER_WORDS[handover.reason] ?? HANDOVER_WORDS.stopped} · {handover.playbookTitle}
            </span>
          </span>
        }
        aside={
          open ? (
            <LiveCountdown
              clock={clock}
              endsAt={card.decideBy}
              label='Next deadline'
              until={card.until}
              reason={card.decideBy ? card.reason : 'Nothing booked depends on it yet.'}
            />
          ) : (
            <Decided page={page} />
          )
        }
      />

      <CardSection title='Why a person has it'>
        <ul className='grid gap-1.5'>
          {card.summaryLines.map((line, i) => (
            <li key={i} className='text-md text-ink'>
              {line}
            </li>
          ))}
        </ul>
        {handover.decisionCardIds.length > 0 && (
          <div className='mt-3 flex flex-wrap gap-x-4 gap-y-1.5'>
            {handover.decisionCardIds.map((id, i) => (
              <Link
                key={id}
                href={`/cards/${id}`}
                className='text-ink inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline'
              >
                <Icon name='document' size={14} />
                {handover.decisionCardIds.length > 1
                  ? `Decision card ${i + 1}`
                  : 'The decision card'}
                <Icon name='arrow' size={13} />
              </Link>
            ))}
          </div>
        )}
      </CardSection>

      {steps.length > 0 && (
        <CardSection
          title='What the agent did'
          aside={
            handover.runStatusWords ? `Run: ${handover.runStatusWords.toLowerCase()}` : undefined
          }
        >
          <StepList steps={steps} facts={facts} now={now} compact />
        </CardSection>
      )}

      <CardSection
        title='What it found'
        aside={gathered.length ? `${gathered.length} items` : undefined}
      >
        {gathered.length ? (
          <FactList facts={gathered} />
        ) : (
          <p className='text-muted text-base'>Nothing is on record for this order yet.</p>
        )}
      </CardSection>

      {open ? (
        <CardFooter>
          <TriageActions cardId={card.id} />
        </CardFooter>
      ) : (
        page.decision?.note && (
          <Panel className='mt-4'>
            <p className='text-body text-base'>
              <span className='text-muted'>Note: </span>“{page.decision.note}”
            </p>
          </Panel>
        )
      )}
    </Card>
  );
}

/** One chip per kind first, so a row of chips shows the different sources before repeats. */
function varied(list: (FactView | undefined)[]): FactView[] {
  const facts = list.filter((fact): fact is FactView => !!fact);
  const seen = new Set<string>();
  const first: FactView[] = [];
  const rest: FactView[] = [];
  for (const fact of facts) {
    if (seen.has(fact.kind)) rest.push(fact);
    else {
      seen.add(fact.kind);
      first.push(fact);
    }
  }
  return [...first, ...rest];
}

export function FactList(props: { facts: FactView[]; className?: string }) {
  const { facts, className } = props;
  return (
    <ul className={cx('divide-line-soft grid divide-y', className)}>
      {facts.map((fact) => (
        <li key={fact.id} className='grid gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto]'>
          <span className='text-body text-base'>{fact.statement}</span>
          <span className='sm:justify-self-end'>
            <FactChip fact={fact} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Aside(props: { title: string; children: ReactNode; className?: string }) {
  const { title, children, className } = props;
  return (
    <section className={className}>
      <h2 className='text-secondary mb-2 text-sm font-semibold'>{title}</h2>
      {children}
    </section>
  );
}
