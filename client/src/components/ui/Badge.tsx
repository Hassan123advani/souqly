import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'sale' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-fg-muted border-border',
  primary: 'bg-primary-50 text-primary-800 border-primary-100',
  accent: 'bg-accent-50 text-accent-800 border-accent-100',
  sale: 'bg-sale text-sale-fg border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  info: 'bg-info-soft text-info border-transparent',
};

export function Badge({
  tone = 'neutral',
  size = 'md',
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-pill border font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}

/** Small numeric counter for icons (cart, notifications). */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        'pointer-events-none absolute -top-0.5 end-0 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-sale px-1 text-[10px] font-bold leading-none text-sale-fg ring-2 ring-surface tabular',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
