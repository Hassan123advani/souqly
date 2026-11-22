import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchX } from 'lucide-react';
import { getErrorStatus } from '@/api/client';
import { Button, Container, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { Seo } from '@/components/layout/Seo';
import type { Crumb } from '@/components/ui';

/** Full-page error: a friendly "not found" for 404s, otherwise a retryable error. */
export function PageError({ error, onRetry, notFoundTitle }: { error: unknown; onRetry?: () => void; notFoundTitle?: ReactNode }) {
  const { t } = useTranslation();
  if (getErrorStatus(error) === 404)
    return (
      <Container className="py-12">
        <Seo title={t('notFound.title')} noindex />
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface shadow-card">
          <EmptyState
            icon={<SearchX />}
            title={notFoundTitle ?? t('notFound.title')}
            description={t('catalog.notFoundBody')}
            action={
              <>
                <Button to="/">{t('coming.backHome')}</Button>
                <Button to="/categories" variant="outline">
                  {t('catalog.browseCategories')}
                </Button>
              </>
            }
          />
        </div>
      </Container>
    );
  return (
    <Container className="py-12">
      <ErrorState error={error} onRetry={onRetry} className="mx-auto max-w-xl rounded-xl border border-border bg-surface" />
    </Container>
  );
}

/** Header skeleton for listing pages (breadcrumbs + title + chips). */
export function ListingHeaderSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-3.5 w-48" />
      <Skeleton className="mt-4 h-8 w-64" />
      <div className="mt-5 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-pill" />
        ))}
      </div>
    </div>
  );
}

/** schema.org BreadcrumbList for crumbs that have links. */
export function breadcrumbLd(items: Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.to ? { item: `${window.location.origin}${c.to}` } : {}),
    })),
  };
}
