import { forwardRef, type ButtonHTMLAttributes, type MouseEventHandler, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg shadow-sm hover:brightness-110 active:brightness-95',
  accent: 'bg-accent text-accent-fg shadow-sm hover:brightness-105 active:brightness-95',
  secondary: 'bg-primary-50 text-primary-800 hover:bg-primary-100 dark:text-primary-800',
  outline: 'border border-border-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white shadow-sm hover:brightness-110 dark:text-ink-50',
  link: 'h-auto px-0 text-primary-700 underline-offset-4 hover:underline',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-11 px-4 text-sm gap-2 rounded-md',
  lg: 'h-12 px-6 text-base gap-2 rounded-lg',
  xl: 'h-14 px-8 text-base gap-2.5 rounded-lg',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Render as a router Link. */
  to?: string;
  /** Render as a plain anchor (external / download). */
  href?: string;
  target?: string;
  rel?: string;
};

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block,
  className,
}: Pick<ButtonProps, 'variant' | 'size' | 'block' | 'className'>) {
  return cn(
    'relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold',
    'transition-[background-color,filter,color,box-shadow,transform] duration-150 ease-souq',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    sizes[size],
    variants[variant],
    block && 'w-full',
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, block, leftIcon, rightIcon, to, href, target, rel, className, children, disabled, type, ...rest },
  ref,
) {
  const cls = buttonClasses({ variant, size, block, className });
  const content = (
    <>
      {loading ? <Spinner className="size-4" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </>
  );
  const linkProps = {
    className: cls,
    'aria-label': rest['aria-label'],
    title: rest.title,
    'aria-disabled': disabled || undefined,
    onClick: rest.onClick as unknown as MouseEventHandler<HTMLAnchorElement> | undefined,
  };
  if (to) {
    return (
      <Link to={to} {...linkProps}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target={target} rel={rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)} {...linkProps}>
        {content}
      </a>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
});

export type IconButtonProps = Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'size'> & {
  /** Accessible name is required because the button has no visible text. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
};

const iconSizes = { sm: 'size-9', md: 'size-11', lg: 'size-12' };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', variant = 'ghost', className, children, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      aria-label={label}
      title={label}
      className={cn('rounded-pill px-0', iconSizes[size], className)}
      {...rest}
    >
      {children}
    </Button>
  );
});
