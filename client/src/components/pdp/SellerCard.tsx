import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import type { StoreSummaryCard } from '@souqly/shared';
import { Button } from '@/components/ui';
import { ChatWithSellerButton, type DraftProduct } from '@/components/chat/ChatWithSeller';
import { FollowButton, useFollowerCount } from '@/components/social/FollowButton';
import { MallBadge } from '@/components/product/ProductCard';
import { StoreLogo } from '@/components/product/StoreCard';
import { compactNumber, useLang } from '@/lib/catalog';
import { formatDate } from '@/lib/format';

/** Store summary on the PDP; `product` prefills a product card when chatting with the seller. */
export function SellerCard({ store, product }: { store: StoreSummaryCard; product?: DraftProduct }) {
  const { t } = useTranslation();
  const lang = useLang();
  const followers = useFollowerCount(store.slug, store.followerCount);
  const stats = [
    { label: t('store.rating'), value: store.ratingAvg ? store.ratingAvg.toFixed(1) : '—', icon: <Star className="size-3.5 fill-accent text-accent" aria-hidden /> },
    { label: t('store.followers'), value: compactNumber(followers) },
    { label: t('store.responseRate'), value: `${store.responseRate}%` },
  ];
  return (
    <section className="rounded-lg border border-border bg-surface p-4" aria-labelledby="seller-card-title">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{t('pdp.soldBy')}</p>
      <div className="mt-2 flex items-center gap-3">
        <StoreLogo src={store.logo} name={store.name} className="size-12 border-border text-lg" />
        <div className="min-w-0 flex-1">
          <h2 id="seller-card-title" className="flex items-center gap-2 truncate font-bold text-fg">
            <span className="truncate">{store.name}</span>
            {store.isMall && <MallBadge />}
          </h2>
          <p className="text-xs text-fg-muted">
            {t('store.joined', { date: formatDate(store.joinedAt, lang, { month: 'short', year: 'numeric' }) })} ·{' '}
            {t('store.productsN', { n: compactNumber(store.productCount) })}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-border rounded-md bg-surface-2/60 py-2.5 text-center rtl:divide-x-reverse">
        {stats.map((s) => (
          <div key={s.label} className="px-1">
            <dt className="text-[11px] text-fg-muted">{s.label}</dt>
            <dd className="latin mt-0.5 inline-flex items-center gap-1 text-sm font-bold text-fg tabular">
              {s.icon}
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button to={`/store/${store.slug}`} variant="outline" size="sm" className="flex-1">
          {t('pdp.visitStore')}
        </Button>
        <FollowButton slug={store.slug} className="flex-1" />
        <ChatWithSellerButton storeSlug={store.slug} product={product} variant="secondary" className="w-full" label={t('store.chat')} />
      </div>
    </section>
  );
}
