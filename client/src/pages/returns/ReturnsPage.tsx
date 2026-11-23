import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Undo2 } from 'lucide-react';
import { useMyReturns } from '@/api/returns';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { Seo } from '@/components/layout/Seo';
import { ProductImage } from '@/components/product/ProductImage';
import { ReturnStatusBadge } from '@/components/returns/ReturnBits';
import { formatDate, money } from '@/lib/format';
import { useUi } from '@/stores/ui';

export default function ReturnsPage() {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const q = useMyReturns();
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <Seo title={t('returns.title')} noindex />
      <h2 className="text-xl font-extrabold tracking-tight text-fg">{t('returns.title')}</h2>
      {q.isPending ? (
        <div className="space-y-3" aria-busy>
          {[0, 1, 2].map((k) => (
            <Skeleton key={k} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !rows.length ? (
        <Card>
          <EmptyState icon={<Undo2 />} title={t('returns.empty')} description={t('returns.emptyBody')} action={<Button to="/account/orders?tab=delivered">{t('returns.goToOrders')}</Button>} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card interactive className="p-0">
                <Link to={`/account/returns/${r.id}`} className="flex items-center gap-3 rounded-lg p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                  <ProductImage src={r.items[0]?.image} alt="" className="size-14 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="latin text-sm font-bold text-fg" dir="ltr">
                        {r.order.number}
                      </span>
                      <ReturnStatusBadge status={r.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-fg-muted">
                      {r.store.name} · {t('returns.itemsCount', { count: r.items.reduce((n, i) => n + i.qty, 0) })} · {t(`returns.reasons.${r.reason}`)}
                    </p>
                    <p className="text-xs text-fg-subtle">{formatDate(r.createdAt, lang)}</p>
                  </div>
                  <span className="latin shrink-0 text-sm font-bold tabular text-fg" dir="ltr">
                    {money(r.refund.amount)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle rtl:rotate-180" aria-hidden />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t('returns.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
