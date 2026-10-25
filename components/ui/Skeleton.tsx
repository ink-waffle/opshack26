import { cx } from '@/components/ui/cx';

// Warm shimmer placeholder; size it with className (h-*, w-*).
export function Skeleton(props: { className?: string }) {
  const { className } = props;
  return (
    <span
      aria-hidden='true'
      className={cx(
        'animate-shimmer block rounded-md bg-[linear-gradient(90deg,var(--color-grey-50),var(--color-line-soft),var(--color-grey-50))] bg-[length:200%_100%]',
        className
      )}
    />
  );
}

export function SkeletonText(props: { lines?: number; className?: string }) {
  const { lines = 3, className } = props;
  return (
    <span className={cx('grid gap-2', className)} aria-hidden='true'>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx('h-3.5', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </span>
  );
}

// Same footprint as a decision card, so the queue does not jump when data lands.
export function SkeletonCard(props: { className?: string }) {
  const { className } = props;
  return (
    <div
      role='status'
      aria-label='Loading'
      className={cx('rounded-card bg-surface shadow-card p-5', className)}
    >
      <div className='flex items-start justify-between gap-6'>
        <div className='grid min-w-0 flex-1 gap-2.5'>
          <Skeleton className='h-3.5 w-2/5' />
          <Skeleton className='h-6 w-3/4' />
          <Skeleton className='h-3.5 w-1/2' />
        </div>
        <Skeleton className='rounded-panel hidden h-20 w-1/3 max-w-52 shrink-0 sm:block' />
      </div>
      <div className='border-line-soft mt-5 border-t pt-4'>
        <SkeletonText lines={3} />
      </div>
      <div className='mt-5 flex gap-2'>
        <Skeleton className='h-10 w-36 rounded-full' />
        <Skeleton className='h-10 w-24 rounded-full' />
      </div>
    </div>
  );
}
