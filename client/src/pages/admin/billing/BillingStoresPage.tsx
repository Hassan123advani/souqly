import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Store } from 'lucide-react';
import { STORE_PLANS } from '@souqly/shared';
import { useAdminList } from '@/api/admin';
import type { AdminBillingStoreRow } from '@/api/billing';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { BillingBadge, PlanBadge, usePlanName } from '@/components/billing/BillingBadge';
import { useDebounced } from '@/hooks/useDebounced';
import { useLang } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';

export default function BillingStoresPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const planName = usePlanName();
  const [f, setF] = useUrlFilters(['plan', 'billingStatus'] as const);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const list = useAdminList<AdminBillingStoreRow>('billing/stores', { q: dq, plan: f.plan, billingStatus: f.billingStatus });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const columns: Column<AdminBillingStoreRow>[] = [
    {
      key: 'store',
      header: t('admin.stores.store'),
      cell: (s) => (
        <Link to={`/admin/billing/stores/${s.id}`} className="font-semibold text-fg hover:text-primary-700" onClick={(e) => e.stopPropagation()}>
          {s.name}
          <span className="latin block text-xs font-normal text-fg-muted">/{s.slug}</span>
        </Link>
      ),
    },
    { key: 'plan', header: t('billing.invoice.plan'), cell: (s) => <PlanBadge plan={s.plan} /> },
    {
      key: 'billing',
      header: t('billing.admin.stores.billingStatus'),
      cell: (s) => (
        <div>
          <BillingBadge status={s.billingStatus} />
          {s.suspensionReason && <p className="mt-0.5 text-xs text-fg-muted">{t(`billing.suspensionReason.${s.suspensionReason}`)}</p>}
        </div>
      ),
    },
    {
      key: 'period',
      header: t('billing.admin.stores.periodEnd'),
      cell: (s) => (
        <div className="whitespace-nowrap text-fg-muted">
          {s.currentPeriodEnd ? formatDate(s.currentPeriodEnd, lang) : '—'}
          {s.scheduledChange && <p className="text-xs">{t('billing.admin.stores.scheduled', { plan: planName(s.scheduledChange.plan) })}</p>}
        </div>
      ),
    },
    { key: 'outstanding', header: t('billing.admin.stores.outstanding'), align: 'end', cell: (s) => <span className="tabular font-semibold" dir="ltr">{money(s.outstanding)}</span> },
    { key: 'overdue', header: t('billing.overview.overdue'), align: 'end', cell: (s) => <span className={`tabular ${s.overdue > 0 ? 'font-bold text-danger' : 'text-fg-muted'}`} dir="ltr">{money(s.overdue)}</span> },
    { key: 'unbilled', header: t('billing.admin.stores.unbilled'), align: 'end', cell: (s) => <span className="tabular text-fg-muted" dir="ltr">{money(s.unbilledCommission)}</span> },
  ];

  return (
    <>
      <PageHeader title={t('billing.admin.nav.stores')} description={t('billing.admin.stores.subtitle')} crumbs={[{ label: t('admin.nav.finance') }, { label: t('billing.admin.nav.overview'), to: '/admin/billing' }]} />
      <FilterBar q={q} onQ={setQ} placeholder={t('admin.stores.search')}>
        <FilterSelect label={t('billing.invoice.plan')} value={f.plan} onChange={(v) => setF({ plan: v })} allLabel={t('admin.stores.anyPlan')} options={STORE_PLANS.map((p) => ({ value: p, label: planName(p) }))} />
        <FilterSelect
          label={t('billing.admin.stores.billingStatus')}
          value={f.billingStatus}
          onChange={(v) => setF({ billingStatus: v })}
          allLabel={t('billing.common.all')}
          options={(['active', 'suspended'] as const).map((s) => ({ value: s, label: t(`billing.status.${s}`) }))}
        />
      </FilterBar>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(s) => s.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        onRowClick={(s) => navigate(`/admin/billing/stores/${s.id}`)}
        empty={{ title: t('billing.admin.stores.empty'), icon: <Store /> }}
      />
    </>
  );
}
