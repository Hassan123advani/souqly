import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, FileDown, MapPin, MessageCircle, Undo2, Wallet, XCircle } from 'lucide-react';
import { useFlag } from '@/api/config';
import { useBuyerOrder, useDownloadInvoice } from '@/api/orders';
import { getErrorStatus } from '@/api/client';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { Seo } from '@/components/layout/Seo';
import { PriceBreakdown } from '@/components/cart/PriceBreakdown';
import { StoreHeader } from '@/components/cart/StoreHeader';
import { featureError } from '@/components/cart/errors';
import { ProductImage } from '@/components/product/ProductImage';
import { CancelOrderModal } from '@/components/orders/CancelOrderModal';
import { DeliveryOtpCard } from '@/components/orders/DeliveryOtpCard';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { ReorderButton } from '@/components/orders/ReorderButton';
import { TrackingTimeline } from '@/components/orders/TrackingTimeline';
import { LiveTracking } from '@/components/tracking/LiveTracking';
import { formatDateTime, money } from '@/lib/format';
import { useUi } from '@/stores/ui';

function Section({ title, icon, children }: { title: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-fg [&_svg]:size-4 [&_svg]:text-primary-700">
        {icon}
        {title}
      </h2>
      {children}
    </Card>
  );
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const { number = '' } = useParams();
  const q = useBuyerOrder(number);
  const invoice = useDownloadInvoice();
  const chatOn = useFlag('chat');
  const returnsOn = useFlag('returns');
  const [cancelOpen, setCancelOpen] = useState(false);
  const back = (
    <Link to="/account/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
      {t('orders.back')}
    </Link>
  );

  if (q.isPending)
    return (
      <div className="space-y-4" aria-busy>
        {back}
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  if (q.isError)
    return (
      <div className="space-y-4">
        {back}
        <Card>
          {getErrorStatus(q.error) === 404 ? (
            <EmptyState title={t('orders.notFound')} description={t('orders.notFoundBody')} action={<Button to="/account/orders">{t('orders.back')}</Button>} />
          ) : (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          )}
        </Card>
      </div>
    );

  const o = q.data;
  const a = o.shippingAddress;
  const discount = o.discounts.store + o.discounts.platform;
  const units = o.items.reduce((n, i) => n + i.qty, 0);

  return (
    <div className="space-y-4">
      <Seo title={t('orders.detailTitle', { number: o.number })} noindex />
      {back}

      <Card className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="latin text-lg font-extrabold tracking-tight text-fg" dir="ltr">
              {o.number}
            </h2>
            <OrderStatusBadge status={o.status} />
          </div>
          <p className="mt-1 text-xs text-fg-subtle">
            {t('orders.placedOn', { date: formatDateTime(o.createdAt, lang) })}
            {o.checkoutNumber && (
              <>
                {' · '}
                {t('orders.checkoutRef')} <span className="latin">{o.checkoutNumber}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {o.canCancel && (
            <Button size="sm" variant="outline" leftIcon={<XCircle className="size-4" />} onClick={() => setCancelOpen(true)}>
              {t('orders.cancel')}
            </Button>
          )}
          <ReorderButton number={o.number} size="sm" />
          <Button
            size="sm"
            variant="outline"
            leftIcon={<FileDown className="size-4" />}
            loading={invoice.isPending}
            onClick={() => invoice.mutate(o.number, { onError: (e) => toast.error(featureError(e, 'orders.errors')) })}
          >
            {t('orders.invoice')}
          </Button>
        </div>
      </Card>

      {o.deliveryOtp && <DeliveryOtpCard otp={o.deliveryOtp} />}
      {o.status === 'out_for_delivery' && <LiveTracking orderId={o.id} number={o.number} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Section title={t('orders.tracking')}>
            <TrackingTimeline order={o} />
            {o.tracking && (
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-surface-2 p-3 text-xs">
                <div>
                  <dt className="text-fg-subtle">{t('orders.courier')}</dt>
                  <dd className="font-semibold text-fg">{o.tracking.courier}</dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">{t('orders.trackingNumber')}</dt>
                  <dd className="latin font-semibold text-fg" dir="ltr">
                    {o.tracking.trackingNumber}
                  </dd>
                </div>
              </dl>
            )}
          </Section>

          <Card className="p-4 sm:p-5">
            <StoreHeader
              store={o.store}
              trailing={
                chatOn ? (
                  <Button size="sm" variant="ghost" leftIcon={<MessageCircle className="size-4" />} to={`/chat?store=${o.store.slug}&order=${o.number}`}>
                    {t('orders.contactSeller')}
                  </Button>
                ) : null
              }
            />
            <ul className="mt-3 divide-y divide-border">
              {o.items.map((i) => (
                <li key={`${i.productId}:${i.variantId}`} className="flex items-center gap-3 py-3">
                  <ProductImage src={i.image} alt={i.title} className="size-16 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    {i.slug ? (
                      <Link to={`/p/${i.slug}`} className="line-clamp-2 text-sm font-medium text-fg hover:text-primary-700">
                        {i.title}
                      </Link>
                    ) : (
                      <p className="line-clamp-2 text-sm font-medium text-fg">{i.title}</p>
                    )}
                    <p className="truncate text-xs text-fg-subtle">
                      {[...Object.values(i.options), `${money(i.price)} × ${i.qty}`].join(' · ')}
                    </p>
                  </div>
                  <span className="latin shrink-0 text-sm font-semibold tabular text-fg" dir="ltr">
                    {money(i.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            {o.buyerNote && (
              <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                <span className="font-semibold text-fg">{t('orders.yourNote')}</span> {o.buyerNote}
              </p>
            )}
            {returnsOn && o.status === 'delivered' && (
              <Button className="mt-3" size="sm" variant="outline" leftIcon={<Undo2 className="size-4" />} to={`/account/orders/${o.number}/return`}>
                {t('orders.requestReturn')}
              </Button>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Section title={t('orders.shippingAddress')} icon={<MapPin />}>
            <p className="text-sm font-semibold text-fg">{str(a.fullName)}</p>
            <p className="mt-1 text-sm text-fg-muted">{[a.line1, a.line2, a.area, a.city].map(str).filter(Boolean).join(', ')}</p>
            {str(a.phone) && (
              <p className="latin mt-1 text-xs text-fg-subtle" dir="ltr">
                {str(a.phone)}
              </p>
            )}
          </Section>
          <Section title={t('orders.payment')} icon={<Wallet />}>
            <p className="text-sm font-semibold text-fg">{t(`checkout.methods.${o.payment.method}`)}</p>
            <p className="text-xs text-fg-subtle">{t(`orders.paymentStatus.${o.payment.status}`, { defaultValue: o.payment.status })}</p>
          </Section>
          <Section title={t('orders.summary')}>
            <PriceBreakdown b={{ itemsSubtotal: o.subtotal, shippingTotal: o.shippingFee, discountTotal: discount, total: o.total, count: units }} />
            {o.payment.method === 'cod' && !['delivered', 'cancelled', 'returned', 'refunded'].includes(o.status) && (
              <p className="mt-3 rounded-md bg-accent-50 px-3 py-2 text-xs font-medium text-accent-800">
                {t('orders.codPrepare', { amount: money(o.total) })}
              </p>
            )}
          </Section>
        </div>
      </div>

      <CancelOrderModal number={o.number} open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}
