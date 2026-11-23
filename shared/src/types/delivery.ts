import type { OrderStatus } from '../constants/orders';
import type { DeliveryFailReason, ReturnReason, ReturnStatus } from '../schemas/delivery';

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  data?: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RiderMeDTO {
  user: { id: string; name: string };
  stores: { id: string; name: string; slug: string; riderFee: number }[];
  stats: { todayDeliveries: number; codCollectedToday: number; codOutstanding: number; earningsToday: number; earningsTotal: number };
}

export interface RiderDeliveryDTO {
  orderId: string;
  number: string;
  status: OrderStatus;
  store: { id: string; name: string };
  buyer: { name: string; phone: string };
  address: { line1: string; line2?: string; area?: string; city: string; postalCode?: string };
  location: GeoPoint | null;
  codAmount: number;
  itemsCount: number;
  total: number;
  createdAt: string;
  startedAt?: string;
  deliveredAt?: string;
  failReason?: DeliveryFailReason;
  otpLockedUntil?: string;
  otpAttemptsLeft: number;
  canStart: boolean;
  canDeliver: boolean;
  canFail: boolean;
}

export interface RiderCodDTO {
  stores: { storeId: string; storeName: string; collected: number; settled: number; outstanding: number }[];
  entries: { id: string; storeId: string; type: 'collected' | 'settled'; amount: number; orderNumber?: string; at: string }[];
}

export interface SellerRiderDTO {
  memberId: string;
  user: { id: string; name: string; phone?: string };
  role: string;
  activeDeliveries: number;
  deliveredTotal: number;
  codOutstanding: number;
  earnings: number;
}

export interface OrderTrackingDTO {
  number: string;
  status: OrderStatus;
  active: boolean;
  rider: { name: string; phone: string } | null;
  lastLocation: (GeoPoint & { at: string }) | null;
  eta: number | null;
  destination: { city: string; area?: string; location?: GeoPoint };
}

export interface RiderLocationEvent extends GeoPoint {
  orderId: string;
  at: string;
  eta: number | null;
}

export interface ReturnRequestDTO {
  id: string;
  order: { id: string; number: string; status: OrderStatus };
  store: { id: string; name: string };
  buyer?: { id: string; name: string };
  items: { variantId: string; title: string; image?: string; options: Record<string, string>; price: number; qty: number; reason?: ReturnReason }[];
  reason: ReturnReason;
  description: string;
  photos: string[];
  status: ReturnStatus;
  refund: { method: 'wallet' | 'original'; amount: number; at?: string };
  timeline: { status: ReturnStatus; at: string; actor: string; note?: string }[];
  sellerNote?: string;
  disputeId?: string;
  createdAt: string;
}
