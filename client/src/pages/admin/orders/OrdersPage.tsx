import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingBag } from 'lucide-react';
import { ORDER_STATUSES } from '@souqly/shared';
import { useAdminList, type AdminOrderRow } from '@/api/admin';
import { CsvButton } from '@/components/admin/CsvButton';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { Button, Input } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useLang } from '@/lib/catalog';
import { formatDateTime, money } from '@/lib/format';

export default function OrdersPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const nav = useNavigate();
  const [f, setF] = useUrlFilters(['status', 'storeId', 'from', 'to'] as const);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const params = {
    q: dq,
    status: f.status,
    storeId: f.storeId,
    from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : undefined,
    to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : undefined,
  };
  const list = useAdminList<AdminOrderRow>('orders', params);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const columns: Column<AdminOrderRow>[] = [
    { key: 'number', header: t('admin.orders.number'), cell: (o) => <span className="font-bold text-fg" dir="ltr">{o.number}</span> },
    { key: 'store', header: t('admin.stores.store'), cell: (o) => <span className="truncate">{o.store.name}</span> },
    { key: 'buyer', header: t('admin.orders.buyer'), cell: (o) => <span className="text-fg-muted">{o.buyer?.name ?? '—'}</span> },
    { key: 'status', header: t('admin.common.status'), cell: (o) => <StatusPill status={o.status} /> },
    { key: 'payment', header: t('admin.orders.payment'), cell: (o) => <span className="text-xs font-semibold uppercase text-fg-muted">{o.payment.method} · {o.payment.status}</span> },
    { key: 'total', header: t('admin.orders.total'), align: 'end', cell: (o) => <span className="font-semibold tabular" dir="ltr">{money(o.total)}</span> },
    { key: 'date', header: t('admin.orders.placed'), cell: (o) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(o.createdAt, lang)}</span> },
  ];

  return (
    <>
      <PageHeader title={t('admin.nav.orders')} description={t('admin.orders.subtitle')} actions={<CsvButton path="orders" params={params} />} />
      <FilterBar q={q} onQ={setQ} placeholder={t('admin.orders.search')}>
        <FilterSelect value={f.status} onChange={(status) => setF({ status })} allLabel={t('admin.common.allStatuses')} options={ORDER_STATUSES.map((s) => ({ value: s, label: t(`admin.status.${s}`) }))} />
        <Input type="date" value={f.from} max={f.to || undefined} onChange={(e) => setF({ from: e.target.value })} className="w-40" aria-label={t('admin.common.from')} />
        <Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => setF({ to: e.target.value })} className="w-40" aria-label={t('admin.common.to')} />
        {(f.from || f.to || f.storeId) && (
          <Button variant="ghost" size="sm" onClick={() => setF({ from: '', to: '', storeId: '' })}>
            {t('admin.common.clear')}
          </Button>
        )}
      </FilterBar>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(o) => o.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        onRowClick={(o) => nav(`/admin/orders/${o.id}`)}
        empty={{ title: t('admin.orders.empty'), icon: <ShoppingBag /> }}
      />
    </>
  );
}
