import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BadgeCheck, HandCoins, LayoutGrid, MessageCircle, RotateCcw, Store } from 'lucide-react';
import type { CampaignCard, HomeSection, ProductCard as ProductCardData, StoreCard as StoreCardData } from '@souqly/shared';
import { useHome, useJustForYou, useRecentlyViewed } from '@/api/catalog';
import { Seo } from '@/components/layout/Seo';
import { Badge, Button, Container, ErrorState, SectionHeader, Skeleton } from '@/components/ui';
import { HeroCarousel } from '@/components/home/HeroCarousel';
import { FlashSaleStrip } from '@/components/home/FlashSaleStrip';
import { CategoryTile } from '@/components/catalog/CategoryIcon';
import { ProductRail, Rail } from '@/components/product/Rail';
import { LoadMore, ProductGrid, ProductGridSkeleton } from '@/components/product/ProductGrid';
import { StoreCard, StoreCardSkeleton } from '@/components/product/StoreCard';
import { ProductCard } from '@/components/product/ProductCard';
import { useLocalized } from '@/lib/catalog';

/** "View all" targets per home section type. */
const VIEW_ALL: Partial<Record<HomeSection['type'], string>> = {
  best_sellers: '/search?sort=best_selling',
  new_arrivals: '/search?sort=newest',
  top_rated: '/search?sort=top_rated',
  trending: '/search?sort=best_selling',
  mall: '/mall',
  top_stores: '/stores',
};

function CampaignBanners({ items }: { items: CampaignCard[] }) {
  const { t } = useTranslation();
  const visible = items.filter((c) => c.isLive || new Date(c.startsAt).getTime() > Date.now());
  if (!visible.length) return null;
  return (
    <section className="mt-10 sm:mt-12" aria-labelledby="home-campaigns">
      <SectionHeader title={<span id="home-campaigns">{t('home.sections.campaign')}</span>} eyebrow={t('home.campaignsEyebrow')} />
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {visible.slice(0, 4).map((c) => (
          <li key={c.slug}>
            <Link to={`/campaign/${c.slug}`} className="group relative block overflow-hidden rounded-xl border border-border bg-surface-2 shadow-card">
              {c.banner ? (
                <img src={c.banner} alt={c.name} loading="lazy" className="aspect-[8/3] w-full object-cover transition-transform duration-400 group-hover:scale-[1.02]" />
              ) : (
                <div className="grid aspect-[8/3] place-items-center bg-primary text-xl font-extrabold text-primary-fg">{c.name}</div>
              )}
              <span className="absolute end-3 top-3">
                {c.isLive ? <Badge tone="sale">{t('campaign.live')}</Badge> : <Badge tone="accent">{t('campaign.upcoming')}</Badge>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopStores({ items }: { items: StoreCardData[] }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <section className="mt-10 sm:mt-12" aria-labelledby="home-stores">
      <SectionHeader
        title={<span id="home-stores">{t('home.sections.top_stores')}</span>}
        eyebrow={t('home.shops.eyebrow')}
        description={t('home.shops.body')}
        action={
          <Button to="/stores" variant="link" size="sm" rightIcon={<ArrowRight className="flip-rtl size-4" />}>
            {t('listing.viewAll')}
          </Button>
        }
      />
      <Rail label={t('home.sections.top_stores')} itemClassName="w-[70%] sm:w-[40%] md:w-[31%] lg:w-[23.5%]">
        {items.map((s) => (
          <StoreCard key={s.id} store={s} />
        ))}
      </Rail>
    </section>
  );
}

function MallRail({ items }: { items: ProductCardData[] }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <section className="mt-10 overflow-hidden rounded-xl border border-primary-200 bg-gradient-to-br from-primary-50 via-surface to-surface p-4 sm:mt-12 sm:p-6">
      <SectionHeader
        title={
          <span className="inline-flex items-center gap-2">
            <BadgeCheck className="size-6 text-primary-700" aria-hidden />
            {t('home.sections.mall')}
          </span>
        }
        description={t('home.mallBody')}
        action={
          <Button to="/mall" variant="secondary" size="sm" rightIcon={<ArrowRight className="flip-rtl size-4" />}>
            {t('home.visitMall')}
          </Button>
        }
      />
      <Rail label={t('home.sections.mall')}>
        {items.map((p) => (
          <ProductCard key={p.id} product={p} className="w-full" />
        ))}
      </Rail>
    </section>
  );
}

function JustForYou() {
  const { t } = useTranslation();
  const feed = useJustForYou();
  const products = feed.data?.pages.flatMap((p) => p.data) ?? [];
  const loadMore = useCallback(() => void feed.fetchNextPage(), [feed]);
  return (
    <section className="mt-12" aria-labelledby="home-foryou" aria-busy={feed.isPending || undefined}>
      <SectionHeader title={<span id="home-foryou">{t('home.forYou.title')}</span>} eyebrow={t('home.forYou.eyebrow')} />
      {feed.error && !products.length ? (
        <ErrorState error={feed.error} onRetry={() => feed.refetch()} className="rounded-lg border border-border bg-surface" />
      ) : feed.isPending ? (
        <ProductGridSkeleton count={12} density="wide" />
      ) : (
        <>
          <ProductGrid products={products} density="wide" />
          <LoadMore hasMore={!!feed.hasNextPage} loading={feed.isFetchingNextPage} onLoadMore={loadMore} shown={products.length} />
        </>
      )}
    </section>
  );
}

function RecentlyViewed() {
  const { t } = useTranslation();
  const { data } = useRecentlyViewed();
  if (!data?.length) return null;
  return <ProductRail title={t('home.recentlyViewed')} eyebrow={t('home.recentlyEyebrow')} products={data.slice(0, 18)} />;
}

export default function HomePage() {
  const { t } = useTranslation();
  const localized = useLocalized();
  const home = useHome();
  const data = home.data;

  const trust = [
    { icon: HandCoins, title: t('home.trust.cod'), body: t('home.trust.codBody') },
    { icon: BadgeCheck, title: t('home.trust.verified'), body: t('home.trust.verifiedBody') },
    { icon: RotateCcw, title: t('home.trust.returns'), body: t('home.trust.returnsBody') },
    { icon: MessageCircle, title: t('home.trust.chat'), body: t('home.trust.chatBody') },
  ];

  return (
    <>
      <Seo
        description={t('home.metaDescription')}
        canonical="/"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Souqly',
          url: window.location.origin,
          potentialAction: { '@type': 'SearchAction', target: `${window.location.origin}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
        }}
      />
      <Container className="pt-4 sm:pt-6">
        <h1 className="sr-only">{t('home.hero.title')}</h1>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <HeroCarousel slides={data?.heroSlides ?? []} loading={home.isPending} />
          <div className="hidden grid-rows-2 gap-4 xl:grid">
            <Link to="/mall" className="dark group relative flex flex-col justify-end overflow-hidden rounded-xl bg-[#0B2826] p-5 text-fg shadow-card">
              <div className="souq-pattern absolute inset-0 opacity-60" aria-hidden />
              <BadgeCheck className="relative size-7 text-accent" aria-hidden />
              <p className="relative mt-2 text-lg font-extrabold text-ink-950">{t('home.sections.mall')}</p>
              <p className="relative text-xs text-fg-muted">{t('home.mallTile')}</p>
              <ArrowRight className="flip-rtl absolute end-5 top-5 size-5 text-accent transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" aria-hidden />
            </Link>
            <Link to="/sell" className="group relative flex flex-col justify-end overflow-hidden rounded-xl border border-accent-200 bg-gradient-to-br from-accent-50 to-surface p-5 shadow-card">
              <Store className="size-7 text-accent-700" aria-hidden />
              <p className="mt-2 text-lg font-extrabold text-fg">{t('home.hero.ctaSell')}</p>
              <p className="text-xs text-fg-muted">{t('home.sellTile')}</p>
              <ArrowRight className="flip-rtl absolute end-5 top-5 size-5 text-accent-700 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" aria-hidden />
            </Link>
          </div>
        </div>

        {home.error && (
          <ErrorState error={home.error} onRetry={() => home.refetch()} className="mt-6 rounded-lg border border-border bg-surface" compact />
        )}

        {/* Trust strip */}
        <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {trust.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-t-[1.25rem] rounded-b-md bg-primary-50 text-primary-700">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-fg">{title}</p>
                <p className="mt-0.5 hidden text-xs text-fg-muted sm:block">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* Categories */}
        <section className="mt-10" aria-labelledby="home-cats" aria-busy={home.isPending || undefined}>
          <SectionHeader
            title={<span id="home-cats">{t('home.categories.title')}</span>}
            eyebrow={t('home.categories.eyebrow')}
            action={
              <Button to="/categories" variant="link" size="sm" rightIcon={<ArrowRight className="flip-rtl size-4" />}>
                {t('catalog.allCategories')}
              </Button>
            }
          />
          <ul className="no-scrollbar -mx-4 grid auto-cols-[76px] grid-flow-col grid-rows-2 gap-x-3 gap-y-4 overflow-x-auto px-4 sm:mx-0 sm:grid-flow-row sm:grid-cols-6 sm:grid-rows-none sm:px-0 md:grid-cols-8 lg:grid-cols-12">
            {home.isPending
              ? Array.from({ length: 12 }).map((_, i) => (
                  <li key={i} className="flex flex-col items-center gap-2">
                    <Skeleton className="aspect-[5/6] w-full max-w-[88px] rounded-t-[999px] rounded-b-lg" />
                    <Skeleton className="h-2.5 w-3/4" />
                  </li>
                ))
              : (data?.categories ?? []).slice(0, 11).map((c) => (
                  <li key={c.id}>
                    <CategoryTile to={`/c/${c.slug}`} name={localized(c.name)} icon={c.icon} color={c.color} />
                  </li>
                ))}
            {!home.isPending && (
              <li>
                <Link to="/categories" className="group flex flex-col items-center gap-2 text-center">
                  <span className="grid aspect-[5/6] w-full max-w-[88px] place-items-center rounded-t-[999px] rounded-b-lg border border-dashed border-border-strong bg-surface-2 text-fg-muted transition group-hover:border-primary-500 group-hover:text-primary-700">
                    <LayoutGrid className="size-7" aria-hidden />
                  </span>
                  <span className="text-xs font-semibold text-fg sm:text-[13px]">{t('catalog.allCategories')}</span>
                </Link>
              </li>
            )}
          </ul>
        </section>

        <FlashSaleStrip fallback={data?.flashSale} loading={home.isPending} />

        {home.isPending ? (
          <>
            <ProductRail title={t('home.sections.trending')} loading />
            <section className="mt-12">
              <Skeleton className="h-7 w-48" />
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <StoreCardSkeleton key={i} />
                ))}
              </div>
            </section>
          </>
        ) : (
          data?.sections.map((s, i) => {
            const key = `${s.type}-${i}`;
            if (s.type === 'top_stores') return <TopStores key={key} items={s.items} />;
            if (s.type === 'campaign') return <CampaignBanners key={key} items={s.items} />;
            if (s.type === 'mall') return <MallRail key={key} items={s.items} />;
            return (
              <ProductRail
                key={key}
                title={t(`home.sections.${s.type}`, { defaultValue: s.title })}
                eyebrow={s.type === 'trending' ? t('home.trendingEyebrow') : undefined}
                products={s.items}
                viewAll={VIEW_ALL[s.type]}
              />
            );
          })
        )}

        <RecentlyViewed />
        <JustForYou />

        {/* Seller CTA */}
        <section className="mt-14 overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid items-center gap-6 p-6 sm:p-10 md:grid-cols-[1fr_auto]">
            <div className="flex items-start gap-4">
              <span className="hidden size-14 shrink-0 place-items-center rounded-t-[1.75rem] rounded-b-lg bg-accent-50 text-accent-700 ring-1 ring-accent-100 sm:grid">
                <Store className="size-6" />
              </span>
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-fg sm:text-2xl">{t('home.sellCta.title')}</h2>
                <p className="mt-1.5 max-w-xl text-sm text-fg-muted">{t('home.sellCta.body')}</p>
              </div>
            </div>
            <Button to="/sell" size="lg" rightIcon={<ArrowRight className="flip-rtl size-4" />}>
              {t('home.sellCta.cta')}
            </Button>
          </div>
        </section>
      </Container>
    </>
  );
}
