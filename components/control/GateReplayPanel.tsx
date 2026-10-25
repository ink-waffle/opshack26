import { connection } from 'next/server';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import {
  type GateReplay,
  replayBahnProposals,
  type ReplayRow,
} from '@/lib/control-room/gateReplay';

const OPERATOR_BADGE: Record<
  ReplayRow['operator'],
  { tone: 'danger' | 'ok' | 'neutral'; text: string }
> = {
  corrected: { tone: 'danger', text: 'Operator corrected' },
  approved: { tone: 'ok', text: 'Operator approved' },
  pending: { tone: 'neutral', text: 'Not decided yet' },
};

function Stat(props: { value: string; label: string; tone?: 'ok' | 'danger' }) {
  const { value, label, tone } = props;
  return (
    <div className='bg-tray rounded-panel px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line-soft)]'>
      <div
        className={cx(
          'font-display text-2xl font-bold tabular-nums',
          tone === 'ok' ? 'text-ok-ink' : tone === 'danger' ? 'text-danger-ink' : 'text-ink'
        )}
      >
        {value}
      </div>
      <div className='text-secondary mt-0.5 text-sm'>{label}</div>
    </div>
  );
}

function Row(props: { row: ReplayRow }) {
  const { row } = props;
  const badge = OPERATOR_BADGE[row.operator];
  return (
    <li className='grid gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-secondary font-mono text-sm'>{row.orderRef}</span>
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </div>
        <p className='text-ink mt-1 text-base'>{row.summary}</p>
        {row.operatorNote && (
          <p className='text-muted mt-0.5 text-sm'>Operator: “{row.operatorNote}”</p>
        )}
      </div>
      <div className='flex min-w-0 items-start gap-2'>
        {row.agrees !== null && (
          <Icon
            name={row.agrees ? 'check' : 'cross'}
            size={15}
            label={row.agrees ? 'agrees with the operator' : 'disagrees with the operator'}
            className={cx('mt-[3px] shrink-0', row.agrees ? 'text-ok-ink' : 'text-danger-ink')}
          />
        )}
        {row.blocked ? (
          <p className='text-body text-sm'>
            <span className='text-danger-ink font-semibold'>
              The rules block it: {row.blocked.ruleId} {row.blocked.title}.
            </span>{' '}
            {row.blocked.message}
          </p>
        ) : (
          <p className='text-secondary text-sm'>The rules let it through to a person’s yes.</p>
        )}
      </div>
    </li>
  );
}

function Summary(props: { replay: GateReplay }) {
  const { replay } = props;
  return (
    <div className='grid gap-2.5 sm:grid-cols-3'>
      <Stat
        value={`${replay.corrected.blocked} of ${replay.corrected.total}`}
        label='proposals operators corrected are blocked by the rules'
        tone={replay.corrected.blocked === replay.corrected.total ? 'ok' : 'danger'}
      />
      <Stat
        value={`${replay.approved.blocked} of ${replay.approved.total}`}
        label='proposals operators approved are blocked (wrongly)'
        tone={replay.approved.blocked === 0 ? 'ok' : 'danger'}
      />
      <Stat
        value={`${replay.agreement.agree} of ${replay.agreement.total}`}
        label='decided proposals where the rules agree with Bahn’s operators'
      />
    </div>
  );
}

// Bahn's recorded agent proposals replayed through the same gate the agents face, computed on every page load.
export async function GateReplayPanel() {
  await connection();
  const replay = await replayBahnProposals();
  return (
    <Card>
      <h3 className='font-display text-ink text-lg font-bold tracking-tight'>
        Bahn’s {replay.rows.length} recorded agent proposals, replayed through the rules now
      </h3>
      <p className='text-muted mt-1 max-w-[80ch] text-sm'>
        Each proposal is checked with only the records that existed when it was made. Operators
        corrected {replay.corrected.total}, approved {replay.approved.total}, and{' '}
        {replay.pending.total} are still open ({replay.pending.blocked} of those blocked).
      </p>
      <div className='mt-4'>
        <Summary replay={replay} />
      </div>
      <ul className='divide-line-soft mt-4 grid divide-y'>
        {replay.rows
          .filter((row) => row.operator !== 'pending')
          .sort((a, b) => Number(b.operator === 'corrected') - Number(a.operator === 'corrected'))
          .map((row) => (
            <Row key={row.id} row={row} />
          ))}
      </ul>
      <div className='bg-tray rounded-panel mt-4 px-4 py-3 text-sm'>
        <div className='text-ink font-semibold'>How far it generalises</div>
        <ul className='text-body mt-1 grid list-disc gap-1 pl-5'>
          <li>
            {replay.rewordings.blocked} of {replay.rewordings.total} rewordings of the corrected
            proposals (other key names, other phrasing, same substance) are blocked. The rules were
            generalised on this set.
          </li>
          <li>
            A blind set of {replay.blind.total} rewordings blocked 9 on its first run; the 3 misses
            (a blame phrase in a record note, “ok to continue”, “switch it off and on”) were then
            fixed. {replay.blind.blocked} of {replay.blind.total} are blocked now.
          </li>
          <li>
            {replay.benign.blocked} of {replay.benign.total} harmless rewordings (“do not restart
            it”, “keep boarding unconfirmed”) are blocked.
          </li>
          <li className='text-muted'>
            The rules match payload keys and phrases; they do not understand meaning, so a new way
            of saying the same thing can still slip through.
          </li>
        </ul>
      </div>
    </Card>
  );
}
