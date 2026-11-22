import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { useBrands, useCategoryTree } from '@/api/catalog';
import { Seo } from '@/components/layout/Seo';
import { Container, ErrorState, SectionHeader, Skeleton } from '@/components/ui';
import { CategoryIcon } from '@/components/catalog/CategoryIcon';
import { CategoryBrowser } from '@/components/catalog/CategoryBrowser';
import { useLocalized } from '@/lib/catalog';

function FeaturedBrands() {
  const { t } = useTranslation();
  const { data } = useBrands(true);
  if (!data?.length) return null;
  return (
    <section className="mt-12">
      <SectionHeader title={t('catalog.featuredBrands')} eyebrow={t('catalog.brandsEyebrow')} />
      <ul className="flex flex-wrap gap-2">
        {data.map((b) => (
          <li key={b.id}>
            <Link
              to={`/brand/${b.slug}`}
              className="inline-flex h-10 items-center rounded-pill border border-border bg-surface px-4 text-sm font-semibold text-fg transition hover:border-primary-500 hover:text-primary-800"
            >
              {b.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CategoriesPage() {
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data, isLoading, error, refetch } = useCategoryTree();

  return (
    <>
      <Seo title={t('nav.categories')} description={t('catalog.allMeta')} canonical="/categories" />
      {/* Mobile: app-like two-pane browser filling the screen above the bottom nav. */}
      <div className="h-[calc(100dvh-8.5rem-4rem)] border-t border-border bg-surface md:hidden">
        <CategoryBrowser className="h-full" />
      </div>

      <Container className="hidden pb-8 pt-6 md:block">
        <SectionHeader as="h1" title={t('catalog.allTitle')} description={t('catalog.allBody')} />
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} className="rounded-lg border border-border bg-surface" />
        ) : isLoading || !data ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-lg" />
            ))}
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map((c) => (
              <li key={c.id} className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-card">
                <Link to={`/c/${c.slug}`} className="group flex items-center gap-3 p-4">
                  <span
                    className="grid size-12 shrink-0 place-items-center rounded-t-[1.5rem] rounded-b-lg text-white shadow-sm"
                    style={{ background: c.color ?? 'rgb(var(--primary))' }}
                  >
                    <CategoryIcon name={c.icon} className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-fg group-hover:text-primary-700">{localized(c.name)}</span>
                    <span className="text-xs text-fg-muted">{t('catalog.subCount', { n: c.children.length })}</span>
                  </span>
                  <ArrowRight className="flip-rtl size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden />
                </Link>
                {c.children.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5 border-t border-border bg-surface-2/40 p-4">
                    {c.children.map((s) => (
                      <li key={s.id}>
                        <Link
                          to={`/c/${s.slug}`}
                          className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg transition hover:border-primary-500 hover:text-primary-800"
                        >
                          <CategoryIcon name={s.icon} className="size-3.5 text-fg-subtle" />
                          {localized(s.name)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <FeaturedBrands />
      </Container>
    </>
  );
}
