import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CartDTO, CartItemDTO, CheckoutDTO, PaymentMethod } from '@souqly/shared';
import { del, get, patch, post } from './client';

export const cartKey = ['cart'] as const;

/** Units in the active (not saved-for-later) part of a server cart. */
export function cartUnits(cart: CartDTO | undefined): number {
  return cart?.groups.reduce((n, g) => n + g.items.reduce((m, i) => m + i.qty, 0), 0) ?? 0;
}

export function allCartItems(cart: CartDTO): CartItemDTO[] {
  return cart.groups.flatMap((g) => g.items);
}

/** Server cart of the signed-in user. `enabled` is false for guests and until the guest cart is merged. */
export function useServerCart(enabled: boolean) {
  return useQuery({ queryKey: cartKey, queryFn: () => get<CartDTO>('/cart'), enabled, staleTime: 30_000 });
}

function useCartMutation<V>(fn: (v: V) => Promise<CartDTO>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart) => qc.setQueryData(cartKey, cart),
    onError: () => qc.invalidateQueries({ queryKey: cartKey }),
  });
}

export function useUpdateCartItem() {
  return useCartMutation(({ id, ...body }: { id: string; qty?: number; selected?: boolean; savedForLater?: boolean }) =>
    patch<CartDTO>(`/cart/items/${id}`, body),
  );
}

export function useRemoveCartItem() {
  return useCartMutation((id: string) => del<CartDTO>(`/cart/items/${id}`));
}

export function useSelectAll() {
  return useCartMutation((selected: boolean) => post<CartDTO>('/cart/select-all', { selected }));
}

/** Select / unselect several lines (one store). The API has no bulk endpoint, so lines are patched in turn. */
export function useSelectMany() {
  return useCartMutation(async ({ ids, selected }: { ids: string[]; selected: boolean }) => {
    let cart: CartDTO | undefined;
    for (const id of ids) cart = await patch<CartDTO>(`/cart/items/${id}`, { selected });
    return cart ?? get<CartDTO>('/cart');
  });
}

export function useApplyVoucher() {
  return useCartMutation((code: string) => post<CartDTO>('/cart/vouchers', { code }));
}

export function useRemoveVoucher() {
  return useCartMutation((code: string) => del<CartDTO>(`/cart/vouchers/${encodeURIComponent(code)}`));
}

/** Imperative helpers used by the cart store (outside React). */
export async function serverAddItem(qc: QueryClient, item: { productId: string; variantId: string; qty: number }) {
  const cart = await post<CartDTO>('/cart/items', item);
  qc.setQueryData(cartKey, cart);
}

export async function serverMerge(qc: QueryClient, items: { productId: string; variantId: string; qty: number }[]) {
  const cart = await post<CartDTO>('/cart/merge', { items });
  qc.setQueryData(cartKey, cart);
}

// ---- Checkout ----
export type CheckoutAddressSnapshot = {
  label?: string;
  fullName: string;
  phone: string;
  country?: string;
  city: string;
  area?: string;
  line1: string;
  line2?: string;
  postalCode?: string;
};

export type CheckoutPreview = CartDTO & {
  address: CheckoutAddressSnapshot;
  paymentMethod: PaymentMethod;
  paymentAvailable: boolean;
  canPlace: boolean;
  /** Coin redemption quote (Phase 8): `max` = most coins usable (20% cap + balance). */
  coinsRedemption?: { requested: number; used: number; discount: number; max: number };
  stores: {
    storeId: string;
    itemsSubtotal: number;
    storeDiscount: number;
    platformDiscount: number;
    shippingBase: number;
    shippingFee: number;
    total: number;
    note: string | null;
  }[];
};

export function useCheckoutPreview(addressId: string | undefined, paymentMethod: PaymentMethod, coins = 0) {
  return useQuery({
    queryKey: ['checkout', 'preview', addressId, paymentMethod, coins],
    queryFn: () => post<CheckoutPreview>('/checkout/preview', { addressId, paymentMethod, ...(coins > 0 ? { coins } : {}) }),
    enabled: !!addressId,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { addressId: string; paymentMethod: PaymentMethod; notes?: Record<string, string>; idempotencyKey: string; coins?: number }) =>
      post<CheckoutDTO>('/checkout', body),
    onSuccess: (checkout) => {
      qc.setQueryData(['checkout', checkout.number], checkout);
      void qc.invalidateQueries({ queryKey: cartKey });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useCheckout(number: string) {
  return useQuery({ queryKey: ['checkout', number], queryFn: () => get<CheckoutDTO>(`/checkout/${encodeURIComponent(number)}`) });
}
