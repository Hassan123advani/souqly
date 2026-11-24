import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Megaphone, Trash2 } from 'lucide-react';
import { campaignNominationSchema, type SellerProduct } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useNominate, useSellerCampaigns, type NominationStatus, type SellerCampaign } from '@/api/growth';
import { Badge, Button, Card, FormField, IconButton, Input, Modal, type BadgeTone } from '@/components/ui';
import { money } from '@/lib/format';
import { ProductName, ProductSearchAdd, minPrice } from '../growth/ProductPicker';
import { firstIssue, rupeesToMinor } from '../growth/utils';
import { ListState, WindowText } from './common';

const TONE: Record<NominationStatus, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'danger' };

export function CampaignsTab() {
  const { t } = useTranslation();
  const list = useSellerCampaigns();
  const [nominating, setNominating] = useState<SellerCampaign | null>(null);
  return (
    <div className="grid gap-4">
      <p className="text-sm text-fg-muted">{t('growth.campaigns.hint')}</p>
      <ListState query={list} empty={{ icon: <Megaphone />, title: t('growth.campaigns.empty'), description: t('growth.campaigns.emptyBody') }}>
        {(rows) => (
          <div className="grid gap-4">
            {rows.map((c) => (
              <Card key={c.id} className="overflow-hidden">
                {c.banner && <img src={c.banner} alt="" className="aspect-[4/1] w-full object-cover" loading="lazy" />}
                <div className="grid gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-fg">{c.name}</p>
                      <p className="text-xs text-fg-muted">
                        <WindowText startsAt={c.startsAt} endsAt={c.endsAt} />
                      </p>
                      {c.description && <p className="mt-1 text-sm text-fg-muted">{c.description}</p>}
                    </div>
                    <Button size="sm" onClick={() => setNominating(c)}>
                      {t('growth.campaigns.nominate')}
                    </Button>
                  </div>
                  {c.nominations.length > 0 && (
                    <ul className="divide-y divide-border rounded-md border border-border text-sm">
                      {c.nominations.map((n) => (
                        <li key={n.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                          <ProductName id={n.productId} className="line-clamp-1 min-w-0 flex-1 text-fg" />
                          <span className="font-semibold" dir="ltr">
                            {money(n.campaignPrice)}
                          </span>
                          <Badge tone={TONE[n.status]} size="sm">
                            {t(`growth.campaigns.status.${n.status}`)}
                          </Badge>
                          {n.note && <p className="w-full text-xs text-fg-muted">{n.note}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </ListState>
      <NominateDialog campaign={nominating} onClose={() => setNominating(null)} />
    </div>
  );
}

type Row = { product: SellerProduct; price: string };

function NominateDialog({ campaign, onClose }: { campaign: SellerCampaign | null; onClose: () => void }) {
  const { t } = useTranslation();
  const nominate = useNominate();
  const [rows, setRows] = useState<Row[]>([]);
  const [lastOpen, setLastOpen] = useState<SellerCampaign | null>(null);
  if (campaign !== lastOpen) {
    setLastOpen(campaign);
    setRows([]);
  }
  const taken = new Set(campaign?.nominations.filter((n) => n.status !== 'rejected').map((n) => n.productId));

  const submit = () => {
    if (!campaign) return;
    const body = { items: rows.map((r) => ({ productId: r.product.id, campaignPrice: rupeesToMinor(r.price) ?? 0 })) };
    const parsed = campaignNominationSchema.safeParse(body);
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    const bad = rows.find((r) => {
      const p = rupeesToMinor(r.price) ?? 0;
      return p <= 0 || p >= minPrice(r.product);
    });
    if (bad) return void toast.error(t('growth.campaigns.priceBelow', { title: bad.product.title }));
    nominate.mutate(
      { campaignId: campaign.id, items: body.items },
      {
        onSuccess: (r) => {
          toast.success(t('growth.campaigns.nominated', { added: r.added, skipped: r.skipped }));
          onClose();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };

  return (
    <Modal
      open={!!campaign}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('growth.campaigns.nominateTitle', { name: campaign?.name ?? '' })}
      description={t('growth.campaigns.nominateBody')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('seller.common.cancel')}
          </Button>
          <Button onClick={submit} loading={nominate.isPending} disabled={!rows.length}>
            {t('growth.campaigns.submit')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <ProductSearchAdd
          exclude={[...rows.map((r) => r.product.id), ...taken]}
          disabled={rows.length >= 50}
          onAdd={(p) => setRows((l) => [...l, { product: p, price: '' }])}
        />
        {!rows.length ? (
          <p className="text-sm text-fg-muted">{t('growth.campaigns.pick')}</p>
        ) : (
          <ul className="grid gap-2">
            {rows.map((r, idx) => (
              <li key={r.product.id} className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold text-fg">{r.product.title}</p>
                  <p className="text-xs text-fg-muted">
                    {t('growth.deals.regular')} <span dir="ltr">{money(minPrice(r.product))}</span>
                  </p>
                </div>
                <FormField label={t('growth.campaigns.price')}>
                  <Input
                    inputMode="decimal"
                    dir="ltr"
                    className="w-32"
                    value={r.price}
                    onChange={(e) => setRows((l) => l.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))}
                  />
                </FormField>
                <IconButton label={t('seller.common.remove')} size="sm" variant="ghost" onClick={() => setRows((l) => l.filter((_, i) => i !== idx))}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
