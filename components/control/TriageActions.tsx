'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { resolveTriage } from '@/lib/control-room/actions';
import type { ActionResult } from '@/lib/control-room/types';

const field =
  'w-full rounded-panel border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-asphalt focus:outline-none';

// Close a "worth a look" card: handled (say what you did) or dismissed.
export function TriageActions(props: { cardId: string }) {
  const { cardId } = props;
  const [handling, setHandling] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    resolveTriage,
    null
  );

  if (state?.ok) {
    return (
      <div className='text-ok-ink flex items-center gap-2 text-base font-medium' role='status'>
        <Icon name='check' size={16} />
        {state.message}
      </div>
    );
  }

  return (
    <div className='w-full'>
      {handling ? (
        <form action={action} className='grid gap-3'>
          <input type='hidden' name='cardId' value={cardId} />
          <input type='hidden' name='intent' value='handled' />
          <label className='grid gap-1.5'>
            <span className='text-secondary text-sm font-semibold'>What did you do?</span>
            <textarea
              name='note'
              required
              rows={2}
              className={field}
              placeholder='e.g. Called the customer, tyres go with the car at no extra cost'
            />
          </label>
          <div className='flex flex-wrap items-center gap-2'>
            <Button type='submit' variant='primary' icon='check' disabled={pending}>
              {pending ? 'Saving…' : 'Mark as handled'}
            </Button>
            <Button variant='quiet' onClick={() => setHandling(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <form action={action} className='flex flex-wrap items-center gap-2'>
          <input type='hidden' name='cardId' value={cardId} />
          <input type='hidden' name='intent' value='dismiss' />
          <Button variant='primary' icon='check' onClick={() => setHandling(true)}>
            Handled
          </Button>
          <Button type='submit' variant='quiet' icon='cross' disabled={pending}>
            {pending ? 'Dismissing…' : 'Dismiss'}
          </Button>
          <span className='text-muted ml-auto text-sm'>
            No agent is waiting on this card; closing it only clears the queue.
          </span>
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
