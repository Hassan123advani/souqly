import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, PackageOpen } from 'lucide-react';
import type { ProductSort, StorePublic, StoreSectionType } from '@souqly/shared';
import { useProductsPreview, useStoreCategories } from '@/api/catalog';
import { Button, EmptyState, ErrorState, ProductCardSkeleton, Skeleton } from '@/components/ui';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/ProductGrid';
import { Rail } from '@/components/product/Rail';
import { cn } from '@/lib/cn';
import { safeInternalLink, useLocalized } from '@/lib/catalog';
import { TEMPLATE } from './storeTheme';

type Section = StorePublic['sections'][number];

/** Product query per product-section type. */
const SECTION_QUERY: Partial<Record<StoreSectionType, { sort: ProductSort; extra?: Record<string, string> }>> = {
  featured: { sort: 'top_rated' },
  deals: { sort: 'discount', extra: { discount: '10' } },
  new_arrivals: { sort: 'newest' },
  best_sellers: { sort: 'best_selling' },
};

/** Trim to complete desktop rows (6 per row for "wide", 4 for "narrow") so grids never end ragged. */
const fullRows = (n: number, density: 'default' | 'wide' | 'narrow') => {
  const per = density === 'wide' ? 6 : density === 'narrow' ? 4 : 5;
  return n >= per ? n - (n % per) : n;
};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const num = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? Math.min(v, 24) : d);

function SectionTitle({ store, title, allLink }: { store: StorePublic; title: string; allLink?: string }) {
  const { t } = useTranslation();
  const layout = store.layoutTemplate;
  const tpl = TEMPLATE[layout];
  const link = allLink && (
    <Link to={allLink} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[color:var(--store-accent)] hover:underline">
      {t('listing.viewAll')}
      <ArrowRight className="flip-rtl size-4" aria-hidden />
    </Link>
  );
  if (layout === 'bold')
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-[color:var(--store-fg)]" style={{ background: 'var(--store)' }}>
        <h2 className={tpl.heading}>{title}</h2>
        {allLink && (
          <Link to={allLink} className="inline-flex items-center gap-1 text-sm font-bold hover:underline">
            {t('listing.viewAll')}
            <ArrowRight className="flip-rtl size-4" aria-hidden />
          </Link>
        )}
      </div>
    );
  if (layout === 'boutique')
    return (
      <div className="mb-6 text-center">
        <h2 className={cn(tpl.heading, 'text-fg')}>{title}</h2>
        <span className="mx-auto mt-2 block h-px w-16 bg-[color:var(--store)]" aria-hidden />
        {allLink && <div className="mt-2">{link}</div>}
      </div>
    );
  if (layout === 'minimal')
    return (
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className={cn(tpl.heading, 'text-fg')}>{title}</h2>
        {link}
      </div>
    );
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h2 className={cn(tpl.heading, 'flex items-center gap-2 text-fg')}>
        <span className="h-6 w-1.5 rounded-full bg-[color:var(--store)]" aria-hidden />
        {title}
      </h2>
      {link}
    </div>
  );
}

function ProductSection({ store, section }: { store: StorePublic; section: Section }) {
  const { t } = useTranslation();
  const q = SECTION_QUERY[section.type]!;
  const limit = num(section.config.limit, 8);
  const params = { sort: q.sort, limit: String(limit), ...(q.extra ?? {}) };
  const { data, isLoading, error, refetch } = useProductsPreview(`/stores/${store.slug}/products`, params);
  const tpl = TEMPLATE[store.layoutTemplate];
  const title = section.title ?? t(`store.section.${section.type}`);
  const allLink = `/store/${store.slug}?tab=products&sort=${q.sort}${q.extra?.discount ? `&discount=${q.extra.discount}` : ''}`;

  if (!isLoading && !error && !data?.length) return null;
  return (
    <section className={store.layoutTemplate === 'boutique' ? 'mt-14' : 'mt-10'}>
      <SectionTitle store={store} title={title} allLink={allLink} />
      {error ? (
        <ErrorState compact error={error} onRetry={() => refetch()} />
      ) : tpl.rails ? (
        <Rail label={title}>
          {isLoading ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} className="w-full" />) : data!.map((p) => <ProductCard key={p.id} product={p} className="w-full" />)}
        </Rail>
      ) : isLoading ? (
        <ProductGridSkeleton count={limit > 8 ? 8 : limit} density={tpl.density} />
      ) : (
        <ProductGrid products={data!.slice(0, fullRows(data!.length, tpl.density))} density={tpl.density} />
      )}
    </section>
  );
}

function CategoryRow({ store, section }: { store: StorePublic; section: Section }) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data, isLoading } = useStoreCategories(store.slug);
  if (!isLoading && !data?.length) return null;
  return (
    <section className="mt-10">
      <SectionTitle store={store} title={section.title ?? t('store.section.category_row')} />
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-10 w-32 rounded-pill" />
              </li>
            ))
          : data!.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link
                  to={`/store/${store.slug}?tab=products&category=${c.slug}`}
                  className="inline-flex h-10 items-center gap-2 rounded-pill border border-border bg-surface px-4 text-sm font-medium text-fg transition hover:border-[color:var(--store)]"
                >
                  {localized(c.name)}
                  <span className="text-xs text-fg-subtle tabular">{c.count}</span>
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
}

function BannerSection({ section }: { section: Section }) {
  const image = str(section.config.image);
  const link = str(section.config.link);
  const body = str(section.config.subtitle) ?? str(section.config.body);
  const content = (
    <div className="relative overflow-hidden rounded-xl text-[color:var(--store-fg)]" style={{ background: 'linear-gradient(120deg, var(--store), var(--store-deep))' }}>
      {image && <img src={image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-40" />}
      <div className="relative p-6 sm:p-10">
        {section.title && <h2 className="text-2xl font-extrabold sm:text-3xl">{section.title}</h2>}
        {body && <p className="mt-2 max-w-xl opacity-90">{body}</p>}
      </div>
    </div>
  );
  return <section className="mt-10">{link ? <Link to={safeInternalLink(link)}>{content}</Link> : content}</section>;
}

function TextSection({ store, section }: { store: StorePublic; section: Section }) {
  const body = str(section.config.body) ?? str(section.config.text) ?? (section.title ? undefined : store.description);
  if (!body && !section.title) return null;
  return (
    <section className="mt-10 rounded-lg border border-border bg-surface p-6">
      {section.title && <SectionTitle store={store} title={section.title} />}
      {/* Plain text only: section config is seller-provided. */}
      {body && <p className="whitespace-pre-line text-sm leading-relaxed text-fg-muted">{body}</p>}
    </section>
  );
}

/** "About" strip used as the hero section body (the visual hero is the StoreHeader). */
function HeroSection({ store }: { store: StorePublic }) {
  const { t } = useTranslation();
  if (!store.description) return null;
  const layout = store.layoutTemplate;
  return (
    <section
      className={cn(
        'mt-8',
        layout === 'boutique' && 'mx-auto max-w-2xl text-center',
        layout === 'classic' && 'rounded-lg border border-border bg-surface p-5',
        layout === 'bold' && 'rounded-lg border-s-4 border-[color:var(--store)] bg-surface p-5',
      )}
    >
      <h2 className="sr-only">{t('store.about')}</h2>
      <p className={cn('text-sm leading-relaxed text-fg-muted sm:text-base', layout === 'boutique' && 'italic')}>{store.description}</p>
    </section>
  );
}

/** Renders the store's configured home sections in its layout template. */
export function StoreHome({ store, onShowAll }: { store: StorePublic; onShowAll: () => void }) {
  const { t } = useTranslation();
  const sections = store.sections.length ? store.sections : [{ type: 'hero', config: {} }, { type: 'best_sellers', config: {} }, { type: 'new_arrivals', config: {} }] as Section[];
  if (!store.productCount)
    return (
      <EmptyState
        icon={<PackageOpen />}
        title={t('store.emptyTitle')}
        description={t('store.emptyBody')}
        className="mt-8 rounded-lg border border-dashed border-border-strong bg-surface"
      />
    );
  return (
    <div>
      {sections.map((s, i) => {
        const key = `${s.type}-${i}`;
        if (s.type === 'hero') return <HeroSection key={key} store={store} />;
        if (s.type === 'category_row') return <CategoryRow key={key} store={store} section={s} />;
        if (s.type === 'banner') return <BannerSection key={key} section={s} />;
        if (s.type === 'text') return <TextSection key={key} store={store} section={s} />;
        if (SECTION_QUERY[s.type]) return <ProductSection key={key} store={store} section={s} />;
        return null;
      })}
      <div className="mt-10 flex justify-center">
        <Button variant="outline" size="lg" onClick={onShowAll} rightIcon={<ArrowRight className="flip-rtl size-4" />}>
          {t('store.allProducts')}
        </Button>
      </div>
    </div>
  );
}
