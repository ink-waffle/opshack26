'use client';

import { useEffect, useRef, useState } from 'react';

import { cx } from '@/components/ui/cx';

const CLAMP = { 1: 'line-clamp-1', 2: 'line-clamp-2', 3: 'line-clamp-3' } as const;

// A few lines, each clamped, with a quiet "more" that shows the rest; the button appears only when something is cut.
export function MoreLines(props: {
  lines: string[];
  max?: number;
  clamp?: keyof typeof CLAMP;
  className?: string;
  itemClassName?: string;
}) {
  const { lines, max = 3, clamp = 2, className, itemClassName } = props;
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(lines.length > max);
  const ref = useRef<HTMLUListElement>(null);
  const shown = open ? lines : lines.slice(0, max);

  useEffect(() => {
    if (open || !ref.current) return;
    const items = [...ref.current.children] as HTMLElement[];
    setCut(lines.length > max || items.some((item) => item.scrollHeight > item.clientHeight + 1));
  }, [open, lines, max]);

  return (
    <div className={className}>
      <ul ref={ref} className='grid gap-1.5'>
        {shown.map((line, i) => (
          <li key={i} className={cx(itemClassName, !open && CLAMP[clamp])}>
            {line}
          </li>
        ))}
      </ul>
      {(cut || open) && (
        <button
          type='button'
          onClick={() => setOpen((value) => !value)}
          className='text-muted hover:text-ink mt-1 text-sm font-medium underline-offset-4 hover:underline'
        >
          {open ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}
