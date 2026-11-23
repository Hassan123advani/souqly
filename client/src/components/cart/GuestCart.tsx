import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Trash2 } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';
import { useCart, type CartItem } from '@/stores/cart';
import { CartLine, LineAction } from './CartLine';
import { CheckoutBar } from './CheckoutBar';
import { EmptyCart } from './EmptyCart';
import { PriceBreakdown } from './PriceBreakdown';
import { StoreHeader } from './StoreHeader';

/** Local (signed-out) cart. Vouchers, selection and save-for-later need an account. */
export function GuestCart() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  if (!items.length) return <EmptyCart />;

  const groups = new Map<string, { store: CartItem['snapshot']['store']; items: CartItem[] }>();
  for (const i of items) {
    const g = groups.get(i.snapshot.store.slug) ?? { store: i.snapshot.store, items: [] };
    g.items.push(i);
    groups.set(i.snapshot.store.slug, g);
  }
  const subtotal = items.reduce((n, i) => n + i.snapshot.price * i.qty, 0);
  const savings = items.reduce((n, i) => n + Math.max(0, (i.snapshot.compareAtPrice ?? 0) - i.snapshot.price) * i.qty, 0);
  const count = items.reduce((n, i) => n + i.qty, 0);
  const login = () => navigate('/login?next=/checkout');

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-0">
      <div className="min-w-0 space-y-4">
        <Alert tone="info" title={t('cart.guestTitle')}>
          {t('cart.guestBody')}
        </Alert>
        {[...groups.values()].map((g) => (
          <Card key={g.store.slug} className="px-4 py-4 sm:px-5">
            <StoreHeader store={g.store} />
            <ul className="divide-y divide-border">
              {g.items.map((i) => (
                <CartLine
                  key={`${i.productId}:${i.variantId}`}
                  item={{ id: i.variantId, ...i.snapshot, qty: i.qty }}
                  onQty={(qty) => setQty(i.productId, i.variantId, qty)}
                  actions={
                    <LineAction danger onClick={() => remove(i.productId, i.variantId)}>
                      <Trash2 />
                      <span className="hidden sm:inline">{t('cart.remove')}</span>
                    </LineAction>
                  }
                />
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5 p-5">
          <h2 className="text-base font-bold text-fg">{t('cart.summary')}</h2>
          <PriceBreakdown b={{ itemsSubtotal: subtotal, shippingTotal: null, discountTotal: 0, total: subtotal, savings, count }} />
          <Button block size="lg" variant="accent" leftIcon={<LogIn className="size-4" />} className="hidden lg:inline-flex" onClick={login}>
            {t('cart.loginToCheckout')}
          </Button>
          <p className="text-center text-xs text-fg-subtle">{t('cart.guestVoucherHint')}</p>
        </Card>
      </aside>
      <CheckoutBar total={subtotal} savings={savings} cta={t('cart.loginToCheckout')} onClick={login} />
    </div>
  );
}
