import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { useCategoryTree } from '@/api/catalog';
import { ErrorState, Skeleton } from '@/components/ui';
import { useLocalized } from '@/lib/catalog';
import { cn } from '@/lib/cn';

/** Pick 1..max categories from the tree: top-level chips, expandable to subcategories. */
export function CategoryMultiSelect({ value, onChange, max = 10 }: { value: string[]; onChange: (ids: string[]) => void; max?: number }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { data, isLoading, error, refetch } = useCategoryTree();
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (error || !data) return <ErrorState compact error={error} onRetry={() => void refetch()} />;

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < max) onChange([...value, id]);
  };
  const chip = (id: string, label: string, small?: boolean) => {
    const on = value.includes(id);
    return (
      <button
        key={id}
        type="button"
        onClick={() => toggle(id)}
        aria-pressed={on}
        disabled={!on && value.length >= max}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-pill border px-3 font-semibold transition-colors disabled:opacity-40',
          small ? 'h-8 text-xs' : 'h-9 text-sm',
          on ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-fg hover:border-primary-400',
        )}
      >
        {on && <Check className="size-3.5" />}
        {label}
      </button>
    );
  };
  const openNode = data.find((c) => c.id === open);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {data.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-0.5">
            {chip(c.id, loc(c.name))}
            {c.children.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen(open === c.id ? null : c.id)}
                aria-expanded={open === c.id}
                aria-label={t('seller.categories.showSub', { name: loc(c.name) })}
                className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-surface-2"
              >
                <ChevronDown className={cn('size-4 transition-transform', open === c.id && 'rotate-180')} />
              </button>
            )}
          </span>
        ))}
      </div>
      {openNode && (
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <p className="mb-2 text-xs font-semibold text-fg-muted">{loc(openNode.name)}</p>
          <div className="flex flex-wrap gap-2">{openNode.children.map((c) => chip(c.id, loc(c.name), true))}</div>
        </div>
      )}
      <p className="text-xs text-fg-muted">{t('seller.categories.count', { n: value.length, max })}</p>
    </div>
  );
}
