import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Gift, Plus } from 'lucide-react';
import { adminGiftCardCreateSchema, PERMISSIONS } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type AdminGiftCard } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { Alert, Button, FormField, IconButton, Input, Modal } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';

export default function GiftCardsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useAdminCan();
  const q = useAdminGet<AdminGiftCard[]>('gift-cards');
  const [open, setOpen] = useState(false);
  const copy = (code: string) => void navigator.clipboard?.writeText(code).then(() => toast.success(t('common.copied')));

  const columns: Column<AdminGiftCard>[] = [
    {
      key: 'code',
      header: t('admin.marketing.code'),
      cell: (g) => (
        <span className="inline-flex items-center gap-1">
          <span className="latin rounded bg-surface-2 px-2 py-1 font-mono text-xs font-bold">{g.code}</span>
          <IconButton size="sm" variant="ghost" label={t('common.copy')} onClick={() => copy(g.code)}>
            <Copy className="size-3.5" />
          </IconButton>
        </span>
      ),
    },
    { key: 'amount', header: t('admin.marketing.amount'), align: 'end', cell: (g) => <span dir="ltr">{money(g.amount)}</span> },
    { key: 'balance', header: t('admin.marketing.balance'), align: 'end', cell: (g) => <span className="font-semibold" dir="ltr">{money(g.balance)}</span> },
    { key: 'exp', header: t('admin.marketing.expires'), cell: (g) => <span className="text-fg-muted">{g.expiresAt ? formatDate(g.expiresAt, lang) : t('admin.marketing.never')}</span> },
    { key: 'red', header: t('admin.marketing.redeemed'), cell: (g) => <span className="text-fg-muted">{g.redeemedBy ? t('admin.common.yes') : '—'}</span> },
  ];

  return (
    <>
      <PageHeader
        title={t('admin.nav.giftCards')}
        description={t('admin.marketing.giftSub')}
        crumbs={[{ label: t('admin.nav.marketing') }]}
        actions={
          can(PERMISSIONS.ADMIN_FINANCE_MANAGE) && (
            <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
              {t('admin.marketing.issueCard')}
            </Button>
          )
        }
      />
      <DataTable rows={q.data ?? []} columns={columns} rowKey={(g) => g.id} isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={{ title: t('admin.marketing.noCards'), icon: <Gift /> }} />
      {open && <IssueCard onClose={() => setOpen(false)} />}
    </>
  );
}

function IssueCard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const create = useAdminMutation<unknown, AdminGiftCard>('post', ['gift-cards']);
  const [amount, setAmount] = useState('1000');
  const [code, setCode] = useState('');
  const [expires, setExpires] = useState('');
  const [error, setError] = useState<string | null>(null);
  function save() {
    const parsed = adminGiftCardCreateSchema.safeParse({ amount: Math.round(Number(amount) * 100), code: code.trim() || undefined, expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : undefined });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? null);
    create.mutate({ path: 'gift-cards', body: parsed.data }, { onSuccess: (g) => (toast.success(t('admin.marketing.cardIssued', { code: g.code })), onClose()), onError: (e) => toast.error(getErrorMessage(e)) });
  }
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.marketing.issueCard')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={create.isPending} onClick={save}>
            {t('admin.marketing.issue')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label={t('admin.users.amountRs')} required>
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label={t('admin.marketing.code')} hint={t('admin.marketing.codeAuto')}>
          <Input dir="ltr" className="uppercase" value={code} onChange={(e) => setCode(e.target.value)} />
        </FormField>
        <FormField label={t('admin.marketing.expires')}>
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
