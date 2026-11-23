import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { PLATFORM_ROLES } from '@souqly/shared';
import { useAdminList, type AdminUserRow } from '@/api/admin';
import { CsvButton } from '@/components/admin/CsvButton';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { Avatar, Badge } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useLang } from '@/lib/catalog';
import { formatDate, formatRelative, money } from '@/lib/format';

export default function UsersPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const nav = useNavigate();
  const [f, setF] = useUrlFilters(['role', 'status', 'seller'] as const);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const params = { q: dq, role: f.role, status: f.status, seller: f.seller };
  const list = useAdminList<AdminUserRow>('users', params);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'user',
      header: t('admin.users.user'),
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{u.name}</p>
            <p className="truncate text-xs text-fg-muted" dir="ltr">
              {u.email ?? u.phone ?? '—'}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: t('admin.users.role'), cell: (u) => (u.platformRole ? <Badge tone="primary" size="sm">{t(`admin.roles.${u.platformRole}`)}</Badge> : <span className="text-fg-subtle">—</span>) },
    { key: 'status', header: t('admin.common.status'), cell: (u) => <StatusPill status={u.status} /> },
    { key: 'seller', header: t('admin.users.seller'), cell: (u) => (u.isSeller ? <Badge tone="accent" size="sm">{t('admin.users.sellerYes')}</Badge> : <span className="text-fg-subtle">—</span>) },
    { key: 'wallet', header: t('admin.users.wallet'), align: 'end', cell: (u) => <span dir="ltr" className="tabular">{money(u.walletBalance)}</span> },
    { key: 'joined', header: t('admin.users.joined'), cell: (u) => <span className="text-fg-muted">{formatDate(u.createdAt, lang)}</span> },
    { key: 'last', header: t('admin.users.lastLogin'), cell: (u) => <span className="text-fg-muted">{u.lastLoginAt ? formatRelative(u.lastLoginAt, lang) : '—'}</span> },
  ];

  return (
    <>
      <PageHeader title={t('admin.nav.users')} description={t('admin.users.subtitle')} actions={<CsvButton path="users" params={params} />} />
      <FilterBar q={q} onQ={setQ} placeholder={t('admin.users.search')}>
        <FilterSelect
          value={f.role}
          onChange={(role) => setF({ role })}
          allLabel={t('admin.users.allRoles')}
          options={[...PLATFORM_ROLES.map((r) => ({ value: r, label: t(`admin.roles.${r}`) })), { value: 'none', label: t('admin.users.noRole') }]}
        />
        <FilterSelect
          value={f.status}
          onChange={(status) => setF({ status })}
          allLabel={t('admin.common.allStatuses')}
          options={(['active', 'blocked', 'deleted'] as const).map((s) => ({ value: s, label: t(`admin.status.${s}`) }))}
        />
        <FilterSelect
          value={f.seller}
          onChange={(seller) => setF({ seller })}
          allLabel={t('admin.users.anyone')}
          options={[
            { value: 'true', label: t('admin.users.sellersOnly') },
            { value: 'false', label: t('admin.users.buyersOnly') },
          ]}
        />
      </FilterBar>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(u) => u.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        onRowClick={(u) => nav(`/admin/users/${u.id}`)}
        empty={{ title: t('admin.users.empty'), icon: <Users /> }}
      />
    </>
  );
}
