import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CategoryFilters } from '@souqly/shared';
import { useCategory } from '@/api/catalog';
import { Seo } from '@/components/layout/Seo';
import { Breadcrumbs, Container, type Crumb } from '@/components/ui';
import { CategoryIcon } from '@/components/catalog/CategoryIcon';
import { ProductListing } from '@/components/catalog/ProductListing';
import { ListingHeaderSkeleton, PageError, breadcrumbLd } from '@/components/catalog/PageStates';
import type { HiddenFilter } from '@/components/catalog/FilterPanel';
import { useLocalized } from '@/lib/catalog';

/** Maps the category's available filters to the panel sections that should be hidden. */
function hiddenFor(filters: CategoryFilters): HiddenFilter[] {
  const std = new Set(filters.standard);
  const keys = new Set(filters.attributes.filter((a) => a.filterable).map((a) => a.key));
  const hidden: HiddenFilter[] = [];
  for (const k of ['price', 'rating', 'brand', 'discount', 'mall', 'city'] as const) if (!std.has(k)) hidden.push(k);
  if (!keys.has('color')) hidden.push('color');
  if (!keys.has('size')) hidden.push('size');
  return hidden;
}

export default function CategoryPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data, error, isLoading, refetch } = useCategory(slug);
  const extra = useMemo(() => ({ category: slug }), [slug]);

  if (error) return <PageError error={error} onRetry={() => refetch()} />;

  const name = data ? localized(data.category.name) : '';
  const crumbs: Crumb[] = data
    ? [
        { label: t('nav.home'), to: '/' },
        { label: t('nav.categories'), to: '/categories' },
        ...data.breadcrumbs.map((b) => ({ label: localized(b.name), to: `/c/${b.slug}` })),
      ]
    : [];

  return (
    <Container className="pb-8 pt-4 sm:pt-6">
      {data && (
        <Seo
          title={name}
          description={t('catalog.metaDescription', { name })}
          canonical={`/c/${slug}`}
          image={data.category.image}
          jsonLd={breadcrumbLd(crumbs)}
        />
      )}
      {isLoading || !data ? (
        <ListingHeaderSkeleton />
      ) : (
        <header>
          <Breadcrumbs items={crumbs} className="text-xs sm:text-sm" />
          <div className="mt-3 flex items-center gap-3">
            <span
              className="grid size-12 shrink-0 place-items-center rounded-t-[1.5rem] rounded-b-lg text-white shadow-card"
              style={{ background: data.category.color ?? 'rgb(var(--primary))' }}
            >
              <CategoryIcon name={data.category.icon} className="size-6" />
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{name}</h1>
          </div>
          {data.children.length > 0 && (
            <nav aria-label={t('catalog.subcategories')} className="mt-5">
              <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                {data.children.map((c) => (
                  <li key={c.id} className="shrink-0">
                    <Link
                      to={`/c/${c.slug}`}
                      className="inline-flex h-10 items-center gap-2 rounded-pill border border-border bg-surface pe-4 ps-3 text-sm font-medium text-fg transition hover:border-primary-500 hover:bg-primary-50 hover:text-primary-800"
                    >
                      <CategoryIcon name={c.icon} className="size-4 text-primary-700" />
                      {localized(c.name)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </header>
      )}
      <div className="mt-6">
        <ProductListing
          key={slug}
          extraParams={extra}
          attributes={data?.filters.attributes ?? []}
          hidden={data ? hiddenFor(data.filters) : []}
        />
      </div>
    </Container>
  );
}
