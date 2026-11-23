import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Crown, Star, Store } from 'lucide-react';
import { STORE_PLANS, STORE_STATUSES } from '@souqly/shared';
import { useAdminGet, useAdminList, type AdminDashboard, type AdminStoreRow } from '@/api/admin';
import { CsvButton } from '@/components/admin/CsvButton';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { Avatar, Badge } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useLang } from '@/lib/catalog';
import { formatDate } from '@/lib/format';

export default function StoresPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const nav = useNavigate();
  const [f, setF] = useUrlFilters(['status', 'tab', 'mall', 'plan'] as const);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const mallTab = f.tab === 'mall';
  const params = { q: dq, status: f.status, mall: f.mall, plan: f.plan };
  const list = useAdminList<AdminStoreRow>('stores', params, { enabled: !mallTab });
  const mall = useAdminGet<AdminStoreRow[]>('mall-requests', undefined, { enabled: mallTab });
  const dash = useAdminGet<AdminDashboard>('dashboard');
  const rows = mallTab ? (mall.data ?? []) : (list.data?.pages.flatMap((p) => p.data) ?? []);

  const columns: Column<AdminStoreRow>[] = [
    {
      key: 'store',
      header: t('admin.stores.store'),
      cell: (s) => (
        <div className="flex items-center gap-3">
          <Avatar src={s.logo} name={s.name} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-semibold text-fg">
              {s.name}
              {s.isMall && <Crown className="size-3.5 text-accent-600" aria-label={t('admin.stores.mall')} />}
            </p>
            <p className="truncate text-xs text-fg-muted" dir="ltr">
              /store/{s.slug}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'status', header: t('admin.common.status'), cell: (s) => <StatusPill status={s.status} /> },
    { key: 'plan', header: t('admin.stores.plan'), cell: (s) => <Badge size="sm">{t(`admin.plans.${s.plan}`)}</Badge> },
    { key: 'products', header: t('admin.stores.products'), align: 'end', cell: (s) => <span className="tabular">{s.productCount}</span> },
    {
      key: 'rating',
      header: t('admin.stores.rating'),
      align: 'end',
      cell: (s) => (
        <span className="inline-flex items-center gap-1 tabular">
          <Star className="size-3.5 fill-accent text-accent" />
          {s.ratingAvg ? s.ratingAvg.toFixed(1) : '—'}
        </span>
      ),
    },
    { key: 'created', header: t('admin.stores.created'), cell: (s) => <span className="text-fg-muted">{formatDate(s.createdAt, lang)}</span> },
  ];

  return (
    <>
      <PageHeader title={t('admin.nav.stores')} description={t('admin.stores.subtitle')} actions={!mallTab && <CsvButton path="stores" params={params} />} />
      <StatusTabs
        value={mallTab ? 'mall' : f.status}
        onChange={(v) => setF(v === 'mall' ? { tab: 'mall', status: '' } : { tab: '', status: v })}
        tabs={[
          { value: '', label: t('admin.common.all') },
          ...STORE_STATUSES.map((s) => ({ value: s, label: t(`admin.status.${s}`), count: s === 'pending' ? dash.data?.pending.stores : undefined })),
          { value: 'mall', label: t('admin.stores.mallRequests'), count: dash.data?.pending.mallRequests },
        ]}
      />
      {!mallTab && (
        <FilterBar q={q} onQ={setQ} placeholder={t('admin.stores.search')}>
          <FilterSelect
            value={f.mall}
            onChange={(mall) => setF({ mall })}
            allLabel={t('admin.stores.anyMall')}
            options={[
              { value: 'true', label: t('admin.stores.mallOnly') },
              { value: 'false', label: t('admin.stores.nonMall') },
            ]}
          />
          <FilterSelect value={f.plan} onChange={(plan) => setF({ plan })} allLabel={t('admin.stores.anyPlan')} options={STORE_PLANS.map((p) => ({ value: p, label: t(`admin.plans.${p}`) }))} />
        </FilterBar>
      )}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(s) => s.id}
        isLoading={mallTab ? mall.isLoading : list.isLoading}
        error={mallTab ? mall.error : list.error}
        onRetry={() => void (mallTab ? mall.refetch() : list.refetch())}
        hasMore={!mallTab && list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={mallTab ? undefined : () => void list.fetchNextPage()}
        onRowClick={(s) => nav(`/admin/stores/${s.id}`)}
        empty={{ title: mallTab ? t('admin.stores.noMallRequests') : t('admin.stores.empty'), icon: <Store /> }}
      />
    </>
  );
}
