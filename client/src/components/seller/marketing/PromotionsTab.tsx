import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Gift, Pencil, Plus } from 'lucide-react';
import { promotionSchema } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useMarketingList, useSaveMarketing, type StorePromotion } from '@/api/growth';
import { Button, Card, FormField, IconButton, Input, Modal, Switch } from '@/components/ui';
import { ProductChips, ProductSearchAdd } from '../growth/ProductPicker';
import { defaultWindow, firstIssue, fromLocalInput, toLocalInput } from '../growth/utils';
import { DeleteMarketing, ListState, WindowBadge, WindowText } from './common';

function offerText(p: Pick<StorePromotion, 'buy' | 'get'>, t: (k: string, o?: Record<string, unknown>) => string) {
  return p.get.discountBps >= 10_000
    ? t('growth.promos.offerFree', { buy: p.buy.qty, get: p.get.qty })
    : t('growth.promos.offerPct', { buy: p.buy.qty, get: p.get.qty, pct: p.get.discountBps / 100 });
}

export function PromotionsTab() {
  const { t } = useTranslation();
  const list = useMarketingList('promotions');
  const [editing, setEditing] = useState<StorePromotion | 'new' | null>(null);
  const add = (
    <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
      {t('growth.promos.add')}
    </Button>
  );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{t('growth.promos.hint')}</p>
        {add}
      </div>
      <ListState query={list} empty={{ icon: <Gift />, title: t('growth.promos.empty'), description: t('growth.promos.emptyBody'), action: add }}>
        {(rows) => (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-fg">{p.name}</p>
                    <p className="text-sm font-semibold text-primary-700">{offerText(p, t)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <WindowBadge {...p} />
                    <IconButton label={t('seller.common.edit')} size="sm" variant="ghost" onClick={() => setEditing(p)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <DeleteMarketing kind="promotions" id={p.id} name={p.name} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-fg-muted">
                  {t('growth.promos.counts', { buy: p.buy.productIds.length, get: p.get.productIds.length })} · <WindowText startsAt={p.startsAt} endsAt={p.endsAt} />
                </p>
              </Card>
            ))}
          </div>
        )}
      </ListState>
      <PromotionDialog promo={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PromotionDialog({ promo, onClose }: { promo: StorePromotion | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveMarketing('promotions');
  const p = promo && promo !== 'new' ? promo : null;
  const [name, setName] = useState('');
  const [buyIds, setBuyIds] = useState<string[]>([]);
  const [getIds, setGetIds] = useState<string[]>([]);
  const [buyQty, setBuyQty] = useState('1');
  const [getQty, setGetQty] = useState('1');
  const [pct, setPct] = useState('100');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [lastOpen, setLastOpen] = useState<typeof promo>(null);
  if (promo !== lastOpen) {
    setLastOpen(promo);
    const win = defaultWindow(14);
    setName(p?.name ?? '');
    setBuyIds(p?.buy.productIds ?? []);
    setGetIds(p?.get.productIds ?? []);
    setBuyQty(String(p?.buy.qty ?? 1));
    setGetQty(String(p?.get.qty ?? 1));
    setPct(String((p?.get.discountBps ?? 10_000) / 100));
    setStartsAt(p ? toLocalInput(p.startsAt) : win.startsAt);
    setEndsAt(p ? toLocalInput(p.endsAt) : win.endsAt);
    setIsActive(p?.isActive ?? true);
  }

  const submit = () => {
    const body = {
      type: 'bxgy' as const,
      name: name.trim(),
      buy: { productIds: buyIds, qty: Number(buyQty) || 0 },
      get: { productIds: getIds, qty: Number(getQty) || 0, discountBps: Math.round(Number(pct) * 100) },
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      isActive,
    };
    const parsed = promotionSchema.safeParse(body);
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    save.mutate(
      { id: p?.id, body },
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
      open={!!promo}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={p ? t('growth.promos.edit') : t('growth.promos.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('seller.common.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {t('seller.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormField label={t('growth.promos.name')} required>
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <fieldset className="grid gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-bold text-fg">{t('growth.promos.buy')}</legend>
          <FormField label={t('growth.promos.qty')}>
            <Input inputMode="numeric" dir="ltr" className="w-24" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} />
          </FormField>
          <ProductSearchAdd exclude={buyIds} disabled={buyIds.length >= 100} onAdd={(x) => setBuyIds((l) => [...l, x.id])} />
          <ProductChips ids={buyIds} onRemove={(id) => setBuyIds((l) => l.filter((x) => x !== id))} />
        </fieldset>
        <fieldset className="grid gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-bold text-fg">{t('growth.promos.get')}</legend>
          <div className="flex flex-wrap gap-3">
            <FormField label={t('growth.promos.qty')}>
              <Input inputMode="numeric" dir="ltr" className="w-24" value={getQty} onChange={(e) => setGetQty(e.target.value)} />
            </FormField>
            <FormField label={t('growth.promos.discountPct')} hint={t('growth.promos.discountHint')}>
              <Input inputMode="decimal" dir="ltr" className="w-28" value={pct} onChange={(e) => setPct(e.target.value)} />
            </FormField>
          </div>
          <ProductSearchAdd exclude={getIds} disabled={getIds.length >= 100} onAdd={(x) => setGetIds((l) => [...l, x.id])} />
          <ProductChips ids={getIds} onRemove={(id) => setGetIds((l) => l.filter((x) => x !== id))} />
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('growth.common.startsAt')} required>
            <Input type="datetime-local" dir="ltr" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </FormField>
          <FormField label={t('growth.common.endsAt')} required>
            <Input type="datetime-local" dir="ltr" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </FormField>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} label={t('growth.common.active')} />
      </div>
    </Modal>
  );
}
