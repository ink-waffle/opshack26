'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cx } from '@/components/ui/cx';

export type NavItem = { href: string; label: string };

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Control room' },
  { href: '/orders', label: 'Orders' },
  { href: '/playbooks', label: 'Playbooks' },
  { href: '/meta', label: 'Meta' },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

// Bahn's pill nav: the current page sits on a birch pill, the rest are plain words.
export function NavLinks(props: { items?: NavItem[] }) {
  const { items = NAV_ITEMS } = props;
  const pathname = usePathname();
  return <NavList items={items} pathname={pathname} />;
}

export function NavList(props: { items: NavItem[]; pathname: string | null }) {
  const { items, pathname } = props;
  return (
    <nav aria-label='Main' className='-mx-1 flex min-w-0 items-center gap-0.5 overflow-x-auto px-1'>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'inline-flex h-9 items-center rounded-full px-3.5 text-base font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-surface text-ink shadow-pill'
                : 'text-secondary hover:bg-ink/5 hover:text-ink'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
