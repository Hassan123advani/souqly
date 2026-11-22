import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Container({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8', className)} {...rest} />;
}

export function SectionHeader({
  title,
  eyebrow,
  description,
  action,
  className,
  as: Tag = 'h2',
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent-700">
            <span className="h-px w-5 bg-accent" aria-hidden />
            {eyebrow}
          </p>
        )}
        <Tag className={cn('font-extrabold tracking-tight text-fg', Tag === 'h1' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl')}>
          {title}
        </Tag>
        {description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Divider({ label, className }: { label?: ReactNode; className?: string }) {
  if (!label) return <hr className={cn('border-0 border-t border-border', className)} />;
  return (
    <div className={cn('flex items-center gap-3 text-xs font-medium text-fg-subtle', className)} role="separator">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'latin inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface-2 px-1 font-sans text-[11px] font-semibold text-fg-muted shadow-[inset_0_-1px_0] shadow-border-strong',
        className,
      )}
      {...rest}
    />
  );
}
