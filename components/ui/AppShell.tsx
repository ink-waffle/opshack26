import Link from 'next/link';
import { type ReactNode, Suspense } from 'react';

import { cx } from '@/components/ui/cx';
import { BahnMark } from '@/components/ui/Icon';
import { NAV_ITEMS, NavLinks, NavList } from '@/components/ui/NavLinks';

type AppShellProps = { right?: ReactNode; children: ReactNode };

// Quiet top bar on the canvas: mark + name, pill nav, and a right slot for the sim clock.
export function AppShell(props: AppShellProps) {
  const { right, children } = props;
  return (
    <div className='flex min-h-dvh flex-col'>
      <header className='border-line bg-canvas/90 sticky top-0 z-40 border-b backdrop-blur-md'>
        {/* Below sm the nav drops to its own row, so it never runs under the clock. */}
        <div className='mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:h-16 sm:flex-nowrap sm:gap-8 sm:px-6 sm:py-0'>
          <Link
            href='/'
            className='text-ink flex shrink-0 items-center gap-2.5'
            aria-label='Bahn Control Room, home'
          >
            <BahnMark size={20} />
            <span className='font-display hidden text-[0.9375rem] font-bold tracking-tight sm:inline'>
              Control Room
            </span>
          </Link>
          <div className='order-last w-full min-w-0 sm:order-none sm:w-auto'>
            <Suspense fallback={<NavList items={NAV_ITEMS} pathname={null} />}>
              <NavLinks />
            </Suspense>
          </div>
          <div className='ml-auto flex shrink-0 items-center gap-2'>{right}</div>
        </div>
      </header>
      <div className='flex flex-1 flex-col'>{children}</div>
    </div>
  );
}

type PageContainerProps = {
  width?: 'default' | 'narrow' | 'wide' | 'full';
  className?: string;
  children: ReactNode;
};

const WIDTH = {
  narrow: 'max-w-3xl',
  default: 'max-w-6xl',
  wide: 'max-w-[1440px]',
  full: 'max-w-none',
};

// Page gutter and max width; pages pick their own width inside the shell.
export function PageContainer(props: PageContainerProps) {
  const { width = 'default', className, children } = props;
  return (
    <main className={cx('mx-auto w-full flex-1 px-4 pb-24 sm:px-6', WIDTH[width], className)}>
      {children}
    </main>
  );
}
