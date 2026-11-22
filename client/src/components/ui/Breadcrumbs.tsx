import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export type Crumb = { label: string; to?: string };

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('nav.breadcrumbs')} className={cn('text-sm', className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-fg-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5">
              {c.to && !last ? (
                <Link to={c.to} className="hover:text-fg hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn(last && 'font-semibold text-fg')}>
                  {c.label}
                </span>
              )}
              {!last && <ChevronRight className="flip-rtl size-3.5 text-fg-subtle" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
