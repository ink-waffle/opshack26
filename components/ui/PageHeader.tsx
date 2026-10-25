import type { ReactNode } from 'react';

import { cx } from '@/components/ui/cx';

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

// Page title in Bahn's wide display face, one plain sentence under it, actions on the right.
export function PageHeader(props: PageHeaderProps) {
  const { eyebrow, title, description, meta, actions, className } = props;
  return (
    <header
      className={cx(
        'flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pt-8 pb-6',
        className
      )}
    >
      <div className='min-w-0 flex-1 basis-96'>
        {eyebrow && <div className='text-muted mb-2 text-sm font-medium'>{eyebrow}</div>}
        <h1 className='font-display text-ink text-3xl font-extrabold tracking-tight'>{title}</h1>
        {description && <p className='text-md text-secondary mt-2 max-w-[68ch]'>{description}</p>}
        {meta && (
          <div className='text-muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm'>
            {meta}
          </div>
        )}
      </div>
      {actions && <div className='flex shrink-0 flex-wrap items-center gap-2'>{actions}</div>}
    </header>
  );
}
