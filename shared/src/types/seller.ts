import type { StoreLayout, StorePlan, StoreSectionType } from '../schemas/catalog';
import type { StoreStatus } from '../constants/orders';
import type { StoreRole } from '../constants/roles';
import type { StockMovementReason } from '../schemas/seller';

/** Phase 5 Seller Center DTOs (docs/api-seller-orders.md). */

export type SlugAvailability = { available: boolean; reason?: 'invalid' | 'reserved' | 'taken'; suggestion?: string };

export type OnboardingChecklist = { logo: boolean; banner: boolean; firstProduct: boolean; policies: boolean; payout: boolean; shipping: boolean };

export type MaskedBusiness = {
  type: 'individual' | 'company';
  legalName: string;
  /** Always masked, e.g. `****1234`. */
  cnicOrRegNo: string;
  ntn?: string;
  idDocument?: { url: string };
};

export type MaskedPayout = {
  method: 'bank' | 'jazzcash' | 'easypaisa';
  accountTitle: string;
  /** Always masked, e.g. `****1234`. */
  accountNumber: string;
  bankName?: string;
  iban?: string;
};

export type SellerStore = {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  logo?: { url: string; key: string };
  banner?: { url: string; key: string };
  themeColor: string;
  categoryIds: string[];
  status: StoreStatus;
  rejectionReason?: string;
  isMall: boolean;
  mallRequested: boolean;
  contact: { email?: string; phone?: string; whatsapp?: string };
  address: { line1?: string; area?: string; city?: string; country?: string; postalCode?: string };
  policies: { shipping?: string; returns?: string; warranty?: string };
  seo: { title?: string; description?: string };
  layoutTemplate: StoreLayout;
  sections: { type: StoreSectionType; title?: string; config: Record<string, unknown> }[];
  holidayMode: { enabled: boolean; message?: string; until?: string };
  plan: StorePlan;
  healthScore: number;
  slugChangedAt?: string;
  business?: MaskedBusiness;
  payout?: MaskedPayout;
  checklist: OnboardingChecklist;
  /** The caller's role and permissions in this store. */
  myRole: StoreRole;
  myPermissions: string[];
  createdAt: string;
};

export type KpiValue = { value: number; previous: number; deltaPct: number | null };

export type SellerDashboard = {
  range: '7d' | '30d' | '90d';
  kpis: { sales: KpiValue; orders: KpiValue; visitors: KpiValue; conversion: KpiValue; avgOrderValue: KpiValue };
  salesSeries: { date: string; sales: number; orders: number }[];
  todo: { toConfirm: number; toPack: number; toShip: number; returnRequests: number; lowStock: number; unansweredQuestions: number; unreadChats: number };
  healthScore: { score: number; factors: { key: string; value: number; weight: number }[] };
  recentOrders: { id: string; number: string; status: string; total: number; itemCount: number; createdAt: string }[];
};

export type InventoryRow = {
  productId: string;
  variantId: string;
  title: string;
  slug: string;
  image?: string;
  sku: string;
  options: Record<string, string>;
  stock: number;
  reserved: number;
  available: number;
  lowStock: boolean;
  warehouseStock: { warehouseId: string; qty: number }[];
};

export type StockMovementDTO = {
  id: string;
  productId: string;
  variantId: string;
  warehouseId?: string;
  delta: number;
  reason: StockMovementReason;
  note?: string;
  ref?: { type: 'order' | 'pos' | 'adjustment'; id?: string };
  actorId?: string;
  balanceAfter: number;
  createdAt: string;
};

export type WarehouseDTO = {
  id: string;
  name: string;
  address: { line1?: string; area?: string; city: string; postalCode?: string };
  isDefault: boolean;
};

export type StaffMemberDTO = {
  id: string;
  user: { id: string; name: string; email?: string; avatar?: string };
  role: StoreRole;
  customRole?: { id: string; name: string };
  status: 'active' | 'invited' | 'disabled';
  createdAt: string;
};

export type StoreInvitationDTO = {
  id: string;
  store: { id: string; name: string; slug: string; logo?: string };
  role: StoreRole;
  customRole?: { id: string; name: string };
  createdAt: string;
};

export type CustomRoleDTO = { id: string; name: string; permissions: string[]; memberCount: number };

export type ActivityEntry = { id: string; action: string; actor?: { id: string; name: string }; targetType?: string; targetId?: string; meta: Record<string, unknown>; createdAt: string };

export type ShippingZone = { name: string; cities: string[] | 'all'; rate: number; freeAbove?: number; etaDays: [number, number] };
export type ShippingSettings = { zones: ShippingZone[]; processingDays: number };
export type NotificationSettings = { newOrderEmail: boolean; newOrderSound: boolean; lowStockEmail: boolean; lowStockThreshold: number };
export type ChatSettings = { quickReplies: string[]; autoReply: { enabled: boolean; message: string } };
