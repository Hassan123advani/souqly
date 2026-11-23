import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type PillTab<K extends string> = { key: K; label: ReactNode; count?: number };

/** Horizontally scrolling pill tabs (used by notifications, returns and the rider app). */
export function PillTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: {
  tabs: PillTab<K>[];
  value: K;
  onChange: (k: K) => void;
  label: string;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)}>
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.key)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-pill border font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
              size === 'lg' ? 'h-11 flex-1 px-4 text-sm' : 'h-9 px-3.5 text-sm',
              on ? 'border-primary bg-primary text-primary-fg' : 'border-border bg-surface text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
            {!!tab.count && <span className={cn('latin rounded-pill px-1.5 text-[11px] tabular', on ? 'bg-white/20' : 'bg-surface-2')}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
