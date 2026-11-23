import { useNavigate } from 'react-router-dom';
import { useIsMutating } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bookmark, ShoppingCart, Trash2 } from 'lucide-react';
import type { CartDTO, CartItemDTO } from '@souqly/shared';
import { allCartItems, useRemoveCartItem, useSelectAll, useSelectMany, useUpdateCartItem } from '@/api/cart';
import { getErrorMessage } from '@/api/client';
import { Alert, Button, Card, Checkbox } from '@/components/ui';
import { money } from '@/lib/format';
import { CartLine, LineAction } from './CartLine';
import { CheckoutBar } from './CheckoutBar';
import { EmptyCart } from './EmptyCart';
import { FreeShippingBar } from './FreeShippingBar';
import { PriceBreakdown } from './PriceBreakdown';
import { StoreHeader } from './StoreHeader';
import { VoucherInput } from './VoucherInput';

type Issue = CartDTO['issues'][number];

export function useIssueText() {
  const { t } = useTranslation();
  return (issue?: Issue) => {
    if (!issue) return undefined;
    const from = issue.details?.from;
    const to = issue.details?.to;
    if (issue.type === 'price_changed' && typeof from === 'number' && typeof to === 'number')
      return t('cart.issues.price_changed_detail', { from: money(from), to: money(to) });
    if (issue.type === 'qty_reduced' && typeof to === 'number') return t('cart.issues.qty_reduced_detail', { to });
    return t(`cart.issues.${issue.type}`);
  };
}

export function ServerCart({ cart }: { cart: CartDTO }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const busy = useIsMutating() > 0;
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const selectAll = useSelectAll();
  const selectMany = useSelectMany();
  const issueText = useIssueText();

  const items = allCartItems(cart);
  if (!items.length && !cart.savedForLater.length) return <EmptyCart />;

  const issues = new Map(cart.issues.map((i) => [i.itemId, i]));
  const selectable = items.filter((i) => i.maxQty > 0);
  const allSelected = selectable.length > 0 && selectable.every((i) => i.selected);
  const progress = new Map(cart.freeShippingProgress.map((p) => [p.storeId, p]));
  const s = cart.summary;
  const onError = (e: unknown) => toast.error(getErrorMessage(e));

  const lineActions = (i: CartItemDTO) => (
    <>
      <LineAction disabled={busy} onClick={() => update.mutate({ id: i.id, savedForLater: true }, { onError, onSuccess: () => toast.success(t('cart.savedToast')) })}>
        <Bookmark />
        <span className="hidden sm:inline">{t('cart.saveForLater')}</span>
      </LineAction>
      <LineAction danger disabled={busy} onClick={() => remove.mutate(i.id, { onError })}>
        <Trash2 />
        <span className="hidden sm:inline">{t('cart.remove')}</span>
      </LineAction>
    </>
  );

  const goCheckout = () => navigate('/checkout');

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-0">
      <div className="min-w-0 space-y-4">
        {cart.issues.length > 0 && (
          <Alert tone="warning" title={t('cart.issuesTitle')}>
            {t('cart.issuesBody')}
          </Alert>
        )}

        {items.length > 0 && (
          <Card className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <Checkbox
              checked={allSelected}
              disabled={busy || !selectable.length}
              onChange={(e) => selectAll.mutate(e.target.checked, { onError })}
              label={<span className="text-sm font-semibold">{t('cart.selectAll', { count: selectable.length })}</span>}
            />
            <span className="text-xs text-fg-subtle">{t('cart.selectedCount', { count: s.selectedCount })}</span>
          </Card>
        )}

        {cart.groups.map((g) => {
          const groupSelectable = g.items.filter((i) => i.maxQty > 0);
          const groupAll = groupSelectable.length > 0 && groupSelectable.every((i) => i.selected);
          const p = progress.get(g.store.id);
          return (
            <Card key={g.store.id} className="px-4 py-4 sm:px-5">
              <StoreHeader
                store={g.store}
                lead={
                  <Checkbox
                    checked={groupAll}
                    disabled={busy || !groupSelectable.length}
                    aria-label={t('cart.selectStore', { store: g.store.name })}
                    onChange={(e) =>
                      selectMany.mutate({ ids: groupSelectable.map((i) => i.id), selected: e.target.checked }, { onError })
                    }
                  />
                }
                trailing={
                  g.shipping > 0 ? (
                    <span className="text-xs text-fg-subtle">{t('cart.shippingN', { amount: money(g.shipping) })}</span>
                  ) : g.subtotal > 0 ? (
                    <span className="text-xs font-semibold text-success">{t('cart.freeShipping')}</span>
                  ) : null
                }
              />
              {p && <FreeShippingBar remaining={p.remaining} threshold={p.threshold} />}
              <ul className="divide-y divide-border">
                {g.items.map((i) => (
                  <CartLine
                    key={i.id}
                    item={i}
                    selected={i.selected}
                    disabled={busy}
                    onSelect={(selected) => update.mutate({ id: i.id, selected }, { onError })}
                    onQty={(qty) => update.mutate({ id: i.id, qty }, { onError })}
                    issue={issueText(issues.get(i.id))}
                    actions={lineActions(i)}
                  />
                ))}
              </ul>
              <div className="mt-1 border-t border-border pt-3">
                <VoucherInput applied={g.storeVoucher} placeholder={t('cart.storeVoucherPlaceholder')} />
              </div>
            </Card>
          );
        })}

        {cart.savedForLater.length > 0 && (
          <Card className="px-4 py-4 sm:px-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-fg">
              <Bookmark className="size-4 text-primary-700" aria-hidden />
              {t('cart.savedTitle', { count: cart.savedForLater.length })}
            </h2>
            <ul className="divide-y divide-border">
              {cart.savedForLater.map((i) => (
                <CartLine
                  key={i.id}
                  item={i}
                  muted={i.maxQty <= 0}
                  actions={
                    <>
                      <LineAction disabled={busy || i.maxQty <= 0} onClick={() => update.mutate({ id: i.id, savedForLater: false }, { onError })}>
                        <ShoppingCart />
                        {t('cart.moveToCart')}
                      </LineAction>
                      <LineAction danger disabled={busy} onClick={() => remove.mutate(i.id, { onError })}>
                        <Trash2 />
                        <span className="sr-only sm:not-sr-only">{t('cart.remove')}</span>
                      </LineAction>
                    </>
                  }
                />
              ))}
            </ul>
          </Card>
        )}
      </div>

      {items.length > 0 && (
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-5 p-5">
            <h2 className="text-base font-bold text-fg">{t('cart.summary')}</h2>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t('cart.platformVoucher')}</p>
              <VoucherInput applied={s.platformVoucher} placeholder={t('cart.platformVoucherPlaceholder')} />
            </div>
            <PriceBreakdown
              b={{ itemsSubtotal: s.itemsSubtotal, shippingTotal: s.shippingTotal, discountTotal: s.discountTotal, total: s.total, savings: s.savings, count: s.selectedCount }}
            />
            <Button block size="lg" variant="accent" className="hidden lg:inline-flex" disabled={!s.selectedCount} onClick={goCheckout}>
              {t('cart.checkoutN', { count: s.selectedCount })}
            </Button>
            <p className="text-center text-xs text-fg-subtle">{t('cart.shippingNote')}</p>
          </Card>
        </aside>
      )}

      {items.length > 0 && (
        <CheckoutBar total={s.total} savings={s.savings} cta={t('cart.checkoutN', { count: s.selectedCount })} disabled={!s.selectedCount} onClick={goCheckout} />
      )}
    </div>
  );
}
