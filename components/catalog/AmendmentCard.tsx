import { approveAmendment, rejectAmendment } from '@/app/meta/actions';
import { Markdown } from '@/components/catalog/Markdown';
import { Badge, Chip } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardFooter, CardHeader, CardSection, Panel } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import type { Tone } from '@/components/ui/tone';
import { formatDayTime } from '@/lib/control-room/format';
import type { AmendmentView, BacktestCase } from '@/lib/meta';
import { actorWords, plainText } from '@/lib/text';

const pct = (value: unknown) =>
  typeof value === 'number' ? `${Math.round(value * 100)} %` : String(value ?? '—');

// The person who corrects a card is the dispatcher on every page; Bahn's records say "operator".
function words(text: string): string {
  return plainText(text).replace(/\b([Oo])perator(?=s?\b|’s|'s)/g, (_, o: string) =>
    o === 'O' ? 'Dispatcher' : 'dispatcher'
  );
}

const UNIT: Record<string, string> = { minutes: ' min', hours: ' h', count: '', probability: '' };

function formatValue(value: number | null, unit: string | undefined) {
  if (value === null) return '—';
  if (unit === 'probability') return `${Math.round(value * 100)} %`;
  return `${value}${UNIT[unit ?? 'count'] ?? ''}`;
}

export function statusOf(view: AmendmentView): { label: string; tone: Tone } {
  const { status, decidedBy } = view.amendment;
  if (status === 'PROPOSED') return { label: 'Waiting for approval', tone: 'warn' };
  if (status === 'APPROVED') return { label: 'Approved', tone: 'ok' };
  if (decidedBy === 'backtest') return { label: 'Discarded by the backtest', tone: 'neutral' };
  return { label: 'Rejected', tone: 'neutral' };
}

function CaseRow(props: { item: BacktestCase }) {
  const { item } = props;
  const instructionCase = item.kind === 'source' || item.kind === 'regression';
  return (
    <li className='grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 py-1.5'>
      <Icon
        name={item.ok ? 'check' : 'cross'}
        size={15}
        className={cx('mt-0.5', item.ok ? 'text-ok-ink' : 'text-danger-ink')}
      />
      <div className='min-w-0'>
        <div className='text-ink text-base'>{words(item.label)}</div>
        <div className='text-muted text-sm'>
          {instructionCase || item.before === null
            ? words(item.note)
            : `${item.before} → ${item.after}. ${words(item.note)}`}
        </div>
      </div>
    </li>
  );
}

function Backtest(props: { view: AmendmentView }) {
  const { backtest } = props.view;
  if (!backtest) return <p className='text-muted text-sm'>No backtest recorded.</p>;
  const source = backtest.cases.find((item) => item.kind === 'source');
  const changed = backtest.cases.filter(
    (item) => item.kind === 'source' || item.kind === 'regression' || item.note !== 'No change.'
  );
  const unchanged = backtest.cases.length - changed.length;
  return (
    <>
      {source && (
        <div className='mb-3 flex flex-wrap items-center gap-x-6 gap-y-2'>
          <div>
            <div className='text-muted text-sm'>Follows the dispatcher’s correction</div>
            <div className='font-display text-ink mt-0.5 text-2xl font-bold tabular-nums'>
              {pct(source.before)} <span className='text-faint'>→</span>{' '}
              <span className={source.ok ? 'text-ok-ink' : 'text-danger-ink'}>
                {pct(source.after)}
              </span>
            </div>
          </div>
          <p className='text-secondary max-w-[52ch] text-sm'>
            Before: the answer the agent gave on the corrected card. After: the same run replayed
            with the new text, tools off, the recorded tool results fed back. Judged by Jev, a
            separate decision model.
          </p>
        </div>
      )}
      {!source && <p className='text-body mb-2 text-base'>{words(backtest.summary)}</p>}
      <ul className='divide-line-soft divide-y'>
        {changed.map((item) => (
          <CaseRow key={`${item.kind}-${item.ref}-${item.label}`} item={item} />
        ))}
      </ul>
      {unchanged > 0 && (
        <p className='text-muted mt-1 text-sm'>{unchanged} other recorded cases do not change.</p>
      )}
      {backtest.attempts?.map((attempt) => (
        <p key={attempt.text} className='text-muted mt-2 text-sm'>
          Tried first and dropped: “{plainText(attempt.text)}” ({words(attempt.summary)})
        </p>
      ))}
    </>
  );
}

// One proposed change: where it came from, before → after, the backtest, and the chief dispatcher's buttons.
export function AmendmentCard(props: { view: AmendmentView }) {
  const { view } = props;
  const { amendment, source, backtest } = view;
  const status = statusOf(view);
  const isInstruction = amendment.kind === 'INSTRUCTION';
  const noteLine = source?.note ? `Operator's note: “${source.note}”` : null;
  const correctionLines = (source?.correction ?? '')
    .split('\n')
    .filter((line) => line && line !== noteLine)
    .map(words);
  return (
    <Card as='article' id={amendment.id} className='scroll-mt-20'>
      <CardHeader
        eyebrow={
          <>
            <Badge
              tone={isInstruction ? 'info' : 'neutral'}
              icon={isInstruction ? 'document' : 'key'}
            >
              {isInstruction ? 'New instruction' : 'New setting'}
            </Badge>
            <span>{view.playbookTitle}</span>
            {view.blockTitle && (
              <>
                <span aria-hidden='true'>·</span>
                <span>{view.blockTitle}</span>
              </>
            )}
          </>
        }
        title={
          isInstruction
            ? `Teach “${view.blockTitle ?? 'every agent step'}” what the dispatcher corrected`
            : `Change ${view.parameterChanges.length === 1 ? 'a setting' : `${view.parameterChanges.length} settings`} of “${view.playbookTitle}”`
        }
        aside={
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        }
      />

      {source && (
        <CardSection title='What the dispatcher corrected'>
          <div className='mb-2 flex flex-wrap gap-1.5'>
            <Chip icon='document' href={`/cards/${source.card.id}`} mono={false}>
              {source.orderRef ?? 'Card'} · card {source.card.status.toLowerCase()}
              {source.card.decidedBy ? ` by ${actorWords(source.card.decidedBy)}` : ''}
              {source.card.decidedAt ? `, ${formatDayTime({ at: source.card.decidedAt })}` : ''}
            </Chip>
          </div>
          {source.note && (
            <blockquote className='border-asphalt text-ink border-l-2 pl-3 text-base leading-relaxed'>
              “{source.note}”
            </blockquote>
          )}
          {correctionLines.length > 0 && (
            <ul className='text-secondary mt-2 grid gap-1 text-sm'>
              {correctionLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </CardSection>
      )}

      <CardSection title='Proposed change'>
        {isInstruction ? (
          <div className='grid items-start gap-3 md:grid-cols-2'>
            <Panel title='Now'>
              {view.inForce.length ? (
                <ul className='grid gap-1.5'>
                  {view.inForce.map((other) => (
                    <li key={other.id} className='text-body text-sm leading-relaxed'>
                      {other.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-muted text-sm'>
                  Only the written instructions; no approved changes yet.
                </p>
              )}
              {view.instructions && (
                <details className='mt-2'>
                  <summary className='text-secondary cursor-pointer text-sm font-medium'>
                    Read the written instructions
                  </summary>
                  <Markdown className='mt-2 text-sm'>{view.instructions}</Markdown>
                </details>
              )}
            </Panel>
            <Panel title='After approval'>
              <ul className='grid gap-1.5'>
                {view.inForce.map((other) => (
                  <li key={other.id} className='text-body text-sm leading-relaxed'>
                    {other.text}
                  </li>
                ))}
                <li className='bg-ok-soft border-ok-line text-ink rounded-panel border px-3 py-2 text-base leading-relaxed'>
                  <span className='text-ok-ink mr-1.5 text-xs font-semibold'>Added</span>
                  {plainText(amendment.text)}
                </li>
              </ul>
            </Panel>
          </div>
        ) : (
          <ul className='divide-line-soft divide-y'>
            {view.parameterChanges.map((change) => (
              <li
                key={change.key}
                className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2'
              >
                <span className='text-body text-base'>{change.spec?.label ?? change.key}</span>
                <span className='text-ink font-medium tabular-nums'>
                  {formatValue(change.from, change.spec?.unit)}{' '}
                  <span className='text-faint'>→</span>{' '}
                  <span className='text-ok-ink'>{formatValue(change.to, change.spec?.unit)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardSection>

      {amendment.rationale && (
        <CardSection title='Why'>
          <p className='text-body text-base leading-relaxed'>{words(amendment.rationale)}</p>
        </CardSection>
      )}

      <CardSection
        title='Backtest on recorded cases'
        aside={backtest ? `cost $${backtest.costUsd.toFixed(2)}` : undefined}
      >
        <Backtest view={view} />
      </CardSection>

      {amendment.status === 'PROPOSED' ? (
        <CardFooter>
          <form className='contents'>
            <input type='hidden' name='id' value={amendment.id} />
            <Button type='submit' variant='primary' icon='check' formAction={approveAmendment}>
              Approve for every future run
            </Button>
            <Button type='submit' variant='danger' icon='cross' formAction={rejectAmendment}>
              Reject
            </Button>
          </form>
          <span className='text-muted ml-auto text-sm'>You decide as the chief dispatcher.</span>
        </CardFooter>
      ) : (
        amendment.decidedAt && (
          <p className='text-muted mt-4 text-sm'>
            {status.label}
            {amendment.decidedBy && amendment.decidedBy !== 'backtest'
              ? ` by ${actorWords(amendment.decidedBy)}`
              : ''}
            .
          </p>
        )
      )}
    </Card>
  );
}
