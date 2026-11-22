import { useTranslation } from 'react-i18next';
import { MessageCircle, Plus, Star } from 'lucide-react';
import type { StoreSummaryCard } from '@souqly/shared';
import { Button } from '@/components/ui';
import { MallBadge } from '@/components/product/ProductCard';
import { StoreLogo } from '@/components/product/StoreCard';
import { compactNumber, useLang } from '@/lib/catalog';
import { formatDate } from '@/lib/format';

/** Follow and Chat arrive with Phase 8 (followers + messaging); hidden until then (D-035). */
export const FOLLOW_READY = false;
export const CHAT_READY = false;

export function SellerCard({ store }: { store: StoreSummaryCard }) {
  const { t } = useTranslation();
  const lang = useLang();
  const stats = [
    { label: t('store.rating'), value: store.ratingAvg ? store.ratingAvg.toFixed(1) : '—', icon: <Star className="size-3.5 fill-accent text-accent" aria-hidden /> },
    { label: t('store.followers'), value: compactNumber(store.followerCount) },
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
      <div className="mt-4 flex gap-2">
        <Button to={`/store/${store.slug}`} variant="outline" size="sm" className="flex-1">
          {t('pdp.visitStore')}
        </Button>
        {FOLLOW_READY && (
          <Button variant="secondary" size="sm" leftIcon={<Plus className="size-4" />}>
            {t('store.follow')}
          </Button>
        )}
        {CHAT_READY && (
          <Button variant="ghost" size="sm" leftIcon={<MessageCircle className="size-4" />}>
            {t('store.chat')}
          </Button>
        )}
      </div>
    </section>
  );
}
