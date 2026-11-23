import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Star, Store } from 'lucide-react';
import type { ProductCard as ProductCardData } from '@souqly/shared';
import { flatPages, useFollowing, useFollowingFeed, type FeedProduct } from '@/api/social';
import { Seo } from '@/components/layout/Seo';
import { ProductCard } from '@/components/product/ProductCard';
import { StoreLogo } from '@/components/product/StoreCard';
import { FollowButton } from '@/components/social/FollowButton';
import { Button, Card, EmptyState, ErrorState, LoadMore, ProductCardSkeleton, SectionHeader, Skeleton } from '@/components/ui';
import { compactNumber } from '@/lib/catalog';

function toCard(p: FeedProduct): ProductCardData {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    image: p.image ?? '',
    price: p.price,
    ...(p.compareAtPrice ? { compareAtPrice: p.compareAtPrice } : {}),
    discountPct: p.discountPct,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    soldCount: p.soldCount,
    freeShipping: false,
    cod: false,
    isMall: false,
    store: { slug: p.store.slug, name: p.store.name },
    ...(p.inStock ? {} : { unavailable: true }),
  };
}

/** `/account/following`: followed stores + newest products from them. */
export default function FollowingPage() {
  const { t } = useTranslation();
  const stores = useFollowing();
  const feed = useFollowingFeed();
  const list = flatPages(stores.data);
  const products = flatPages(feed.data);

  return (
    <div className="space-y-8">
      <Seo title={t('social.following.title')} noindex />
      <section className="space-y-4">
        <SectionHeader as="h2" title={t('social.following.title')} />
        {stores.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : stores.isError ? (
          <ErrorState error={stores.error} onRetry={() => void stores.refetch()} />
        ) : !list.length ? (
          <EmptyState icon={<Store className="size-6" />} title={t('social.following.none')} description={t('social.following.noneHint')} action={<Button to="/stores">{t('social.following.discover')}</Button>} />
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((s) => (
                <li key={s.id}>
                  <Card className="flex items-center gap-3 p-3">
                    <StoreLogo src={s.logo} name={s.name} className="size-12 border-border text-lg" />
                    <Link to={`/store/${s.slug}`} className="min-w-0 flex-1">
                      <p className="truncate font-bold text-fg hover:underline">{s.name}</p>
                      <p className="flex items-center gap-2 text-xs text-fg-muted">
                        <span className="inline-flex items-center gap-0.5">
                          <Star className="size-3 fill-accent text-accent" aria-hidden />
                          <span className="latin tabular">{s.ratingAvg ? s.ratingAvg.toFixed(1) : '—'}</span>
                        </span>
                        <span>{t('social.follow.followersN', { n: compactNumber(s.followerCount) })}</span>
                      </p>
                    </Link>
                    <FollowButton slug={s.slug} className="min-w-0" />
                  </Card>
                </li>
              ))}
            </ul>
            <LoadMore hasMore={!!stores.hasNextPage} loading={stores.isFetchingNextPage} onLoadMore={() => void stores.fetchNextPage()} />
          </>
        )}
      </section>

      {list.length > 0 && (
        <section className="space-y-4">
          <SectionHeader as="h2" eyebrow={<Sparkles className="inline size-4" aria-hidden />} title={t('social.following.feed')} />
          {feed.isPending ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : feed.isError ? (
            <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
          ) : !products.length ? (
            <EmptyState compact title={t('social.following.feedEmpty')} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => (
                  <ProductCard key={p.id} product={toCard(p)} />
                ))}
              </div>
              <LoadMore hasMore={!!feed.hasNextPage} loading={feed.isFetchingNextPage} onLoadMore={() => void feed.fetchNextPage()} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
