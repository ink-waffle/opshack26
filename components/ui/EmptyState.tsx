import type { ReactNode } from 'react';

import { cx } from '@/components/ui/cx';
import { Icon, type IconName } from '@/components/ui/Icon';

type EmptyStateProps = {
  icon?: IconName;
  title: ReactNode;
  action?: ReactNode;
  size?: 'page' | 'inline';
  className?: string;
  children?: ReactNode;
};

// Say what is true ("Nothing needs a person") and what was checked, never just "No data".
export function EmptyState(props: EmptyStateProps) {
  const { icon = 'check', title, action, size = 'page', className, children } = props;
  if (size === 'inline') {
    return (
      <div className={cx('text-secondary flex items-start gap-2.5 py-1 text-base', className)}>
        <Icon name={icon} size={16} className='text-muted mt-0.5' />
        <div className='min-w-0'>
          <div className='text-ink font-medium'>{title}</div>
          {children && <div className='text-muted mt-0.5 text-sm'>{children}</div>}
          {action && <div className='mt-2'>{action}</div>}
        </div>
      </div>
    );
  }
  return (
    <div
      className={cx(
        'rounded-card border-line-strong flex flex-col items-center border border-dashed px-6 py-12 text-center',
        className
      )}
    >
      <span className='bg-surface text-grey-600 shadow-card flex size-11 items-center justify-center rounded-xl'>
        <Icon name={icon} size={20} />
      </span>
      <div className='font-display text-ink mt-4 text-lg font-bold tracking-tight'>{title}</div>
      {children && <div className='text-muted mt-1.5 max-w-md text-base'>{children}</div>}
      {action && <div className='mt-5'>{action}</div>}
    </div>
  );
}
