import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Home, Package, Search } from 'lucide-react';
import type { StorePublic } from '@souqly/shared';
import { useStore, useStoreCategories } from '@/api/catalog';
import { Seo } from '@/components/layout/Seo';
import { Alert, Container, EmptyState, Input, Select, Skeleton } from '@/components/ui';
import { PageError } from '@/components/catalog/PageStates';
import { ProductListing } from '@/components/catalog/ProductListing';
import { StoreHeader } from '@/components/store/StoreHeader';
import { StoreHome } from '@/components/store/StoreHome';
import { TEMPLATE, storeThemeVars } from '@/components/store/storeTheme';
import { useDebounced } from '@/hooks/useDebounced';
import { cn } from '@/lib/cn';
import { absoluteUrl, useLang, useLocalized } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
import { withParam } from '@/lib/listingParams';

type Tab = 'home' | 'products' | 'policies';

function storeLd(s: StorePublic) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: s.name,
    url: absoluteUrl(`/store/${s.slug}`),
    ...(s.logo ? { logo: absoluteUrl(s.logo) } : {}),
    ...(s.banner ? { image: absoluteUrl(s.banner) } : {}),
    ...(s.description || s.tagline ? { description: s.description ?? s.tagline } : {}),
    ...(s.city ? { address: { '@type': 'PostalAddress', addressLocality: s.city } } : {}),
    ...(s.ratingCount > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: s.ratingAvg.toFixed(1), reviewCount: s.ratingCount, bestRating: 5 } }
      : {}),
  };
}

/** Search box + category select shown above the store's product listing. */
function StoreProductsToolbar({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const [sp, setSp] = useSearchParams();
  const cats = useStoreCategories(slug);
  const [q, setQ] = useState(sp.get('q') ?? '');
  const debounced = useDebounced(q.trim(), 300);
  useEffect(() => {
    if ((sp.get('q') ?? '') !== debounced) setSp(withParam(sp, 'q', debounced || null), { replace: true, preventScrollReset: true });
  }, [debounced]); // Sync only when the typed text settles; URL changes elsewhere must not reset it.
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row">
      <div className="flex-1">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('store.searchIn')}
          aria-label={t('store.searchIn')}
          startIcon={<Search className="size-4" />}
          maxLength={100}
          className="h-10"
        />
      </div>
      {!!cats.data?.length && (
        <Select
          aria-label={t('store.category')}
          value={sp.get('category') ?? 'all'}
          onValueChange={(v) => setSp(withParam(sp, 'category', v === 'all' ? null : v), { preventScrollReset: true })}
          options={[{ value: 'all', label: t('store.allCategories') }, ...cats.data.map((c) => ({ value: c.slug, label: `${localized(c.name)} (${c.count})` }))]}
          className="h-10 sm:w-60"
        />
      )}
    </div>
  );
}

function Policies({ store }: { store: StorePublic }) {
  const { t } = useTranslation();
  const blocks = (['shipping', 'returns', 'warranty'] as const).filter((k) => store.policies[k]);
  if (!blocks.length)
    return <EmptyState icon={<FileText />} title={t('store.noPolicies')} description={t('store.noPoliciesBody')} className="rounded-lg border border-dashed border-border-strong bg-surface" />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {blocks.map((k) => (
        <section key={k} className="rounded-lg border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-fg">
            <span className="h-5 w-1 rounded-full bg-[color:var(--store)]" aria-hidden />
            {t(`store.policy.${k}`)}
          </h2>
          {/* Server-sanitized HTML (D-041). */}
          <div className="prose-souq mt-3" dangerouslySetInnerHTML={{ __html: store.policies[k]! }} />
        </section>
      ))}
    </div>
  );
}

function StoreSkeleton() {
  return (
    <Container className="pb-10 pt-4 sm:pt-6" aria-busy>
      <Skeleton className="aspect-[4/1] w-full rounded-xl" />
      <Skeleton className="mx-6 -mt-10 h-28 rounded-lg" />
      <Skeleton className="mt-8 h-11 w-80 rounded-lg" />
    </Container>
  );
}

export default function StorePage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const [sp, setSp] = useSearchParams();
  const { data: store, error, isLoading, refetch } = useStore(slug);
  const raw = sp.get('tab');
  const tab: Tab = raw === 'products' || raw === 'policies' ? raw : 'home';

  if (error) return <PageError error={error} onRetry={() => refetch()} />;
  if (isLoading || !store) return <StoreSkeleton />;

  const setTab = (next: Tab) => {
    const n = new URLSearchParams();
    if (next !== 'home') n.set('tab', next);
    setSp(n, { preventScrollReset: true });
  };
  const tabs: { key: Tab; label: string; icon: typeof Home }[] = [
    { key: 'home', label: t('store.tabHome'), icon: Home },
    { key: 'products', label: t('store.tabProducts', { n: store.productCount }), icon: Package },
    { key: 'policies', label: t('store.tabPolicies'), icon: FileText },
  ];
  const tpl = TEMPLATE[store.layoutTemplate];

  return (
    <div className="store-scope" style={storeThemeVars(store.themeColor)}>
      <Seo
        title={store.seo.title ?? store.name}
        description={store.seo.description ?? store.tagline ?? store.description}
        image={store.banner ?? store.logo}
        canonical={`/store/${store.slug}`}
        jsonLd={storeLd(store)}
      />
      <Container className="pb-10 pt-4 sm:pt-6">
        <StoreHeader store={store} />

        {store.holidayMode.enabled && (
          <Alert tone="warning" className="mt-5" title={t('store.holidayTitle')}>
            {store.holidayMode.message || t('store.holidayBody')}
            {store.holidayMode.until && ` ${t('store.holidayUntil', { date: formatDate(store.holidayMode.until, lang) })}`}
          </Alert>
        )}

        <div
          role="tablist"
          aria-label={store.name}
          className={cn('no-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-border', store.layoutTemplate === 'boutique' && 'justify-center')}
        >
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`store-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`store-panel-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors',
                tab === key ? 'border-[color:var(--store)] text-[color:var(--store-accent)]' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`store-panel-${tab}`} aria-labelledby={`store-tab-${tab}`} className="mt-2">
          {tab === 'home' && <StoreHome store={store} onShowAll={() => setTab('products')} />}
          {tab === 'products' && (
            <div className="mt-4">
              <ProductListing
                key={store.slug}
                path={`/stores/${store.slug}/products`}
                hidden={['mall']}
                density={tpl.density === 'narrow' ? 'narrow' : 'default'}
                toolbarStart={<StoreProductsToolbar slug={store.slug} />}
              />
            </div>
          )}
          {tab === 'policies' && (
            <div className="mt-4">
              <Policies store={store} />
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}
