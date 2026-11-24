import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, ListChecks, X } from 'lucide-react';
import { PERMISSIONS } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type AdminCampaign, type AdminStoreRow } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { Badge, Button, FormField, Input, Modal, type BadgeTone } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDateTime, money } from '@/lib/format';

type NominationStatus = 'pending' | 'approved' | 'rejected';
/** `GET /admin/campaigns` returns the raw nominations sub-documents. */
type RawNomination = { _id: string; storeId: string; productId: string; campaignPrice: number; status: NominationStatus; note?: string; createdAt: string };
type Row = RawNomination & { campaign: { id: string; name: string; slug: string; endsAt: string } };

const TONE: Record<NominationStatus, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'danger' };

function StoreName({ id }: { id: string }) {
  const q = useAdminGet<AdminStoreRow>(`stores/${id}`);
  return (
    <Link to={`/admin/stores/${id}`} className="font-semibold text-fg hover:text-primary-700">
      {q.data?.name ?? id.slice(-6)}
    </Link>
  );
}

/** Seller nominations for platform campaigns: approve adds the product to the campaign. */
export default function NominationsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useAdminCan();
  const [status, setStatus] = useState<NominationStatus | ''>('pending');
  const [reviewing, setReviewing] = useState<{ row: Row; status: 'approved' | 'rejected' } | null>(null);
  const q = useAdminGet<(AdminCampaign & { nominations?: RawNomination[] })[]>('campaigns', { limit: 200 }, { enabled: can(PERMISSIONS.ADMIN_MARKETING_MANAGE) });
  const rows: Row[] = (q.data ?? [])
    .flatMap((c) => (c.nominations ?? []).map((n) => ({ ...n, campaign: { id: c.id, name: c.name, slug: c.slug, endsAt: c.endsAt } })))
    .filter((r) => !status || r.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const columns: Column<Row>[] = [
    {
      key: 'campaign',
      header: t('growth.admin.campaign'),
      cell: (r) => (
        <div>
          <p className="font-semibold text-fg">{r.campaign.name}</p>
          <p className="text-xs text-fg-muted">{formatDateTime(r.createdAt, lang)}</p>
        </div>
      ),
    },
    { key: 'store', header: t('growth.admin.store'), cell: (r) => <StoreName id={r.storeId} /> },
    {
      key: 'product',
      header: t('growth.admin.product'),
      cell: (r) => (
        <span className="font-mono text-xs text-fg-muted" dir="ltr" title={r.productId}>
          {r.productId}
        </span>
      ),
    },
    { key: 'price', header: t('growth.admin.price'), align: 'end', cell: (r) => <span dir="ltr">{money(r.campaignPrice)}</span> },
    { key: 'status', header: t('growth.admin.status'), cell: (r) => <Badge tone={TONE[r.status]} size="sm">{t(`growth.campaigns.status.${r.status}`)}</Badge> },
    {
      key: 'actions',
      header: '',
      align: 'end',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {r.status !== 'approved' && (
            <Button size="sm" variant="outline" leftIcon={<Check className="size-4" />} onClick={() => setReviewing({ row: r, status: 'approved' })}>
              {t('growth.admin.approve')}
            </Button>
          )}
          {r.status !== 'rejected' && (
            <Button size="sm" variant="ghost" leftIcon={<X className="size-4" />} onClick={() => setReviewing({ row: r, status: 'rejected' })}>
              {t('growth.admin.reject')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('growth.admin.nominationsTitle')}
        description={t('growth.admin.nominationsHint')}
        crumbs={[{ label: t('admin.nav.campaigns'), to: '/admin/marketing/campaigns' }]}
        actions={
          <FilterSelect
            value={status}
            onChange={(v) => setStatus(v as NominationStatus | '')}
            allLabel={t('growth.admin.all')}
            label={t('growth.admin.status')}
            options={(['pending', 'approved', 'rejected'] as const).map((s) => ({ value: s, label: t(`growth.campaigns.status.${s}`) }))}
          />
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r._id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty={{ title: t('growth.admin.noNominations'), icon: <ListChecks /> }}
      />
      <ReviewDialog value={reviewing} onClose={() => setReviewing(null)} />
    </>
  );
}

function ReviewDialog({ value, onClose }: { value: { row: Row; status: 'approved' | 'rejected' } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const mut = useAdminMutation<{ status: string; note?: string }>('patch', ['campaigns']);
  const submit = () => {
    if (!value) return;
    mut.mutate(
      { path: `campaigns/${value.row.campaign.id}/nominations/${value.row._id}`, body: { status: value.status, ...(note.trim() ? { note: note.trim() } : {}) } },
      {
        onSuccess: () => {
          toast.success(t(value.status === 'approved' ? 'growth.admin.approved' : 'growth.admin.rejected'));
          setNote('');
          onClose();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };
  return (
    <Modal
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={value?.status === 'approved' ? t('growth.admin.approve') : t('growth.admin.reject')}
      description={value ? `${value.row.campaign.name} · ${money(value.row.campaignPrice)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant={value?.status === 'rejected' ? 'danger' : 'primary'} loading={mut.isPending} onClick={submit}>
            {value?.status === 'approved' ? t('growth.admin.approve') : t('growth.admin.reject')}
          </Button>
        </>
      }
    >
      <FormField label={t('growth.admin.note')} hint={t('growth.admin.noteHint')}>
        <Input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </FormField>
    </Modal>
  );
}
