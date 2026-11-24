import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type {
  BundleInput,
  PlanFeature,
  PosSaleInput,
  PromotionInput,
  SellerFlashDealInput,
  SellerVoucherInput,
} from '@souqly/shared';
import { useActiveStoreId } from '@/components/seller/useActiveStore';
import { api, get } from './client';
import { cfg, sc, useSc, useSellerKey } from './seller';

/** Phase 10 seller growth API (docs/api-growth.md): marketing, analytics, POS, CSV, plan features, health, affiliate. */

// ---------------------------------------------------------------------------------------------
// DTOs (mirrors of the server responses; request bodies come from @souqly/shared)
// ---------------------------------------------------------------------------------------------

export type StoreVoucher = {
  id: string;
  code: string;
  title: string | null;
  type: 'percent' | 'fixed' | 'free_shipping';
  /** Basis points for `percent`, minor units for `fixed`. */
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  startsAt: string;
  endsAt: string;
  usageLimit: number;
  perUserLimit: number;
  usedCount: number;
  followerOnly: boolean;
  productIds: string[];
  categoryIds: string[];
  isActive: boolean;
};
export type StoreFlashDeal = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  items: { productId: string; variantId: string | null; price: number; quantityLimit: number; sold: number }[];
};
export type StoreBundle = {
  id: string;
  name: string;
  bundlePrice: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  items: { productId: string; variantId: string | null; qty: number }[];
};
export type StorePromotion = {
  id: string;
  type: 'bxgy';
  name: string;
  buy: { productIds: string[]; qty: number };
  get: { productIds: string[]; qty: number; discountBps: number };
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};
export type NominationStatus = 'pending' | 'approved' | 'rejected';
export type SellerCampaign = {
  id: string;
  slug: string;
  name: string;
  banner: string | null;
  startsAt: string;
  endsAt: string;
  description: string | null;
  nominations: { id: string; productId: string; campaignPrice: number; status: NominationStatus; note: string | null; createdAt: string }[];
};

export type AnalyticsRange = '7d' | '30d' | '90d';
export type AnalyticsReport = {
  range: AnalyticsRange;
  from: string;
  to: string;
  series: { date: string; sales: number; orders: number; units: number }[];
  funnel: { visits: number; productViews: number; addToCart: number; orders: number };
  topProducts: { productId: string; title: string; revenue: number; units: number; views: number; conversion: number }[];
  traffic: { source: string; views: number }[];
  customers: { new: number; returning: number };
  channels?: { online: number; pos: number };
};

/** `GET /seller/plan`: only the acting store's plan features are read (for gating). */
export type PlanSummary = {
  plan: string;
  definition: { id: string; name: string; features: Partial<Record<PlanFeature, boolean>> };
};

export type StoreHealth = {
  score: number;
  factors: { key: string; value: number; weight: number }[];
  recommendations: string[];
  computedAt: string;
};

export type ImportRowError = { row: number; field?: string; code: string; message: string };
export type ImportResult = { dryRun: boolean; rows: number; created: number; updated: number; productsCreated: number; errors: ImportRowError[] };

export type PosCatalogRow = {
  productId: string;
  variantId: string;
  title: string;
  options: Record<string, string>;
  sku: string;
  barcode: string | null;
  price: number;
  stock: number;
  image: string | null;
  isActive: boolean;
  updatedAt: string;
};
/** A POS sale as queued/sent (JSON: `createdAt` is an ISO string; validated with posSaleSchema). */
export type PosSaleBody = Omit<PosSaleInput, 'createdAt'> & { createdAt: string };
export type PosSaleResult = {
  clientId: string;
  status: 'created' | 'duplicate' | 'error';
  orderId?: string;
  number?: string;
  stockConflict?: boolean;
  error?: { code: string; message: string };
};
export type PosReceiptBody = {
  receiptNumber: string;
  number: string;
  at: string;
  items: { title: string; options: Record<string, string>; qty: number; price: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  payments: { method: 'cash' | 'card' | 'wallet'; amount: number }[];
  change: number;
};
export type PosReceipt = PosReceiptBody & {
  store: { name: string; address: string; phone: string | null };
  customer: { phone?: string; name?: string } | null;
  stockConflict: boolean;
  digitalReceiptUrl: string;
  qr: string;
};
export type PublicReceipt = PosReceiptBody & { store: { name: string; slug: string } };
export type PosShift = {
  id: string;
  status: 'open' | 'closed';
  openedBy: string;
  openingCash: number;
  openedAt: string;
  closedAt: string | null;
  countedCash: number | null;
  expectedCash: number | null;
  variance: number | null;
  cashSales: number | null;
  cashRefunds: number | null;
  salesCount: number | null;
  salesTotal: number | null;
};

export type AffiliateCommission = { id: string; orderNumber: string; amount: number; status: 'pending' | 'credited' | 'void'; createdAt: string };

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
/** Absolute-ish URL of a public API resource (share images). */
export const publicApiUrl = (path: string) => `${apiBase}/api/v1${path}`;

/** Blob error bodies (responseType 'blob') are turned back into JSON so getErrorMessage() can read the code. */
async function rethrowBlobError(err: unknown): Promise<never> {
  if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
    try {
      err.response.data = JSON.parse(await err.response.data.text());
    } catch {
      // keep the original body
    }
  }
  throw err;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Store-scoped authenticated file download (CSV / PDF). */
export async function downloadStoreFile(sid: string | undefined, url: string, params: Record<string, string>, fallbackName: string) {
  try {
    const res = await api.get<Blob>(url, cfg(sid, { params, responseType: 'blob', timeout: 120_000 }));
    const cd = String(res.headers['content-disposition'] ?? '');
    const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? fallbackName;
    saveBlob(res.data, name);
  } catch (err) {
    await rethrowBlobError(err);
  }
}

/** Download mutation bound to the active store (toasts are left to the caller). */
export function useStoreDownload() {
  const sid = useActiveStoreId();
  return useMutation({
    mutationFn: (v: { url: string; params?: Record<string, string>; filename: string }) => downloadStoreFile(sid, v.url, v.params ?? {}, v.filename),
  });
}

// ---------------------------------------------------------------------------------------------
// Marketing
// ---------------------------------------------------------------------------------------------

type MarketingKinds = {
  vouchers: { dto: StoreVoucher; body: SellerVoucherInput };
  'flash-deals': { dto: StoreFlashDeal; body: SellerFlashDealInput };
  bundles: { dto: StoreBundle; body: BundleInput };
  promotions: { dto: StorePromotion; body: PromotionInput };
};
export type MarketingKind = keyof MarketingKinds;

export function useMarketingList<K extends MarketingKind>(kind: K) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'marketing', kind], queryFn: () => s.get<MarketingKinds[K]['dto'][]>(`/seller/marketing/${kind}`) });
}

export function useSaveMarketing<K extends MarketingKind>(kind: K) {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    // Vouchers PATCH a partial body (code/type are immutable); the other kinds re-validate the whole object.
    mutationFn: ({ id, body }: { id?: string; body: MarketingKinds[K]['body'] | Record<string, unknown> }) =>
      id ? s.send<MarketingKinds[K]['dto']>('patch', `/seller/marketing/${kind}/${id}`, body) : s.send<MarketingKinds[K]['dto']>('post', `/seller/marketing/${kind}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...key, 'marketing', kind] }),
  });
}

export function useDeleteMarketing(kind: MarketingKind) {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: (id: string) => s.send<void>('delete', `/seller/marketing/${kind}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...key, 'marketing', kind] }),
  });
}

export function useSellerCampaigns() {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'marketing', 'campaigns'], queryFn: () => s.get<SellerCampaign[]>('/seller/marketing/campaigns') });
}

export function useNominate() {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: ({ campaignId, items }: { campaignId: string; items: { productId: string; campaignPrice: number }[] }) =>
      s.send<{ added: number; skipped: number }>('post', `/seller/marketing/campaigns/${campaignId}/nominations`, { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...key, 'marketing', 'campaigns'] }),
  });
}

export function useFeaturedProducts() {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'marketing', 'featured'], queryFn: () => s.get<{ productIds: string[] }>('/seller/marketing/featured') });
}

export function useSaveFeatured() {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: (productIds: string[]) => s.send<{ productIds: string[] }>('put', '/seller/marketing/featured', { productIds }),
    onSuccess: (data) => qc.setQueryData([...key, 'marketing', 'featured'], data),
  });
}

// ---------------------------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------------------------

export function useAnalytics(range: AnalyticsRange) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({
    queryKey: [...key, 'analytics', range],
    queryFn: () => s.get<AnalyticsReport>('/seller/analytics', { range }),
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------------------------
// Plan features + health
// ---------------------------------------------------------------------------------------------

export function usePlan(enabled = true) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'plan'], queryFn: () => s.get<PlanSummary>('/seller/plan'), enabled });
}

export function useStoreHealth(enabled = true) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'health'], queryFn: () => s.get<StoreHealth>('/seller/health'), enabled, staleTime: 5 * 60_000 });
}

export function useRecomputeHealth() {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: () => s.send<StoreHealth>('post', '/seller/health/recompute'),
    onSuccess: (data) => qc.setQueryData([...key, 'health'], data),
  });
}

// ---------------------------------------------------------------------------------------------
// Bulk CSV
// ---------------------------------------------------------------------------------------------

export function useImportProducts() {
  const sid = useActiveStoreId();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: async ({ file, dryRun }: { file: File; dryRun: boolean }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post<{ data: ImportResult }>('/seller/products/import', fd, cfg(sid, { params: dryRun ? { dryRun: '1' } : {}, timeout: 120_000 }));
      return res.data.data;
    },
    onSuccess: (r) => {
      if (!r.dryRun && !r.errors.length) {
        void qc.invalidateQueries({ queryKey: [...key, 'products'] });
        void qc.invalidateQueries({ queryKey: [...key, 'inventory'] });
      }
    },
  });
}

// ---------------------------------------------------------------------------------------------
// POS (online calls; the offline queue lives in components/seller/pos)
// ---------------------------------------------------------------------------------------------

/** Non-hook POS client for the offline sync engine (store id passed explicitly). */
export function posClient(sid: string) {
  const s = sc(sid);
  return {
    catalog: async (updatedSince?: string) => {
      const res = await api.get<{ data: PosCatalogRow[]; meta: { serverTime: string } }>(
        '/seller/pos/catalog',
        cfg(sid, { params: updatedSince ? { updatedSince } : {}, timeout: 60_000 }),
      );
      return { items: res.data.data, serverTime: res.data.meta.serverTime };
    },
    lookup: (code: string) => s.get<PosCatalogRow>('/seller/pos/lookup', { code }),
    sync: (sales: PosSaleBody[]) => s.send<{ results: PosSaleResult[] }>('post', '/seller/pos/sales', { sales }),
  };
}

export function usePosReceipt(orderId: string | null | undefined) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({
    queryKey: [...key, 'pos', 'receipt', orderId],
    queryFn: () => s.get<PosReceipt>(`/seller/pos/sales/${orderId}/receipt`),
    enabled: !!orderId,
    staleTime: Infinity,
  });
}

export function usePosShifts(enabled = true) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'pos', 'shifts'], queryFn: () => s.get<PosShift[]>('/seller/pos/shifts'), enabled });
}

export function useOpenShift() {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: (openingCash: number) => s.send<PosShift>('post', '/seller/pos/shifts/open', { openingCash }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...key, 'pos', 'shifts'] }),
  });
}

export function useCloseShift() {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: ({ id, countedCash, note }: { id: string; countedCash: number; note?: string }) =>
      s.send<PosShift>('post', `/seller/pos/shifts/${id}/close`, { countedCash, ...(note ? { note } : {}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...key, 'pos', 'shifts'] }),
  });
}

/** Public digital receipt `/r/:token` (no auth). */
export function usePublicReceipt(token: string | undefined) {
  return useQuery({ queryKey: ['receipt', token], queryFn: () => get<PublicReceipt>(`/r/${encodeURIComponent(token ?? '')}`), enabled: !!token });
}

// ---------------------------------------------------------------------------------------------
// Affiliate (buyer, flag affiliateLinks)
// ---------------------------------------------------------------------------------------------

export function useAffiliateLink() {
  return useMutation({ mutationFn: (productId: string) => get<{ url: string; code: string }>('/affiliate/link', { params: { productId } }) });
}

export function useAffiliateCommissions(enabled = true) {
  return useQuery({ queryKey: ['affiliate', 'commissions'], queryFn: () => get<AffiliateCommission[]>('/affiliate/commissions'), enabled });
}
