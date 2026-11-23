import { cn } from '@/lib/cn';

/** Underlined tab strip for status filters (value `''` = all). */
export function StatusTabs({ value, onChange, tabs }: { value: string; onChange: (v: string) => void; tabs: { value: string; label: string; count?: number }[] }) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-1 border-b border-border" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.value || 'all'}
            type="button"
            role="tab"
            aria-selected={value === tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              '-mb-px flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors',
              value === tab.value ? 'border-primary text-primary-800' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
            {!!tab.count && <span className="rounded-pill bg-accent px-1.5 text-[11px] text-ink-900">{tab.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
