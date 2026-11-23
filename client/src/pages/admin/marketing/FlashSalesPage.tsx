import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { adminFlashSaleSchema } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type AdminFlashSale } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { fromLocalInput, toLocalInput, windowState } from '@/components/admin/dates';
import { PageHeader } from '@/components/admin/PageHeader';
import { ProductPicker } from '@/components/admin/ProductPicker';
import { StatusPill } from '@/components/admin/StatusPill';
import { Alert, Button, FormField, IconButton, Input, Modal, Switch } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDateTime, money } from '@/lib/format';

export default function FlashSalesPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useAdminGet<AdminFlashSale[]>('flash-sales');
  const del = useAdminMutation('delete', ['flash-sales']);
  const [edit, setEdit] = useState<AdminFlashSale | 'new' | null>(null);
  const [remove, setRemove] = useState<AdminFlashSale | null>(null);

  const columns: Column<AdminFlashSale>[] = [
    { key: 'title', header: t('admin.marketing.slot'), cell: (s) => <span className="font-semibold text-fg">{s.title}</span> },
    { key: 'state', header: t('admin.common.status'), cell: (s) => <StatusPill status={s.isActive ? windowState(s.startsAt, s.endsAt) : 'inactive'} /> },
    { key: 'window', header: t('admin.marketing.window'), cell: (s) => <span className="whitespace-nowrap text-xs text-fg-muted">{formatDateTime(s.startsAt, lang)} → {formatDateTime(s.endsAt, lang)}</span> },
    { key: 'items', header: t('admin.marketing.items'), align: 'end', cell: (s) => <span className="tabular">{s.items.length}</span> },
    { key: 'sold', header: t('admin.marketing.sold'), align: 'end', cell: (s) => <span className="tabular">{s.items.reduce((n, i) => n + (i.sold ?? 0), 0)}</span> },
    {
      key: 'a',
      header: '',
      align: 'end',
      cell: (s) => (
        <div className="flex justify-end">
          <IconButton size="sm" variant="ghost" label={t('common.edit')} onClick={() => setEdit(s)}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => setRemove(s)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('admin.nav.flashSales')}
        description={t('admin.marketing.flashSub')}
        crumbs={[{ label: t('admin.nav.marketing') }]}
        actions={
          <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setEdit('new')}>
            {t('admin.marketing.newSlot')}
          </Button>
        }
      />
      <DataTable rows={q.data ?? []} columns={columns} rowKey={(s) => s.id} isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={{ title: t('admin.marketing.noSlots'), icon: <Zap /> }} />
      {edit && <FlashForm sale={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {remove && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemove(null)}
          title={t('admin.marketing.deleteTitle', { name: remove.title })}
          confirmLabel={t('common.delete')}
          tone="danger"
          loading={del.isPending}
          onConfirm={() => del.mutate({ path: `flash-sales/${remove.id}` }, { onSuccess: () => (toast.success(t('admin.common.deleted')), setRemove(null)), onError: (e) => toast.error(getErrorMessage(e)) })}
        />
      )}
    </>
  );
}

type Item = { productId: string; variantId?: string; flashPrice: string; quantityLimit: string; label: string; image?: string; regular?: number; sold?: number };

function FlashForm({ sale, onClose }: { sale?: AdminFlashSale; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useAdminMutation('post', ['flash-sales']);
  const put = useAdminMutation('put', ['flash-sales']);
  const [title, setTitle] = useState(sale?.title ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(sale?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(sale?.endsAt));
  const [isActive, setActive] = useState(sale?.isActive ?? true);
  const [items, setItems] = useState<Item[]>(
    () => sale?.items.map((i) => ({ productId: i.productId, variantId: i.variantId, flashPrice: String(i.flashPrice / 100), quantityLimit: String(i.quantityLimit), label: `#${i.productId.slice(-6)}`, sold: i.sold })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const setItem = (i: number, p: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  function save() {
    const parsed = adminFlashSaleSchema.safeParse({
      title,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      isActive,
      items: items.map((i) => ({ productId: i.productId, ...(i.variantId ? { variantId: i.variantId } : {}), flashPrice: Math.round(Number(i.flashPrice) * 100), quantityLimit: Number(i.quantityLimit) || 1 })),
    });
    if (!parsed.success) return setError(parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`)[0] ?? null);
    setError(null);
    const opts = { onSuccess: () => (toast.success(t('admin.common.saved')), onClose()), onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (sale) put.mutate({ path: `flash-sales/${sale.id}`, body: parsed.data }, opts);
    else create.mutate({ path: 'flash-sales', body: parsed.data }, opts);
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={sale ? t('admin.marketing.editSlot') : t('admin.marketing.newSlot')}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={create.isPending || put.isPending} onClick={save}>
            {t('admin.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t('admin.marketing.slot')} required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label={t('admin.marketing.starts')} required>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </FormField>
          <FormField label={t('admin.marketing.ends')} required>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </FormField>
        </div>
        <Switch checked={isActive} onCheckedChange={setActive} label={t('admin.marketing.activeSlot')} />
        <div>
          <p className="mb-2 text-sm font-bold text-fg">{t('admin.marketing.items')}</p>
          <ProductPicker
            exclude={items.map((i) => i.productId)}
            onPick={(p) => setItems((xs) => [...xs, { productId: p.id, flashPrice: String(Math.floor((p.price * 0.8) / 100)), quantityLimit: '100', label: p.title, image: p.image, regular: p.price }])}
          />
          {!items.length ? (
            <p className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-fg-muted">{t('admin.marketing.noItems')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-md border border-border">
              {items.map((it, i) => (
                <li key={it.productId} className="flex flex-wrap items-center gap-3 p-2.5">
                  <span className="size-10 shrink-0 overflow-hidden rounded bg-surface-2">{it.image && <img src={it.image} alt="" className="size-full object-cover" />}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-semibold">{it.label}</p>
                    <p className="text-xs text-fg-muted">
                      {it.regular !== undefined && <span dir="ltr">{t('admin.marketing.regular')}: {money(it.regular)}</span>}
                      {it.sold !== undefined && <span> · {t('admin.marketing.soldN', { count: it.sold })}</span>}
                    </p>
                  </div>
                  <label className="grid gap-0.5 text-[11px] font-semibold text-fg-muted">
                    {t('admin.marketing.flashPrice')}
                    <Input type="number" min={0} value={it.flashPrice} onChange={(e) => setItem(i, { flashPrice: e.target.value })} className="h-9 w-28" />
                  </label>
                  <label className="grid gap-0.5 text-[11px] font-semibold text-fg-muted">
                    {t('admin.marketing.limit')}
                    <Input type="number" min={1} value={it.quantityLimit} onChange={(e) => setItem(i, { quantityLimit: e.target.value })} className="h-9 w-24" />
                  </label>
                  <IconButton size="sm" variant="ghost" label={t('admin.common.remove')} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
