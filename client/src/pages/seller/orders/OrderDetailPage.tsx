import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Bike, FileText, MapPin, StickyNote, Tag } from 'lucide-react';
import { PERMISSIONS, type OrderDTO } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { downloadPdf, useAssignRider, useOrderNote, useSellerOrder, useStaff } from '@/api/seller';
import { Seo } from '@/components/layout/Seo';
import { Button, Card, CardHeader, ErrorState, PageSpinner, Select, Textarea } from '@/components/ui';
import { OrderActions } from '@/components/seller/orders/OrderActions';
import { SellerOrderStatus } from '@/components/seller/OrderStatusBadge';
import { useActiveStoreId } from '@/components/seller/useActiveStore';
import { useCan } from '@/components/seller/usePermissions';
import { LiveTracking } from '@/components/tracking/LiveTracking';
import { useLang } from '@/lib/catalog';
import { formatDateTime, money } from '@/lib/format';

export default function OrderDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const sid = useActiveStoreId();
  const manage = can(PERMISSIONS.STORE_ORDERS_MANAGE);
  const q = useSellerOrder(id);
  const [pdf, setPdf] = useState<string | null>(null);

  if (q.isLoading) return <PageSpinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data;
  const addr = o.shippingAddress as Record<string, string | undefined>;

  async function download(kind: 'invoice' | 'label') {
    setPdf(kind);
    try {
      await downloadPdf(`/seller/orders/${o.id}/${kind}.pdf`, `${o.number}-${kind}.pdf`, sid);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPdf(null);
    }
  }

  return (
    <>
      <Seo title={o.number} noindex />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button to="/seller/orders" variant="ghost" size="sm" leftIcon={<ArrowLeft className="flip-rtl size-4" />}>
          {t('seller.nav.orders')}
        </Button>
        <h1 className="text-xl font-extrabold text-fg sm:text-2xl" dir="ltr">
          {o.number}
        </h1>
        <SellerOrderStatus status={o.status} />
        <span className="text-sm text-fg-muted">{formatDateTime(o.createdAt, lang)}</span>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {manage && <OrderActions order={o} />}
        <span className="ms-auto flex gap-2">
          <Button variant="outline" size="sm" leftIcon={<FileText className="size-4" />} loading={pdf === 'invoice'} onClick={() => void download('invoice')}>
            {t('seller.orders.invoice')}
          </Button>
          <Button variant="outline" size="sm" leftIcon={<Tag className="size-4" />} loading={pdf === 'label'} onClick={() => void download('label')}>
            {t('seller.orders.label')}
          </Button>
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid gap-5 lg:col-span-2">
          {o.status === 'out_for_delivery' && <LiveTracking orderId={o.id} number={o.number} />}
          <Card>
            <CardHeader title={t('seller.orders.itemsTitle')} />
            <ul className="divide-y divide-border">
              {o.items.map((it) => (
                <li key={it.variantId} className="flex items-center gap-3 px-5 py-3">
                  <div className="size-14 shrink-0 overflow-hidden rounded-md bg-surface-2">{it.image && <img src={it.image} alt="" className="size-full object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold text-fg">{it.title}</p>
                    <p className="text-xs text-fg-muted">
                      {Object.values(it.options).join(' / ')} {it.sku && <span dir="ltr">· {it.sku}</span>}
                    </p>
                  </div>
                  <span className="text-sm text-fg-muted" dir="ltr">
                    {money(it.price)} × {it.qty}
                  </span>
                  <span className="w-24 text-end text-sm font-bold text-fg" dir="ltr">
                    {money(it.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <Totals o={o} />
          </Card>
          <Timeline o={o} />
        </div>
        <div className="grid h-fit gap-5">
          <Card>
            <CardHeader title={t('seller.orders.shipTo')} />
            <div className="grid gap-1 p-5 text-sm">
              <p className="flex items-center gap-2 font-semibold text-fg">
                <MapPin className="size-4 text-fg-muted" /> {addr.fullName ?? o.buyer?.name}
              </p>
              {addr.phone && (
                <a href={`tel:${addr.phone}`} className="text-primary-700" dir="ltr">
                  {addr.phone}
                </a>
              )}
              <p className="text-fg-muted">{[addr.line1, addr.line2, addr.area, addr.city, addr.postalCode].filter(Boolean).join(', ')}</p>
              {o.buyerNote && <p className="mt-2 rounded-md bg-accent-50 p-2 text-xs text-accent-900">“{o.buyerNote}”</p>}
              <p className="mt-2 text-xs text-fg-muted">
                {t('seller.orders.payment')}: {t(`payments.${o.payment.method}`, o.payment.method)} · {o.payment.status}
              </p>
              {o.tracking && (
                <p className="text-xs text-fg-muted">
                  {t('seller.orders.courier')}: {o.tracking.courier} · <span dir="ltr">{o.tracking.trackingNumber}</span>
                </p>
              )}
              {o.cancel && (
                <p className="mt-2 text-xs text-danger">
                  {t('seller.orders.cancelReason')}: {o.cancel.reason}
                </p>
              )}
            </div>
          </Card>
          {manage && <RiderCard o={o} canListStaff={can(PERMISSIONS.STORE_STAFF_MANAGE)} />}
          <Notes o={o} canAdd={manage} />
        </div>
      </div>
    </>
  );
}

function Totals({ o }: { o: OrderDTO }) {
  const { t } = useTranslation();
  const rows: [string, number, boolean?][] = [
    [t('seller.orders.subtotal'), o.subtotal],
    [t('seller.orders.shipping'), o.shippingFee],
    [t('seller.orders.total'), o.total, true],
  ];
  const discount = o.discounts.store + o.discounts.platform;
  if (discount > 0) rows.splice(2, 0, [t('seller.orders.discounts'), -discount]);
  if (o.commission) rows.push([t('seller.orders.commission', { pct: (o.commission.bps / 100).toFixed(1) }), -o.commission.amount]);
  if (o.sellerNet !== undefined) rows.push([t('seller.orders.net'), o.sellerNet, true]);
  return (
    <dl className="grid gap-1.5 border-t border-border px-5 py-4 text-sm">
      {rows.map(([k, v, strong]) => (
        <div key={k} className="flex justify-between">
          <dt className={strong ? 'font-bold text-fg' : 'text-fg-muted'}>{k}</dt>
          <dd className={strong ? 'font-bold text-fg' : 'text-fg'} dir="ltr">
            {money(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Timeline({ o }: { o: OrderDTO }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <Card>
      <CardHeader title={t('seller.orders.timeline')} />
      <ol className="grid gap-4 p-5">
        {[...o.timeline].reverse().map((e, i) => (
          <li key={`${e.status}-${e.at}`} className="flex gap-3">
            <span className={i === 0 ? 'mt-1 size-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary-100' : 'mt-1 size-2.5 shrink-0 rounded-full bg-border-strong'} />
            <div>
              <p className="text-sm font-semibold text-fg">{t(`seller.orderStatus.${e.status}`, e.status)}</p>
              <p className="text-xs text-fg-muted">{formatDateTime(e.at, lang)}</p>
              {e.note && <p className="mt-0.5 text-xs text-fg">{e.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Notes({ o, canAdd }: { o: OrderDTO; canAdd: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const add = useOrderNote();
  const [text, setText] = useState('');
  return (
    <Card>
      <CardHeader title={t('seller.orders.notes')} description={t('seller.orders.notesHint')} />
      <div className="grid gap-3 p-5">
        {!o.sellerNotes?.length && <p className="text-sm text-fg-muted">{t('seller.orders.noNotes')}</p>}
        {o.sellerNotes?.map((n, i) => (
          <div key={i} className="rounded-md bg-surface-2 p-2.5 text-sm">
            <p className="flex items-center gap-1.5 text-xs text-fg-muted">
              <StickyNote className="size-3.5" /> {formatDateTime(n.at, lang)}
            </p>
            <p className="mt-1 whitespace-pre-line text-fg">{n.text}</p>
          </div>
        ))}
        {canAdd && (
          <>
            <Textarea rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('seller.orders.addNote')} placeholder={t('seller.orders.addNote')} />
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              disabled={!text.trim()}
              loading={add.isPending}
              onClick={() =>
                add.mutate({ id: o.id, text: text.trim() }, { onSuccess: () => setText(''), onError: (e) => toast.error(getErrorMessage(e)) })
              }
            >
              {t('seller.orders.saveNote')}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function RiderCard({ o, canListStaff }: { o: OrderDTO; canListStaff: boolean }) {
  const { t } = useTranslation();
  const staff = useStaff(canListStaff);
  const assign = useAssignRider();
  const riders = (staff.data ?? []).filter((m) => m.role === 'RIDER' && m.status === 'active');
  const eligible = ['packed', 'shipped', 'out_for_delivery', 'failed_delivery'].includes(o.status);
  if (!canListStaff || !eligible) return null;
  return (
    <Card>
      <CardHeader title={t('seller.orders.rider')} />
      <div className="grid gap-2 p-5">
        {riders.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('seller.orders.noRiders')}</p>
        ) : (
          <Select
            placeholder={t('seller.orders.pickRider')}
            aria-label={t('seller.orders.pickRider')}
            onValueChange={(riderMemberId) =>
              assign.mutate(
                { id: o.id, riderMemberId },
                { onSuccess: () => toast.success(t('seller.orders.riderAssigned')), onError: (e) => toast.error(getErrorMessage(e)) },
              )
            }
            options={riders.map((r) => ({ value: r.id, label: r.user.name }))}
          />
        )}
        <p className="flex items-center gap-1.5 text-xs text-fg-muted">
          <Bike className="size-3.5" /> {t('seller.orders.riderHint')}
        </p>
      </div>
    </Card>
  );
}
