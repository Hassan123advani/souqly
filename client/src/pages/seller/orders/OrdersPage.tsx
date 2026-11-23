import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PackageCheck, Search, ShoppingBag, ThumbsUp } from 'lucide-react';
import { ORDER_STATUSES, PERMISSIONS, type OrderStatus } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useBulkOrderStatus, useSellerOrders } from '@/api/seller';
import { Seo } from '@/components/layout/Seo';
import { Button, Card, Checkbox, EmptyState, ErrorState, Input, LoadMore, SectionHeader, Skeleton } from '@/components/ui';
import { SellerOrderStatus } from '@/components/seller/OrderStatusBadge';
import { useCan } from '@/components/seller/usePermissions';
import { useDebounced } from '@/hooks/useDebounced';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime, money } from '@/lib/format';

/** Tabs always shown; other statuses appear only when they have orders. */
const MAIN: OrderStatus[] = ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

export default function OrdersPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const manage = can(PERMISSIONS.STORE_ORDERS_MANAGE);
  const [sp, setSp] = useSearchParams();
  const status = (sp.get('status') as OrderStatus | null) ?? undefined;
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const list = useSellerOrders({
    status,
    q: dq || undefined,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
  });
  const bulk = useBulkOrderStatus();
  const [selected, setSelected] = useState<string[]>([]);
  const orders = list.data?.pages.flatMap((p) => p.data) ?? [];
  const counts = list.data?.pages[0]?.meta?.counts ?? {};
  const tabs = ORDER_STATUSES.filter((s) => MAIN.includes(s) || (counts[s] ?? 0) > 0 || s === status);
  const bulkTo: 'confirmed' | 'packed' | null = status === 'placed' ? 'confirmed' : status === 'confirmed' ? 'packed' : null;

  const setStatus = (s?: string) => {
    const n = new URLSearchParams(sp);
    if (s) n.set('status', s);
    else n.delete('status');
    setSp(n, { replace: true });
    setSelected([]);
  };

  function runBulk() {
    if (!bulkTo) return;
    bulk.mutate(
      { ids: selected, to: bulkTo },
      {
        onSuccess: (r) => {
          const failed = r.results.filter((x) => !x.ok).length;
          toast.success(t('seller.orders.bulkDone', { count: r.updated }));
          if (failed) toast.error(t('seller.orders.bulkFailed', { count: failed }));
          setSelected([]);
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  }

  return (
    <>
      <Seo title={t('seller.nav.orders')} noindex />
      <SectionHeader as="h1" title={t('seller.nav.orders')} description={t('seller.orders.subtitle')} />
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 border-b border-border" role="tablist">
          {[undefined, ...tabs].map((s) => (
            <button
              key={s ?? 'all'}
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                '-mb-px flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold',
                status === s ? 'border-primary text-primary-800' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {s ? t(`seller.orderStatus.${s}`) : t('seller.common.all')}
              <span className={cn('rounded-pill px-1.5 text-[11px]', s === 'placed' && counts.placed ? 'bg-accent text-ink-900' : 'bg-surface-2')}>
                {counts[s ?? 'all'] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-72">
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('seller.orders.search')}
            aria-label={t('seller.orders.search')}
            startIcon={<Search className="size-4" />}
          />
        </div>
        <label className="grid gap-1 text-xs font-semibold text-fg-muted">
          {t('seller.orders.from')}
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-11 w-40" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-fg-muted">
          {t('seller.orders.to')}
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-11 w-40" />
        </label>
        {(from || to) && (
          <Button variant="ghost" size="sm" onClick={() => (setFrom(''), setTo(''))}>
            {t('seller.common.clear')}
          </Button>
        )}
      </div>
      {manage && bulkTo && selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-primary-50 px-3 py-2 text-sm">
          <span className="font-semibold text-primary-800">{t('seller.common.selected', { count: selected.length })}</span>
          <Button
            size="sm"
            loading={bulk.isPending}
            leftIcon={bulkTo === 'confirmed' ? <ThumbsUp className="size-4" /> : <PackageCheck className="size-4" />}
            onClick={runBulk}
          >
            {t(`seller.orders.bulk.${bulkTo}`)}
          </Button>
        </div>
      )}

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !orders.length ? (
        <Card>
          <EmptyState
            icon={<ShoppingBag />}
            title={status || dq || from || to ? t('seller.orders.noMatch') : t('seller.orders.empty')}
            description={t('seller.orders.emptyBody')}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {manage && bulkTo && (
            <div className="border-b border-border px-4 py-2.5">
              <Checkbox
                checked={orders.every((o) => selected.includes(o.id))}
                onChange={(e) => setSelected(e.target.checked ? orders.map((o) => o.id) : [])}
                label={t('seller.common.selectAll')}
              />
            </div>
          )}
          <ul className="divide-y divide-border">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                {manage && bulkTo && (
                  <Checkbox
                    checked={selected.includes(o.id)}
                    onChange={() => setSelected((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))}
                    aria-label={o.number}
                  />
                )}
                <div className="hidden size-12 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:block">
                  {o.items[0]?.image && <img src={o.items[0].image} alt="" className="size-full object-cover" loading="lazy" />}
                </div>
                <Link to={`/seller/orders/${o.id}`} className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-fg hover:text-primary-700" dir="ltr">
                      {o.number}
                    </span>
                    <SellerOrderStatus status={o.status} />
                    {o.payment.method === 'cod' && <span className="text-[11px] font-semibold text-fg-muted">{t('seller.orders.cod')}</span>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">
                    {o.buyer?.name ?? '—'} ·{' '}
                    {t('seller.orders.items', {
                      count: o.items.reduce((s, i) => s + i.qty, 0),
                    })}{' '}
                    · {formatDateTime(o.createdAt, lang)}
                  </p>
                </Link>
                <span className="text-end text-sm font-bold text-fg" dir="ltr">
                  {money(o.total)}
                </span>
              </li>
            ))}
          </ul>
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} />
        </Card>
      )}
    </>
  );
}
