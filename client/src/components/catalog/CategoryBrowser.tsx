import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import type { CategoryNode } from '@souqly/shared';
import { ErrorState, Skeleton } from '@/components/ui';
import { useCategoryTree } from '@/api/catalog';
import { cn } from '@/lib/cn';
import { useLocalized } from '@/lib/catalog';
import { CategoryIcon, CategoryTile } from './CategoryIcon';

/**
 * Two-pane category browser (top-level rail on the start side, subcategory tiles beside it).
 * Used by the mobile categories sheet and the /categories page on small screens.
 */
export function CategoryBrowser({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data, isLoading, error, refetch } = useCategoryTree();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} compact />;
  if (isLoading || !data)
    return (
      <div className={cn('grid grid-cols-[96px_1fr] gap-3 p-3', className)} aria-busy>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[5/6]" />
          ))}
        </div>
      </div>
    );

  const active: CategoryNode | undefined = data.find((c) => c.slug === activeSlug) ?? data[0];

  return (
    <div className={cn('grid min-h-0 grid-cols-[96px_1fr]', className)}>
      <ul className="no-scrollbar min-h-0 overflow-y-auto border-e border-border bg-surface-2/60" aria-label={t('nav.categories')}>
        {data.map((c) => {
          const on = c.slug === active?.slug;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActiveSlug(c.slug)}
                aria-pressed={on}
                className={cn(
                  'relative flex w-full flex-col items-center gap-1.5 px-1.5 py-3 text-center text-[11px] font-semibold leading-tight transition-colors',
                  on ? 'bg-surface text-primary-700' : 'text-fg-muted hover:text-fg',
                )}
              >
                {on && <span className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-accent" aria-hidden />}
                <CategoryIcon name={c.icon} className="size-5" />
                <span className="line-clamp-2">{localized(c.name)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {active && (
        <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
          <Link
            to={`/c/${active.slug}`}
            onClick={onNavigate}
            className="mb-4 flex items-center justify-between gap-2 rounded-lg p-3 text-sm font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${active.color ?? '#0E5E5A'}, #0B2826)` }}
          >
            <span>{t('catalog.shopAll', { name: localized(active.name) })}</span>
            <ArrowRight className="flip-rtl size-4" aria-hidden />
          </Link>
          {active.children.length ? (
            <ul className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4">
              {active.children.map((s) => (
                <li key={s.id}>
                  <CategoryTile to={`/c/${s.slug}`} onClick={onNavigate} name={localized(s.name)} icon={s.icon} color={s.color ?? active.color} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{t('catalog.noSubcategories')}</p>
          )}
        </div>
      )}
    </div>
  );
}
