import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocalizedName, OrderDTO } from '@souqly/shared';
import { api, del, get, patch, post } from './client';

/**
 * Super Admin API hooks (docs/api-admin.md). Every list is cursor paginated (`meta.nextCursor`);
 * lists marked CSV also stream `?format=csv` (see `downloadCsv`).
 */
export const adminKey = ['admin'] as const;

type Params = Record<string, string | number | boolean | undefined | null>;
type Page<T> = { data: T[]; meta?: { nextCursor?: string | null } };

const clean = (p: Params = {}) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''));

async function page<T>(url: string, params: Params): Promise<Page<T>> {
  const res = await api.get<Page<T>>(url, { params: clean(params) });
  return res.data;
}

/** Infinite list over `/admin/<path>`. */
export function useAdminList<T>(path: string, params: Params = {}, opts: { enabled?: boolean; limit?: number } = {}) {
  return useInfiniteQuery({
    queryKey: [...adminKey, path, 'list', clean(params)],
    queryFn: ({ pageParam }) => page<T>(`/admin/${path}`, { ...params, cursor: pageParam, limit: opts.limit ?? 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}

/** Plain GET under `/admin`. The first path segment is the cache group invalidated by mutations. */
export function useAdminGet<T>(path: string, params?: Params, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: [...adminKey, path.split('/')[0], 'get', path, clean(params)],
    queryFn: () => get<T>(`/admin/${path}`, { params: clean(params) }),
    enabled: opts.enabled ?? true,
    refetchInterval: opts.refetchInterval,
    placeholderData: keepPreviousData,
  });
}

type Method = 'post' | 'put' | 'patch' | 'delete';
/**
 * Generic admin mutation. `invalidate` lists cache groups (first path segment, e.g. 'stores')
 * refreshed on success; the dashboard is always refreshed because its queue counts move.
 */
export function useAdminMutation<TBody = unknown, TRes = unknown>(method: Method, invalidate: string[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: TBody }) => {
      const url = `/admin/${path}`;
      if (method === 'post') return post<TRes>(url, body);
      if (method === 'patch') return patch<TRes>(url, body);
      if (method === 'delete') return del<TRes>(url);
      const res = await api.put<{ data: TRes }>(url, body);
      return res.data?.data as TRes;
    },
    onSuccess: () => {
      for (const g of [...invalidate, 'dashboard']) void qc.invalidateQueries({ queryKey: [...adminKey, g] });
    },
  });
}

/** Downloads `GET /admin/<path>?format=csv` through the authenticated axios client. */
export async function downloadCsv(path: string, params: Params = {}, filename = `${path.replace(/\//g, '-')}.csv`) {
  const res = await api.get<Blob>(`/admin/${path}`, { params: { ...clean(params), format: 'csv' }, responseType: 'blob', timeout: 120_000 });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Multipart image upload for CMS slides / banners. */
export function useCmsUpload() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return post<{ url: string; key: string }>('/admin/cms/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 });
    },
  });
}

/** Ends an impersonated session (works from the marketplace too) and returns to a fresh admin session. */
export function useStopImpersonation() {
  return useMutation({
    mutationFn: async () => {
      try {
        await post<{ id: string }>('/admin/impersonation/stop');
        return '/admin/users';
      } catch (err) {
        // The admin session could not be restored: still end the impersonated session, then sign in again.
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status !== 401 && status !== 403) throw err;
        await post('/auth/logout').catch(() => undefined);
        return '/login?next=%2Fadmin%2Fusers';
      }
    },
    // Full reload: every cached query belongs to the impersonated user.
    onSuccess: (to) => window.location.assign(to),
  });
}

// ---------------- DTOs ----------------
export type AdminDashboard = {
  range: { from: string; to: string };
  totals: { gmv: number; commission: number; orders: number; users: number; newSignups: number; stores: Record<string, number> };
  series: { date: string; gmv: number; orders: number; commission: number; signups: number }[];
  top: {
    stores: { id: string; name: string; slug: string; gmv: number; orders: number }[];
    products: { id: string; title: string; revenue: number; qty: number }[];
    categories: { id: string; name: LocalizedName; slug: string; revenue: number }[];
  };
  pending: Record<'stores' | 'products' | 'returns' | 'disputes' | 'reports' | 'tickets' | 'payouts' | 'mallRequests' | 'fraudSignals', number>;
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'blocked' | 'deleted';
  platformRole: string | null;
  isSeller: boolean;
  walletBalance: number;
  coins: number;
  createdAt: string;
  lastLoginAt: string | null;
};
export type AdminUserDetail = AdminUserRow & {
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  referralCode: string;
  orders: { count: number; totalSpent: number; recent: { id: string; number: string; status: string; total: number; createdAt: string }[] };
  stores: { id: string; name: string; slug: string; status: string | null; role: string; memberStatus: string }[];
  activeSessions: number;
};

export type AdminStoreRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isMall: boolean;
  mallRequested: boolean;
  plan: string;
  ownerId: string;
  productCount: number;
  ratingAvg: number;
  followerCount: number;
  logo: string | null;
  createdAt: string;
  approvedAt: string | null;
};
export type AdminStoreDetail = AdminStoreRow & {
  tagline: string | null;
  description: string | null;
  contact?: { email?: string; phone?: string; whatsapp?: string };
  address?: Record<string, string>;
  rejectionReason: string | null;
  suspension: { reason: string; at: string } | null;
  owner: { id: string; name: string; email: string | null; phone: string | null; status: string } | null;
  members: number;
  stats: { gmv: number; orders: number };
  commissionOverrideBps: number | null;
  hasBusinessInfo: boolean;
};

export type AdminProductRow = {
  id: string;
  storeId: string;
  storeName: string | null;
  title: string;
  slug: string;
  status: string;
  moderationNote: string | null;
  priceMin: number;
  priceMax: number;
  totalStock: number;
  image: string | null;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AttributeDef = {
  key: string;
  label: LocalizedName;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'color';
  options?: string[];
  filterable: boolean;
  variantDefining: boolean;
  unit?: string;
};
export type AdminCategory = {
  id: string;
  slug: string;
  name: LocalizedName;
  parentId: string | null;
  ancestors: string[];
  icon?: string;
  image: string | null;
  color: string | null;
  order: number;
  isActive: boolean;
  commissionBps: number | null;
  attributes: AttributeDef[];
  productCount: number;
};
export type AdminBrand = { id: string; name: string; slug: string; logo: string | null; description: string | null; isFeatured: boolean };

export type AdminOrderRow = OrderDTO & { buyerId: string };
export type AdminOrderDetail = OrderDTO & {
  buyerContact: { id: string; name: string; email: string | null; phone: string | null } | null;
  coinsUsed: number;
  adminRefunded: number;
  return: { id: string; status: string; refundAmount: number; disputeId: string | null } | null;
};

export type AdminReturnRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  storeId: string;
  buyerId: string;
  status: string;
  reason: string;
  items: { title: string; qty: number; price: number }[];
  refund: { method: string; amount: number; at: string | null };
  disputeId: string | null;
  createdAt: string;
};
export type AdminDisputeRow = {
  id: string;
  returnId: string | null;
  orderId: string;
  buyerId: string;
  storeId: string;
  status: 'open' | 'resolved';
  resolution: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
};
export type AdminDisputeDetail = AdminDisputeRow & {
  messages: { by: string; actor: string; text: string; at: string }[];
  return: (AdminReturnRow & { description: string | null; photos: string[]; timeline: { status: string; at: string; actor: string; note: string | null }[] }) | null;
  order: { number: string; status: string; total: number; payment: { method: string; status: string } } | null;
  buyer: { id: string; name: string } | null;
  store: { id: string; name: string; slug: string } | null;
};

export type AdminCampaign = {
  id: string;
  slug: string;
  name: string;
  theme?: string;
  banner?: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  landing?: { headline?: string; subheadline?: string; body?: string; heroImage?: string };
  productIds?: string[];
};
export type AdminFlashSale = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  items: { productId: string; variantId?: string; flashPrice: number; quantityLimit: number; sold?: number }[];
};
export type AdminVoucher = {
  id: string;
  code: string;
  title?: string;
  type: 'percent' | 'fixed' | 'free_shipping';
  value: number;
  minSpend: number;
  maxDiscount?: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number;
  perUserLimit: number;
  usedCount?: number;
  isActive: boolean;
};
export type AdminGiftCard = { id: string; code: string; amount: number; balance: number; expiresAt: string | null; status?: string; redeemedBy?: string | null; createdAt?: string };

export type HeroSlide = { image: string; title: string; subtitle?: string; ctaText?: string; ctaLink?: string; theme?: string };
export type HomeSectionType = 'trending' | 'new_arrivals' | 'top_rated' | 'best_sellers' | 'mall' | 'top_stores' | 'campaign';
export type HomeSection = { type: HomeSectionType; title: string; enabled: boolean; config: Record<string, string | number | boolean | string[]> };
export type HomeContent = { heroSlides: HeroSlide[]; sections: HomeSection[]; featured: { productIds: string[]; storeIds: string[]; categoryIds: string[] } };
export type CmsPage = { id: string; slug: string; title: LocalizedName; body: LocalizedName; published: boolean; updatedAt: string | null };

export type CommissionRule = { id: string; scope: 'global' | 'category' | 'store'; categoryId: string | null; storeId: string | null; bps: number; isActive: boolean };
export type AdminPayout = {
  id: string;
  storeId: string;
  storeName: string | null;
  amount: number;
  status: 'requested' | 'approved' | 'paid' | 'rejected';
  method: Record<string, string>;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  rejectedAt: string | null;
};
export type FinanceRow = { period: string; gmv: number; commission: number; orders: number; refunds: number; payouts: number };
export type FinanceReport = { from: string; to: string; groupBy: 'day' | 'month'; rows: FinanceRow[]; totals: Omit<FinanceRow, 'period'> };

export type AdminReview = {
  id: string;
  productId: string;
  storeId: string;
  buyerId: string;
  rating: number;
  title: string | null;
  body: string | null;
  media: { type: string; url: string }[];
  verified: boolean;
  status: 'published' | 'pending' | 'hidden';
  flags: string[];
  reportCount: number;
  createdAt: string;
};
export type AdminReport = {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  storeId: string | null;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  resolution: { by: string; at: string; note: string | null } | null;
  createdAt: string;
};
export type FraudSignal = { id: string; type: string; refType: string; refId: string; score: number; details: Record<string, unknown>; status: string; createdAt: string };

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketSummary = {
  id: string;
  subject: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  orderId: string | null;
  userId?: string;
  assigneeId?: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  messageCount: number;
  lastSide: 'user' | 'staff' | null;
};
export type TicketMessage = { side: 'user' | 'staff'; body: string; attachments: { url: string }[]; at: string; author: string | null; authorId?: string };
export type TicketDetail = Omit<TicketSummary, 'messageCount' | 'lastSide'> & {
  messages: TicketMessage[];
  user?: { id: string; name: string; email: string | null } | null;
};

export type EmailTemplateRow = {
  key: string;
  description: string;
  variables: string[];
  defaultSubject: string;
  override: { subject: string; html: string; updatedAt: string | null } | null;
};

export type SiteSettings = {
  name: string;
  tagline: string;
  logoUrl?: string;
  primaryColor?: string;
  seo: { title?: string; description?: string; keywords?: string };
  maintenance: boolean;
  maintenanceMessage?: string;
  announcement?: { text: string; link?: string; tone: 'info' | 'promo' | 'warning' };
  social: Partial<Record<'facebook' | 'instagram' | 'x' | 'youtube' | 'tiktok', string>>;
  supportEmail?: string;
  supportPhone?: string;
};
export type PaymentToggles = { cod: boolean; jazzcash: boolean; easypaisa: boolean; stripe: boolean; wallet: boolean };
export type ShippingZone = { name: string; cities: string[]; fee: number; freeAbove?: number; etaDays: number };
export type TaxSettings = { display: 'inclusive' | 'exclusive'; rates: { country: string; bps: number }[] };

export type StaffRow = { id: string; name: string; email: string | null; platformRole: string; status: string; twoFactorEnabled: boolean; lastLoginAt: string | null; createdAt: string };
export type AuditRow = {
  id: string;
  action: string;
  actorId: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  storeId: string | null;
  ip: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};
export type SystemHealth = {
  uptimeSeconds: number;
  node: string;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  db: { status: 'connected' | 'disconnected'; inMemory: boolean; collections: Record<string, number> };
  integrations: Record<string, boolean>;
  jobs: { name: string; registered: string[]; periodic: string[]; scheduled: number; completed: number; failed: number; lastError?: { job: string; at: string } };
  recentErrors: { at: string; method: string; path: string; status: number; code: string; message: string }[];
};

// ---------------- public CMS + buyer support ----------------
export type PublicCmsPage = { slug: string; title: LocalizedName; body: LocalizedName; updatedAt: string | null };

/** Published CMS page, or `null` when none exists (pages then fall back to their built-in copy). */
export function usePublicPage(slug: string | undefined) {
  return useQuery({
    queryKey: ['pages', slug],
    queryFn: async () => {
      try {
        return await get<PublicCmsPage>(`/pages/${slug}`);
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 404 || status === 400) return null;
        throw err;
      }
    },
    enabled: !!slug,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

const supportKey = ['support', 'tickets'] as const;
export function useMyTickets() {
  return useInfiniteQuery({
    queryKey: [...supportKey, 'list'],
    queryFn: ({ pageParam }) => page<TicketSummary>('/support/tickets', { cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
}
export function useMyTicket(id: string | undefined) {
  return useQuery({ queryKey: [...supportKey, id], queryFn: () => get<TicketDetail>(`/support/tickets/${id}`), enabled: !!id, refetchInterval: 30_000 });
}
export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { subject: string; category: string; body: string; orderNumber?: string }) => post<TicketDetail>('/support/tickets', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: supportKey }),
  });
}
export function useReplyTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => post<TicketDetail>(`/support/tickets/${id}/messages`, { body }),
    onSuccess: (t) => {
      qc.setQueryData([...supportKey, id], t);
      void qc.invalidateQueries({ queryKey: [...supportKey, 'list'] });
    },
  });
}
