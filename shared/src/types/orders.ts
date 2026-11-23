import type { OrderChannel, OrderStatus, PaymentMethod } from '../constants/orders';

export type CartIssueType = 'out_of_stock' | 'price_changed' | 'qty_reduced' | 'unavailable';

export interface CartItemDTO {
  id: string;
  productId: string;
  variantId: string;
  slug: string;
  title: string;
  image?: string;
  options: Record<string, string>;
  /** Effective unit price (flash / wholesale applied), minor units. */
  price: number;
  compareAtPrice?: number;
  qty: number;
  maxQty: number;
  selected: boolean;
  savedForLater: boolean;
  lineTotal: number;
  flash?: boolean;
}

export interface AppliedVoucherDTO {
  code: string;
  scope: 'platform' | 'store';
  type: 'percent' | 'fixed' | 'free_shipping';
  discount: number;
  valid: boolean;
  reason?: string;
}

export interface CartGroupDTO {
  store: { id: string; slug: string; name: string; logo?: string; isMall: boolean };
  items: CartItemDTO[];
  subtotal: number;
  shipping: number;
  storeDiscount: number;
  platformDiscount: number;
  total: number;
  storeVoucher?: AppliedVoucherDTO;
}

export interface CartSummaryDTO {
  itemsSubtotal: number;
  shippingTotal: number;
  discountTotal: number;
  platformVoucher?: AppliedVoucherDTO;
  /** @deprecated same value as `coinsDiscount` (minor units, not a coin count). */
  coins: number;
  /** Coin redemption discount in minor units. NOT included in `discountTotal`. */
  coinsDiscount: number;
  /** Whole coins that will be spent. */
  coinsUsed: number;
  /** = itemsSubtotal + shippingTotal − discountTotal − coinsDiscount */
  total: number;
  savings: number;
  selectedCount: number;
}

export interface CartDTO {
  groups: CartGroupDTO[];
  savedForLater: CartItemDTO[];
  summary: CartSummaryDTO;
  freeShippingProgress: { storeId: string; remaining: number; threshold: number }[];
  issues: { itemId: string; type: CartIssueType; details?: Record<string, unknown> }[];
}

export interface OrderItemDTO {
  productId: string;
  variantId: string;
  title: string;
  slug?: string;
  image?: string;
  options: Record<string, string>;
  sku: string;
  price: number;
  qty: number;
  lineTotal: number;
}

export interface OrderTimelineDTO {
  status: OrderStatus;
  at: string;
  note?: string;
}

export interface OrderDTO {
  id: string;
  number: string;
  checkoutNumber?: string;
  store: { id: string; slug: string; name: string; logo?: string };
  status: OrderStatus;
  channel: OrderChannel;
  items: OrderItemDTO[];
  subtotal: number;
  shippingFee: number;
  /** `coins`: coin redemption share (minor units). */
  discounts: { store: number; platform: number; coins?: number };
  total: number;
  payment: { method: PaymentMethod; status: string };
  shippingAddress: Record<string, unknown>;
  buyerNote?: string;
  tracking?: { courier: string; trackingNumber: string };
  timeline: OrderTimelineDTO[];
  cancel?: { by: string; reason: string; at: string };
  invoiceNumber: string;
  createdAt: string;
  /** Buyer view only: plain delivery OTP while the order is out for delivery. */
  deliveryOtp?: string;
  /** Seller view only. */
  commission?: { bps: number; amount: number };
  sellerNet?: number;
  sellerNotes?: { by: string; at: string; text: string }[];
  buyer?: { id: string; name: string };
}

export interface CheckoutDTO {
  id: string;
  number: string;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  totals: { itemsSubtotal: number; shippingTotal: number; discountTotal: number; total: number };
  orders: OrderDTO[];
  createdAt: string;
}

/** Address snapshot frozen on an order / checkout preview. */
export interface AddressSnapshotDTO {
  fullName: string;
  phone: string;
  country: string;
  city: string;
  area?: string;
  line1: string;
  line2?: string;
  postalCode?: string;
  location?: { lat: number; lng: number };
}

export interface OrderTrackingStepDTO {
  status: OrderStatus;
  done: boolean;
  at: string | null;
  current: boolean;
}

/** GET /orders/:number (buyer). */
export interface BuyerOrderDetailDTO extends OrderDTO {
  trackingSteps: OrderTrackingStepDTO[];
  canCancel: boolean;
}

export interface CheckoutPreviewStoreDTO {
  storeId: string;
  itemsSubtotal: number;
  storeDiscount: number;
  platformDiscount: number;
  shippingBase: number;
  shippingFee: number;
  coinsDiscount: number;
  total: number;
  note: string | null;
}

/** POST /checkout/preview. */
export interface CheckoutPreviewDTO extends CartDTO {
  coinsRedemption: { requested: number; used: number; discount: number; max: number };
  address: AddressSnapshotDTO;
  paymentMethod: PaymentMethod;
  paymentAvailable: boolean;
  stores: CheckoutPreviewStoreDTO[];
  canPlace: boolean;
}
