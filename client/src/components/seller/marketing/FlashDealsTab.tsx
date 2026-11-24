import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { sellerFlashDealSchema } from '@souqly/shared';
import { getErrorDetails, getErrorMessage } from '@/api/client';
import { useSellerProduct } from '@/api/seller';
import { useMarketingList, useSaveMarketing, type StoreFlashDeal } from '@/api/growth';
import { Alert, Button, Card, FormField, IconButton, Input, Modal, Select, Skeleton, Switch } from '@/components/ui';
import { money } from '@/lib/format';
import { ProductName, ProductSearchAdd } from '../growth/ProductPicker';
import { defaultWindow, firstIssue, fromLocalInput, minorToInput, rupeesToMinor, toLocalInput } from '../growth/utils';
import { DeleteMarketing, ListState, WindowBadge, WindowText, itemErrors } from './common';

const ALL = '*';

export function FlashDealsTab() {
  const { t } = useTranslation();
  const list = useMarketingList('flash-deals');
  const [editing, setEditing] = useState<StoreFlashDeal | 'new' | null>(null);
  const add = (
    <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
      {t('growth.deals.add')}
    </Button>
  );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{t('growth.deals.hint')}</p>
        {add}
      </div>
      <ListState query={list} empty={{ icon: <Zap />, title: t('growth.deals.empty'), description: t('growth.deals.emptyBody'), action: add }}>
        {(rows) => (
          <div className="grid gap-3">
            {rows.map((d) => (
              <Card key={d.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-fg">{d.title}</p>
                    <p className="text-xs text-fg-muted">
                      <WindowText startsAt={d.startsAt} endsAt={d.endsAt} />
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <WindowBadge {...d} />
                    <IconButton label={t('seller.common.edit')} size="sm" variant="ghost" onClick={() => setEditing(d)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <DeleteMarketing kind="flash-deals" id={d.id} name={d.title} />
                  </div>
                </div>
                <ul className="mt-3 divide-y divide-border rounded-md border border-border text-sm">
                  {d.items.map((i) => (
                    <li key={`${i.productId}:${i.variantId ?? ALL}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <ProductName id={i.productId} className="line-clamp-1 min-w-0 flex-1 text-fg" />
                      <span className="font-semibold text-sale" dir="ltr">
                        {money(i.price)}
                      </span>
                      <span className="text-xs text-fg-muted">{t('growth.deals.soldOf', { sold: i.sold, max: i.quantityLimit })}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </ListState>
      <DealDialog deal={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

type Item = { productId: string; variantId: string; price: string; quantityLimit: string };

function DealDialog({ deal, onClose }: { deal: StoreFlashDeal | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveMarketing('flash-deals');
  const d = deal && deal !== 'new' ? deal : null;
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [lastOpen, setLastOpen] = useState<typeof deal>(null);
  if (deal !== lastOpen) {
    setLastOpen(deal);
    const win = defaultWindow(3);
    setTitle(d?.title ?? '');
    setStartsAt(d ? toLocalInput(d.startsAt) : win.startsAt);
    setEndsAt(d ? toLocalInput(d.endsAt) : win.endsAt);
    setIsActive(d?.isActive ?? true);
    setItems(d?.items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? ALL, price: minorToInput(i.price), quantityLimit: String(i.quantityLimit) })) ?? []);
    setErrors([]);
  }
  const patchItem = (idx: number, p: Partial<Item>) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...p } : it)));

  const submit = () => {
    const body = {
      title: title.trim(),
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      isActive,
      items: items.map((i) => ({
        productId: i.productId,
        ...(i.variantId !== ALL ? { variantId: i.variantId } : {}),
        price: rupeesToMinor(i.price) ?? -1,
        quantityLimit: Number(i.quantityLimit) || 1,
      })),
    };
    const parsed = sellerFlashDealSchema.safeParse(body);
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    setErrors([]);
    save.mutate(
      { id: d?.id, body },
      {
        onSuccess: () => {
          toast.success(t('seller.common.saved'));
          onClose();
        },
        onError: (e) => {
          setErrors(itemErrors(getErrorDetails(e)));
          toast.error(getErrorMessage(e));
        },
      },
    );
  };

  return (
    <Modal
      open={!!deal}
      onOpenChange={(o) => !o && onClose()}
      size="xl"
      title={d ? t('growth.deals.edit') : t('growth.deals.add')}
      description={t('growth.deals.rules')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('seller.common.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!items.length}>
            {t('seller.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t('growth.deals.titleField')} required className="sm:col-span-3">
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label={t('growth.common.startsAt')} required>
            <Input type="datetime-local" dir="ltr" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </FormField>
          <FormField label={t('growth.common.endsAt')} required>
            <Input type="datetime-local" dir="ltr" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </FormField>
          <div className="flex items-end pb-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} label={t('growth.common.active')} />
          </div>
        </div>
        {errors.length > 0 && (
          <Alert tone="danger" title={t('growth.deals.itemErrors')}>
            <ul className="list-disc ps-5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}
        <FormField label={t('growth.deals.addProduct')}>
          <ProductSearchAdd
            exclude={items.map((i) => i.productId)}
            disabled={items.length >= 100}
            onAdd={(p) => setItems((l) => [...l, { productId: p.id, variantId: ALL, price: '', quantityLimit: '100' }])}
          />
        </FormField>
        {!items.length ? (
          <p className="text-sm text-fg-muted">{t('growth.deals.noItems')}</p>
        ) : (
          <ul className="grid gap-2">
            {items.map((it, idx) => (
              <DealItemRow key={it.productId} item={it} onChange={(p) => patchItem(idx, p)} onRemove={() => setItems((l) => l.filter((_, i) => i !== idx))} />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function DealItemRow({ item, onChange, onRemove }: { item: Item; onChange: (p: Partial<Item>) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const p = useSellerProduct(item.productId);
  const variants = p.data?.variants ?? [];
  const chosen = item.variantId === ALL ? variants : variants.filter((v) => v.id === item.variantId);
  const regular = chosen.length ? Math.min(...chosen.map((v) => v.price)) : 0;
  const price = rupeesToMinor(item.price);
  const pct = price && regular ? Math.round((1 - price / regular) * 100) : null;
  return (
    <li className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_10rem_8rem_7rem_auto] sm:items-end">
      <div className="min-w-0">
        {p.isLoading ? <Skeleton className="h-5 w-40" /> : <p className="line-clamp-1 text-sm font-semibold text-fg">{p.data?.title ?? t('growth.picker.unknown')}</p>}
        <p className="text-xs text-fg-muted">
          {t('growth.deals.regular')} <span dir="ltr">{money(regular)}</span>
          {pct !== null && pct > 0 && <span className="font-semibold text-sale"> · -{pct}%</span>}
        </p>
      </div>
      <FormField label={t('growth.deals.variant')}>
        <Select
          value={item.variantId}
          onValueChange={(v) => onChange({ variantId: v })}
          options={[
            { value: ALL, label: t('growth.deals.allVariants') },
            ...variants.map((v) => ({ value: v.id, label: Object.values(v.options).join(' / ') || v.sku })),
          ]}
        />
      </FormField>
      <FormField label={t('growth.deals.price')}>
        <Input inputMode="decimal" dir="ltr" value={item.price} onChange={(e) => onChange({ price: e.target.value })} />
      </FormField>
      <FormField label={t('growth.deals.limit')}>
        <Input inputMode="numeric" dir="ltr" value={item.quantityLimit} onChange={(e) => onChange({ quantityLimit: e.target.value })} />
      </FormField>
      <IconButton label={t('seller.common.remove')} size="sm" variant="ghost" onClick={onRemove}>
        <Trash2 className="size-4" />
      </IconButton>
    </li>
  );
}
