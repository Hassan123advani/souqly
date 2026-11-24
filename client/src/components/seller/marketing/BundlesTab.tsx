import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { bundleSchema } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useSellerProduct } from '@/api/seller';
import { useMarketingList, useSaveMarketing, type StoreBundle } from '@/api/growth';
import { Button, Card, FormField, IconButton, Input, Modal, Select, Skeleton, Switch } from '@/components/ui';
import { money } from '@/lib/format';
import { ProductName, ProductSearchAdd } from '../growth/ProductPicker';
import { firstIssue, fromLocalInput, minorToInput, rupeesToMinor, toLocalInput } from '../growth/utils';
import { DeleteMarketing, ListState, WindowBadge, WindowText } from './common';

const CHEAPEST = '*';

export function BundlesTab() {
  const { t } = useTranslation();
  const list = useMarketingList('bundles');
  const [editing, setEditing] = useState<StoreBundle | 'new' | null>(null);
  const add = (
    <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
      {t('growth.bundles.add')}
    </Button>
  );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{t('growth.bundles.hint')}</p>
        {add}
      </div>
      <ListState query={list} empty={{ icon: <Package />, title: t('growth.bundles.empty'), description: t('growth.bundles.emptyBody'), action: add }}>
        {(rows) => (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-fg">{b.name}</p>
                    <p className="text-sm font-semibold text-primary-700" dir="ltr">
                      {money(b.bundlePrice)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <WindowBadge {...b} />
                    <IconButton label={t('seller.common.edit')} size="sm" variant="ghost" onClick={() => setEditing(b)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <DeleteMarketing kind="bundles" id={b.id} name={b.name} />
                  </div>
                </div>
                <ul className="mt-2 grid gap-1 text-sm">
                  {b.items.map((i) => (
                    <li key={`${i.productId}:${i.variantId ?? ''}`} className="flex gap-2">
                      <span className="font-semibold text-fg-muted" dir="ltr">
                        {i.qty}×
                      </span>
                      <ProductName id={i.productId} className="line-clamp-1 text-fg" />
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-fg-muted">
                  <WindowText startsAt={b.startsAt} endsAt={b.endsAt} />
                </p>
              </Card>
            ))}
          </div>
        )}
      </ListState>
      <BundleDialog bundle={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

type Item = { productId: string; variantId: string; qty: string };

function BundleDialog({ bundle, onClose }: { bundle: StoreBundle | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveMarketing('bundles');
  const b = bundle && bundle !== 'new' ? bundle : null;
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [regular, setRegular] = useState<Record<string, number>>({});
  const [lastOpen, setLastOpen] = useState<typeof bundle>(null);
  if (bundle !== lastOpen) {
    setLastOpen(bundle);
    setName(b?.name ?? '');
    setPrice(minorToInput(b?.bundlePrice, true));
    setIsActive(b?.isActive ?? true);
    setStartsAt(toLocalInput(b?.startsAt));
    setEndsAt(toLocalInput(b?.endsAt));
    setItems(b?.items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? CHEAPEST, qty: String(i.qty) })) ?? []);
    setRegular({});
  }
  const total = items.reduce((a, i) => a + (regular[i.productId] ?? 0) * (Number(i.qty) || 0), 0);
  const bp = rupeesToMinor(price);

  const submit = () => {
    const body = {
      name: name.trim(),
      bundlePrice: bp ?? 0,
      isActive,
      ...(startsAt ? { startsAt: fromLocalInput(startsAt) } : {}),
      ...(endsAt ? { endsAt: fromLocalInput(endsAt) } : {}),
      items: items.map((i) => ({ productId: i.productId, ...(i.variantId !== CHEAPEST ? { variantId: i.variantId } : {}), qty: Number(i.qty) || 1 })),
    };
    const parsed = bundleSchema.safeParse(body);
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    save.mutate(
      { id: b?.id, body },
      {
        onSuccess: () => {
          toast.success(t('seller.common.saved'));
          onClose();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };

  return (
    <Modal
      open={!!bundle}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={b ? t('growth.bundles.edit') : t('growth.bundles.add')}
      description={t('growth.bundles.rules')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('seller.common.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={items.length < 2}>
            {t('seller.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('growth.bundles.name')} required>
            <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField
            label={t('growth.bundles.price')}
            required
            hint={total > 0 ? t('growth.bundles.regularTotal', { amount: money(total) }) : undefined}
            error={bp && total && bp >= total ? t('growth.bundles.notADiscount') : undefined}
          >
            <Input inputMode="decimal" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} />
          </FormField>
          <FormField label={t('growth.common.startsAt')} hint={t('seller.common.optional')}>
            <Input type="datetime-local" dir="ltr" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </FormField>
          <FormField label={t('growth.common.endsAt')} hint={t('seller.common.optional')}>
            <Input type="datetime-local" dir="ltr" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </FormField>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} label={t('growth.common.active')} />
        <FormField label={t('growth.bundles.items')} hint={t('growth.bundles.itemsHint')}>
          <ProductSearchAdd
            exclude={items.map((i) => i.productId)}
            disabled={items.length >= 6}
            onAdd={(p) => setItems((l) => [...l, { productId: p.id, variantId: CHEAPEST, qty: '1' }])}
          />
        </FormField>
        <ul className="grid gap-2">
          {items.map((it, idx) => (
            <BundleItemRow
              key={it.productId}
              item={it}
              onPrice={(n) => setRegular((r) => (r[it.productId] === n ? r : { ...r, [it.productId]: n }))}
              onChange={(p) => setItems((l) => l.map((x, i) => (i === idx ? { ...x, ...p } : x)))}
              onRemove={() => setItems((l) => l.filter((_, i) => i !== idx))}
            />
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function BundleItemRow({ item, onChange, onRemove, onPrice }: { item: Item; onChange: (p: Partial<Item>) => void; onRemove: () => void; onPrice: (n: number) => void }) {
  const { t } = useTranslation();
  const p = useSellerProduct(item.productId);
  const variants = p.data?.variants ?? [];
  const v = item.variantId === CHEAPEST ? [...variants].sort((a, b) => a.price - b.price)[0] : variants.find((x) => x.id === item.variantId);
  const unit = v?.price;
  useEffect(() => {
    if (unit !== undefined) onPrice(unit);
  }, [unit, onPrice]);
  return (
    <li className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_10rem_6rem_auto] sm:items-end">
      <div className="min-w-0">
        {p.isLoading ? <Skeleton className="h-5 w-40" /> : <p className="line-clamp-1 text-sm font-semibold text-fg">{p.data?.title ?? t('growth.picker.unknown')}</p>}
        {v && (
          <p className="text-xs text-fg-muted" dir="ltr">
            {money(v.price)}
          </p>
        )}
      </div>
      <FormField label={t('growth.deals.variant')}>
        <Select
          value={item.variantId}
          onValueChange={(val) => onChange({ variantId: val })}
          options={[{ value: CHEAPEST, label: t('growth.bundles.anyVariant') }, ...variants.map((x) => ({ value: x.id, label: Object.values(x.options).join(' / ') || x.sku }))]}
        />
      </FormField>
      <FormField label={t('growth.bundles.qty')}>
        <Input inputMode="numeric" dir="ltr" value={item.qty} onChange={(e) => onChange({ qty: e.target.value })} />
      </FormField>
      <IconButton label={t('seller.common.remove')} size="sm" variant="ghost" onClick={onRemove}>
        <Trash2 className="size-4" />
      </IconButton>
    </li>
  );
}
