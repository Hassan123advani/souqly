/** Lifecycle of a sub-order (one store's part of a checkout). */
export const ORDER_STATUSES = [
  'pending_payment',
  'placed',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'failed_delivery',
  'return_requested',
  'returned',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed transitions. Anything not listed is rejected by the server. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['placed', 'cancelled'],
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered', 'failed_delivery'],
  out_for_delivery: ['delivered', 'failed_delivery'],
  failed_delivery: ['out_for_delivery', 'cancelled'],
  delivered: ['return_requested'],
  return_requested: ['returned', 'delivered'],
  returned: ['refunded'],
  refunded: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** The happy-path steps shown on the buyer's tracking timeline. */
export const TRACKING_STEPS: OrderStatus[] = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

/** Buyer "My Orders" tabs and which statuses fall in each. */
export const BUYER_ORDER_TABS = {
  to_pay: ['pending_payment'],
  to_ship: ['placed', 'confirmed', 'packed'],
  to_receive: ['shipped', 'out_for_delivery', 'failed_delivery'],
  delivered: ['delivered'],
  cancelled: ['cancelled'],
  returns: ['return_requested', 'returned', 'refunded'],
} as const satisfies Record<string, readonly OrderStatus[]>;

export const PAYMENT_METHODS = ['cod', 'jazzcash', 'easypaisa', 'stripe', 'wallet'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_CHANNELS = ['online', 'pos'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const STORE_STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const PRODUCT_STATUSES = ['draft', 'pending_review', 'published', 'rejected', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
