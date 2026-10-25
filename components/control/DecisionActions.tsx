'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { decideCard } from '@/lib/control-room/actions';
import type { ActionResult } from '@/lib/control-room/types';

export type DecisionOption = {
  id: string;
  label: string;
  recommended: boolean;
  approvable: boolean;
  // Why the gate blocked it (null when approvable); an edit must skip the blocked step.
  blockedNote: string | null;
  actions: { id: string; classLabel: string; description: string; message: string | null }[];
};

type Mode = 'idle' | 'edit' | 'reject';

const field =
  'w-full rounded-panel border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-asphalt focus:outline-none';

// The decision tray: approve, approve with reworded messages or skipped steps, or reject with a note. Completes the run's waitpoint.
export function DecisionActions(props: { cardId: string; options: DecisionOption[] }) {
  const { cardId, options } = props;
  const [mode, setMode] = useState<Mode>('idle');
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(decideCard, null);
  const primary =
    options.find((o) => o.recommended && o.approvable) ?? options.find((o) => o.approvable);
  const [editId, setEditId] = useState(primary?.id ?? options[0]?.id ?? '');
  const editing = options.find((o) => o.id === editId);

  if (state?.ok) {
    return (
      <div className='text-ok-ink flex items-center gap-2 text-base font-medium' role='status'>
        <Icon name='check' size={16} />
        {state.message ?? 'Sent.'}
      </div>
    );
  }

  return (
    <div className='w-full'>
      {mode === 'idle' && (
        <form action={action} className='flex flex-wrap items-center gap-2'>
          <input type='hidden' name='cardId' value={cardId} />
          <input type='hidden' name='intent' value='approve' />
          {primary && <input type='hidden' name='optionId' value={primary.id} />}
          <Button type='submit' variant='primary' icon='check' disabled={!primary || pending}>
            {pending ? 'Sending…' : primary ? `Approve ${primary.id}` : 'No option can be approved'}
          </Button>
          <Button icon='edit' onClick={() => setMode('edit')} disabled={pending}>
            Edit
          </Button>
          <Button
            variant='danger'
            icon='cross'
            onClick={() => setMode('reject')}
            disabled={pending}
          >
            Reject
          </Button>
          <span className='text-muted ml-auto text-sm'>
            Your answer goes straight to the agent, which carries it out.
          </span>
        </form>
      )}

      {mode === 'edit' && (
        <form action={action} className='grid gap-4'>
          <input type='hidden' name='cardId' value={cardId} />
          <input type='hidden' name='intent' value='edit' />
          <input type='hidden' name='optionId' value={editId} />
          <div>
            <div className='text-secondary mb-1.5 text-sm font-semibold'>Option to approve</div>
            <div className='flex flex-wrap gap-1.5'>
              {options.map((option) => (
                <button
                  key={option.id}
                  type='button'
                  onClick={() => setEditId(option.id)}
                  aria-pressed={editId === option.id}
                  className={cx(
                    'inline-flex h-8 max-w-full items-center gap-2 rounded-full px-3 text-sm font-medium disabled:opacity-40',
                    editId === option.id
                      ? 'bg-asphalt text-birch'
                      : 'text-secondary hover:bg-grey-50 shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
                  )}
                  title={option.label}
                >
                  <span className='font-display font-bold'>{option.id}</span>
                  <span className='max-w-72 truncate'>{option.label}</span>
                  {!option.approvable && <Icon name='lock' size={13} />}
                </button>
              ))}
            </div>
            {editing?.blockedNote && (
              <p className='text-danger-ink mt-2 flex items-start gap-1.5 text-sm'>
                <Icon name='lock' size={14} className='mt-0.5 shrink-0' />
                <span>
                  Blocked by {editing.blockedNote}. Skip the step it names; otherwise it cannot be
                  approved.
                </span>
              </p>
            )}
          </div>
          {editing && editing.actions.length > 0 && (
            <div>
              <div className='text-secondary mb-1.5 text-sm font-semibold'>Steps after yes</div>
              <ul className='grid gap-2.5' key={editing.id}>
                {editing.actions.map((step) => (
                  <li
                    key={step.id}
                    className='rounded-panel bg-surface border-line-soft border px-3 py-2.5'
                  >
                    <label className='flex items-start gap-2.5 text-base'>
                      <input
                        type='checkbox'
                        name={`drop:${step.id}`}
                        className='accent-asphalt mt-1'
                      />
                      <span className='min-w-0'>
                        <span className='text-ink'>{step.description}</span>
                        <span className='text-muted block text-sm'>
                          {step.classLabel} · tick to skip this step
                        </span>
                      </span>
                    </label>
                    {step.message !== null && (
                      <>
                        <input type='hidden' name={`orig:${step.id}`} value={step.message} />
                        <textarea
                          name={`msg:${step.id}`}
                          defaultValue={step.message}
                          rows={3}
                          aria-label={`Message text for ${step.description}`}
                          className={cx(field, 'mt-2 text-sm')}
                        />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className='grid gap-1.5'>
            <span className='text-secondary text-sm font-semibold'>
              Reason{' '}
              <span className='text-muted font-normal'>
                (optional, for the record; nothing written here is carried out)
              </span>
            </span>
            <input name='note' className={field} placeholder='Why you reworded or skipped it' />
          </label>
          <p className='text-muted text-sm'>
            Only the steps above run, with your wording. Anything they cannot do: reject the card
            with a note instead, and a person takes it over.
          </p>
          <div className='flex flex-wrap items-center gap-2'>
            <Button type='submit' variant='primary' icon='check' disabled={pending}>
              {pending ? 'Sending…' : `Approve ${editId} with these edits`}
            </Button>
            <Button variant='quiet' onClick={() => setMode('idle')} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {mode === 'reject' && (
        <form action={action} className='grid gap-3'>
          <input type='hidden' name='cardId' value={cardId} />
          <input type='hidden' name='intent' value='reject' />
          <label className='grid gap-1.5'>
            <span className='text-secondary text-sm font-semibold'>
              Why reject <span className='text-muted font-normal'>(required)</span>
            </span>
            <textarea
              name='note'
              required
              rows={2}
              className={field}
              placeholder='What is wrong with these options, and what should happen instead'
            />
          </label>
          <p className='text-muted text-sm'>
            The agent does nothing further. The order moves to “Worth a look” with what the agent
            found, so a person picks it up; the playbook learns from your note.
          </p>
          <div className='flex flex-wrap items-center gap-2'>
            <Button type='submit' variant='danger' icon='cross' disabled={pending}>
              {pending ? 'Sending…' : 'Reject and hand back'}
            </Button>
            <Button variant='quiet' onClick={() => setMode('idle')} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {state && !state.ok && (
        <p className='text-danger-ink mt-3 flex items-start gap-1.5 text-sm' role='alert'>
          <Icon name='warning' size={14} className='mt-0.5' />
          {state.error}
        </p>
      )}
    </div>
  );
}

// "Approve B instead" on a non-recommended option; same action, its own small form.
export function ApproveOptionButton(props: { cardId: string; optionId: string }) {
  const { cardId, optionId } = props;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(decideCard, null);
  if (state?.ok) return <span className='text-ok-ink text-sm font-medium'>{state.message}</span>;
  return (
    <form action={action} className='inline-flex items-center gap-2'>
      <input type='hidden' name='cardId' value={cardId} />
      <input type='hidden' name='intent' value='approve' />
      <input type='hidden' name='optionId' value={optionId} />
      <Button type='submit' size='sm' disabled={pending}>
        {pending ? 'Sending…' : `Approve ${optionId} instead`}
      </Button>
      {state && !state.ok && <span className='text-danger-ink text-sm'>{state.error}</span>}
    </form>
  );
}
