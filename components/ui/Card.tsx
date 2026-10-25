import type { ReactNode } from 'react';

import { cx } from '@/components/ui/cx';

type Padding = 'none' | 'sm' | 'md' | 'lg';

const PAD: Record<Padding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6 md:p-7',
};

type CardProps = {
  as?: 'section' | 'article' | 'div' | 'li';
  padding?: Padding;
  interactive?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
};

// Birch paper on the canvas, hairline instead of shadow. Never clip: evidence tooltips overflow.
export function Card(props: CardProps) {
  const { as: Tag = 'section', padding = 'md', interactive, className, id, children } = props;
  return (
    <Tag
      id={id}
      className={cx(
        'rounded-card bg-surface shadow-card relative',
        interactive && 'hover:shadow-raised transition-shadow',
        PAD[padding],
        className
      )}
    >
      {children}
    </Tag>
  );
}

type CardHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

// Eyebrow (order · route), a display title saying what is wrong, optional meta line, and an aside slot.
export function CardHeader(props: CardHeaderProps) {
  const { eyebrow, title, meta, aside, className } = props;
  return (
    <header className={cx('flex flex-wrap items-start justify-between gap-x-6 gap-y-3', className)}>
      <div className='min-w-0 flex-1 basis-80'>
        {eyebrow && (
          <div className='text-muted mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
            {eyebrow}
          </div>
        )}
        <h3 className='font-display text-ink text-xl leading-tight font-bold tracking-tight'>
          {title}
        </h3>
        {meta && <div className='text-secondary mt-1.5 text-base'>{meta}</div>}
      </div>
      {aside && <div className='shrink-0'>{aside}</div>}
    </header>
  );
}

type CardSectionProps = {
  title?: ReactNode;
  aside?: ReactNode;
  divided?: boolean;
  className?: string;
  children: ReactNode;
};

// A labelled block inside a card; divided adds a hairline above.
export function CardSection(props: CardSectionProps) {
  const { title, aside, divided = true, className, children } = props;
  return (
    <div className={cx(divided && 'border-line-soft mt-5 border-t pt-4', className)}>
      {(title || aside) && (
        <div className='mb-2 flex items-baseline justify-between gap-4'>
          {title && <h4 className='text-secondary text-sm font-semibold'>{title}</h4>}
          {aside && <div className='text-muted text-sm'>{aside}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// Tray along the bottom of a card for the decision buttons.
export function CardFooter(props: { className?: string; children: ReactNode }) {
  const { className, children } = props;
  return (
    <div
      className={cx(
        'rounded-b-card border-line-soft bg-tray -mx-5 mt-5 -mb-5 flex flex-wrap items-center gap-2 border-t px-5 py-3.5',
        className
      )}
    >
      {children}
    </div>
  );
}

type PanelProps = {
  title?: ReactNode;
  count?: number | null;
  actions?: ReactNode;
  variant?: 'sunken' | 'outline';
  className?: string;
  children: ReactNode;
};

// A grouped area: sunken tray inside cards, or a quiet outline on the canvas.
export function Panel(props: PanelProps) {
  const { title, count, actions, variant = 'sunken', className, children } = props;
  return (
    <div
      className={cx(
        'rounded-panel px-4 py-3.5',
        variant === 'sunken'
          ? 'bg-tray shadow-[inset_0_0_0_1px_var(--color-line-soft)]'
          : 'border-line border',
        className
      )}
    >
      {(title || actions) && (
        <div className='mb-2 flex items-center justify-between gap-4'>
          {title && (
            <h4 className='text-secondary flex items-baseline gap-2 text-sm font-semibold'>
              {title}
              {count != null && (
                <span className='text-subtle font-medium tabular-nums'>{count}</span>
              )}
            </h4>
          )}
          {actions && <div className='flex items-center gap-2'>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
