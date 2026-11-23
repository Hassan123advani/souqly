import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Lock, ShoppingCart } from 'lucide-react';
import type { PaymentMethod } from '@souqly/shared';
import { cartKey, useCheckoutPreview, usePlaceOrder } from '@/api/cart';
import { CoinsRedeem } from '@/components/wallet/CoinsRedeem';
import { getErrorCode, getErrorStatus } from '@/api/client';
import { Alert, Button, Card, Container, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { Seo } from '@/components/layout/Seo';
import { CheckoutBar } from '@/components/cart/CheckoutBar';
import { PriceBreakdown } from '@/components/cart/PriceBreakdown';
import { VoucherChip } from '@/components/cart/VoucherInput';
import { featureError } from '@/components/cart/errors';
import { AddressStep } from './AddressStep';
import { PaymentStep } from './PaymentStep';
import { ReviewStep } from './ReviewStep';

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function CheckoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addressId, setAddressId] = useState<string>();
  const [method, setMethod] = useState<PaymentMethod>('cod');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<'STOCK_CHANGED' | 'CART_CHANGED' | null>(null);
  const [coins, setCoins] = useState(0);
  const preview = useCheckoutPreview(addressId, method, coins);
  const place = usePlaceOrder();
  // One key per attempt; kept across network failures (no response) so a retry can't double-order.
  const keyRef = useRef<string | null>(null);

  const onAddress = useCallback((id: string) => setAddressId(id), []);
  const onNote = useCallback((storeId: string, text: string) => setNotes((n) => ({ ...n, [storeId]: text })), []);

  const p = preview.data;
  const canPlace = !!p && p.canPlace && p.paymentAvailable && !preview.isFetching;

  const submit = () => {
    if (!addressId || !canPlace || place.isPending) return;
    keyRef.current ??= newKey();
    const cleanNotes = Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    setConflict(null);
    place.mutate(
      { addressId, paymentMethod: method, idempotencyKey: keyRef.current, ...(coins > 0 ? { coins } : {}), ...(Object.keys(cleanNotes).length ? { notes: cleanNotes } : {}) },
      {
        onSuccess: (c) => {
          keyRef.current = null;
          navigate(`/checkout/success/${c.number}`, { replace: true });
        },
        onError: (e) => {
          if (getErrorStatus(e)) keyRef.current = null;
          const code = getErrorCode(e);
          if (code === 'STOCK_CHANGED' || code === 'CART_CHANGED') {
            setConflict(code);
            void qc.invalidateQueries({ queryKey: cartKey });
            void preview.refetch();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else toast.error(featureError(e, 'checkout.errors'));
        },
      },
    );
  };

  const body = () => {
    if (preview.isError && !p)
      return (
        <Card>
          <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
        </Card>
      );
    if (p && p.summary.selectedCount === 0)
      return (
        <Card>
          <EmptyState
            icon={<ShoppingCart />}
            title={t('checkout.emptyTitle')}
            description={t('checkout.emptyBody')}
            action={<Button to="/cart">{t('checkout.backToCart')}</Button>}
          />
        </Card>
      );
    return null;
  };
  const blocked = body();

  const s = p?.summary;
  return (
    <Container className="py-6 sm:py-10">
      <Seo title={t('checkout.title')} noindex />
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{t('checkout.title')}</h1>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-subtle">
          <Lock className="size-3.5" aria-hidden />
          {t('checkout.secure')}
        </span>
      </div>

      {conflict && (
        <Alert
          tone="warning"
          className="mb-4"
          title={t(`checkout.conflict.${conflict}.title`)}
          action={
            <Button size="sm" variant="outline" to="/cart">
              {t('checkout.reviewCart')}
            </Button>
          }
        >
          {t(`checkout.conflict.${conflict}.body`)}
        </Alert>
      )}
      {p && !p.canPlace && p.summary.selectedCount > 0 && !conflict && (
        <Alert
          tone="warning"
          className="mb-4"
          title={t('checkout.issuesTitle')}
          action={
            <Button size="sm" variant="outline" to="/cart">
              {t('checkout.reviewCart')}
            </Button>
          }
        >
          {t('checkout.issuesBody')}
        </Alert>
      )}

      <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-0">
        <div className="min-w-0 space-y-4">
          <AddressStep value={addressId} onChange={onAddress} />
          {blocked ??
            (p ? (
              <>
                <ReviewStep n={2} preview={p} notes={notes} onNote={onNote} />
                <PaymentStep n={3} value={method} onChange={setMethod} />
              </>
            ) : addressId ? (
              <Card className="space-y-3 p-5">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </Card>
            ) : null)}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-5 p-5">
            <h2 className="text-base font-bold text-fg">{t('checkout.orderSummary')}</h2>
            {s ? (
              <>
                {(s.platformVoucher || p.groups.some((g) => g.storeVoucher)) && (
                  <div className="flex flex-wrap gap-2">
                    {s.platformVoucher && <VoucherChip voucher={s.platformVoucher} />}
                    {p.groups.map((g) => g.storeVoucher && <VoucherChip key={g.store.id} voucher={g.storeVoucher} />)}
                  </div>
                )}
                <PriceBreakdown
                  b={{ itemsSubtotal: s.itemsSubtotal, shippingTotal: s.shippingTotal, discountTotal: s.discountTotal, total: s.total, savings: s.savings, count: s.selectedCount }}
                />
                <CoinsRedeem redemption={p.coinsRedemption} value={coins} onChange={setCoins} />
                {method === 'cod' && <p className="rounded-md bg-accent-50 px-3 py-2 text-xs font-medium text-accent-800">{t('checkout.codHint')}</p>}
                <Button block size="lg" variant="accent" className="hidden lg:inline-flex" disabled={!canPlace} loading={place.isPending} onClick={submit}>
                  {t('checkout.placeOrder')}
                </Button>
                <p className="text-center text-[11px] text-fg-subtle">{t('checkout.terms')}</p>
              </>
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            )}
          </Card>
        </aside>
      </div>
      {s && !blocked && (
        <CheckoutBar total={s.total} savings={s.savings} cta={t('checkout.placeOrder')} disabled={!canPlace} loading={place.isPending} onClick={submit} />
      )}
    </Container>
  );
}
