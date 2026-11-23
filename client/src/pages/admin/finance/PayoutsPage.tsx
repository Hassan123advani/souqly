import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Banknote, Check, CircleDollarSign, X } from 'lucide-react';
import { PERMISSIONS } from '@souqly/shared';
import { useAdminList, useAdminMutation, type AdminPayout } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { CsvButton } from '@/components/admin/CsvButton';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { Button, FormField, Input } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDateTime, money } from '@/lib/format';

type Act = { kind: 'approve' | 'mark-paid' | 'reject'; payout: AdminPayout };

export default function PayoutsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useAdminCan();
  const manage = can(PERMISSIONS.ADMIN_FINANCE_MANAGE);
  const [f, setF] = useUrlFilters(['status'] as const);
  const status = f.status === 'all' ? undefined : f.status || 'requested';
  const list = useAdminList<AdminPayout>('payouts', { status });
  const post = useAdminMutation('post', ['payouts']);
  const [act, setAct] = useState<Act | null>(null);
  const [reference, setReference] = useState('');
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const columns: Column<AdminPayout>[] = [
    {
      key: 'store',
      header: t('admin.stores.store'),
      cell: (p) => (
        <Link to={`/admin/stores/${p.storeId}`} className="font-semibold text-fg hover:text-primary-700">
          {p.storeName ?? p.storeId.slice(-6)}
        </Link>
      ),
    },
    { key: 'amount', header: t('admin.marketing.amount'), align: 'end', cell: (p) => <span className="font-bold tabular" dir="ltr">{money(p.amount)}</span> },
    { key: 'method', header: t('admin.finance.method'), cell: (p) => <span className="text-xs text-fg-muted">{Object.values(p.method).filter(Boolean).slice(0, 2).join(' · ') || '—'}</span> },
    { key: 'status', header: t('admin.common.status'), cell: (p) => <StatusPill status={p.status} /> },
    { key: 'req', header: t('admin.finance.requested'), cell: (p) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(p.createdAt, lang)}</span> },
    { key: 'ref', header: t('admin.finance.reference'), cell: (p) => <span className="latin font-mono text-xs">{p.reference ?? (p.notes ? <span className="font-sans text-fg-muted">{p.notes}</span> : '—')}</span> },
    {
      key: 'a',
      header: '',
      align: 'end',
      cell: (p) =>
        manage && (
          <div className="flex justify-end gap-1">
            {p.status === 'requested' && (
              <Button size="sm" variant="outline" leftIcon={<Check className="size-4" />} onClick={() => setAct({ kind: 'approve', payout: p })}>
                {t('admin.finance.approve')}
              </Button>
            )}
            {p.status === 'approved' && (
              <Button size="sm" leftIcon={<CircleDollarSign className="size-4" />} onClick={() => (setReference(''), setAct({ kind: 'mark-paid', payout: p }))}>
                {t('admin.finance.markPaid')}
              </Button>
            )}
            {(p.status === 'requested' || p.status === 'approved') && (
              <Button size="sm" variant="ghost" leftIcon={<X className="size-4" />} onClick={() => setAct({ kind: 'reject', payout: p })}>
                {t('admin.finance.reject')}
              </Button>
            )}
          </div>
        ),
    },
  ];

  function confirm(notes: string) {
    if (!act) return;
    if (act.kind === 'mark-paid' && reference.trim().length < 2) return void toast.error(t('admin.finance.referenceRequired'));
    const body = act.kind === 'reject' ? { notes } : act.kind === 'mark-paid' ? { reference: reference.trim(), ...(notes ? { notes } : {}) } : undefined;
    post.mutate({ path: `payouts/${act.payout.id}/${act.kind}`, body }, { onSuccess: () => (toast.success(t('admin.common.saved')), setAct(null)), onError: (e) => toast.error(getErrorMessage(e)) });
  }

  return (
    <>
      <PageHeader title={t('admin.nav.payouts')} description={t('admin.finance.payoutsSub')} crumbs={[{ label: t('admin.nav.finance') }]} actions={<CsvButton path="payouts" params={{ status }} />} />
      <StatusTabs
        value={f.status || 'requested'}
        onChange={(v) => setF({ status: v === 'requested' ? '' : v })}
        tabs={[...(['requested', 'approved', 'paid', 'rejected'] as const).map((s) => ({ value: s, label: t(`admin.status.${s}`) })), { value: 'all', label: t('admin.common.all') }]}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        empty={{ title: t('admin.finance.noPayouts'), icon: <Banknote /> }}
      />
      {act && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAct(null)}
          title={t(`admin.finance.dlg.${act.kind}`, { amount: money(act.payout.amount), store: act.payout.storeName ?? '' })}
          confirmLabel={act.kind === 'approve' ? t('admin.finance.approve') : act.kind === 'mark-paid' ? t('admin.finance.markPaid') : t('admin.finance.reject')}
          tone={act.kind === 'reject' ? 'danger' : 'primary'}
          reasonLabel={act.kind === 'approve' ? undefined : act.kind === 'reject' ? t('admin.common.reason') : t('admin.finance.notesOptional')}
          reasonRequired={act.kind === 'reject'}
          loading={post.isPending}
          onConfirm={confirm}
        >
          {act.kind === 'mark-paid' && (
            <FormField label={t('admin.finance.reference')} required>
              <Input dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="TRX-…" autoFocus />
            </FormField>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
