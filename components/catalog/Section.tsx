import type { ReactNode } from 'react';

import { cx } from '@/components/ui/cx';

// A page section: display title on the left, one muted sentence on the right.
export function Section(props: {
  title: ReactNode;
  note?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const { title, note, id, className, children } = props;
  return (
    <section id={id} className={cx('mt-12 scroll-mt-20', className)}>
      <div className='mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1'>
        <h2 className='font-display text-ink text-xl font-bold tracking-tight'>{title}</h2>
        {note && <p className='text-muted max-w-[68ch] text-sm sm:text-right'>{note}</p>}
      </div>
      {children}
    </section>
  );
}
