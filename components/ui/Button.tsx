import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/components/ui/cx';
import { Icon, type IconName } from '@/components/ui/Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md';

type ButtonStyleArgs = { variant?: ButtonVariant; size?: ButtonSize; className?: string };

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-asphalt text-birch hover:bg-grey-900 active:bg-grey-800',
  secondary:
    'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-grey-50 active:bg-grey-100',
  quiet: 'bg-transparent text-secondary hover:bg-ink/5 hover:text-ink active:bg-ink/10',
  danger:
    'bg-surface text-danger-ink shadow-[inset_0_0_0_1px_var(--color-danger-line)] hover:bg-danger-soft active:bg-red-100',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3.5 text-sm',
  md: 'h-10 gap-2 px-5 text-base',
};

// Bahn buttons are pills: asphalt for the one thing to do, outlined for the alternatives.
export function buttonClass(args: ButtonStyleArgs = {}): string {
  const { variant = 'secondary', size = 'md', className } = args;
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors select-none',
    'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45',
    VARIANT[variant],
    SIZE[size],
    className
  );
}

type OwnProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
};

export type ButtonProps = OwnProps & Omit<ComponentProps<'button'>, keyof OwnProps>;

export function Button(props: ButtonProps) {
  const { variant, size = 'md', icon, iconRight, className, children, type, ...rest } = props;
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <button type={type ?? 'button'} className={buttonClass({ variant, size, className })} {...rest}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}

export type ButtonLinkProps = OwnProps & Omit<ComponentProps<typeof Link>, keyof OwnProps>;

export function ButtonLink(props: ButtonLinkProps) {
  const { variant, size = 'md', icon, iconRight, className, children, ...rest } = props;
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <Link className={buttonClass({ variant, size, className })} {...rest}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </Link>
  );
}
