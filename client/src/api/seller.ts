import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';
import type {
  ActivityEntry,
  BusinessInput,
  ChatSettings,
  CustomRoleDTO,
  InventoryAdjustInput,
  InventoryRow,
  NotificationSettings,
  OnboardingInput,
  OrderDTO,
  OrderStatus,
  PayoutInput,
  ProductCreateInput,
  ProductStatus,
  ProductUpdateInput,
  SellerDashboard,
  SellerProduct,
  SellerProductBulkResult,
  SellerStore,
  ShippingSettings,
  SlugAvailability,
  StaffInviteInput,
  StaffMemberDTO,
  StaffUpdateInput,
  StockMovementDTO,
  StoreInvitationDTO,
  StoreUpdateInput,
  UploadResult,
  WarehouseDTO,
} from '@souqly/shared';
import { useActiveStoreId } from '@/components/seller/useActiveStore';
import { api } from './client';
import { meKey } from './auth';

type Envelope<T, M = undefined> = { data: T; meta?: M };
function clean(params?: Record<string, unknown>) {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== null) out[k] = v;
  return out;
}

/** Every Seller Center call carries the selected store (the x-store-id header); the server verifies membership. */
function cfg(sid: string | undefined, extra: AxiosRequestConfig = {}): AxiosRequestConfig {
  return { ...extra, headers: { ...(sid && sid !== 'none' ? { 'x-store-id': sid } : {}), ...(extra.headers ?? {}) } };
}
function sc(sid: string | undefined) {
  return {
    get: async <T,>(url: string, params?: Record<string, unknown>): Promise<T> =>
      (await api.get<Envelope<T>>(url, cfg(sid, { params: clean(params) }))).data.data,
    page: async <T, M>(url: string, params?: Record<string, unknown>): Promise<{ data: T[]; meta?: M }> => {
      const res = await api.get<Envelope<T[], M>>(url, cfg(sid, { params: clean(params) }));
      return { data: res.data.data ?? [], meta: res.data.meta };
    },
    send: async <T,>(method: 'post' | 'patch' | 'put' | 'delete', url: string, body?: unknown): Promise<T> => {
      const res = await api.request<Envelope<T>>(cfg(sid, { method, url, data: body }));
      return res.data?.data as T;
    },
  };
}
/** Store-scoped request helpers for the active store. */
function useSc() {
  return sc(useActiveStoreId());
}

/** Root key per store, so switching stores never shows another store's cache. */
export function useSellerKey() {
  const id = useActiveStoreId();
  return ['seller', id ?? 'none'] as const;
}
export type CursorMeta = { nextCursor: string | null };
export type CountsMeta = CursorMeta & { counts?: Record<string, number> };

// ---------------------------------------------------------------------------------------------
// Onboarding (no store yet: no x-store-id needed, harmless when present)
// ---------------------------------------------------------------------------------------------

export function checkSlug(slug: string): Promise<SlugAvailability> {
  return api.get<Envelope<SlugAvailability>>('/stores/slug-available', { params: { slug } }).then((r) => r.data.data);
}

export async function uploadFile(url: '/uploads/temp' | '/seller/uploads', file: File, sid?: string): Promise<UploadResult> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.post<Envelope<UploadResult>>(url, fd, cfg(sid, { timeout: 120_000 }));
  return res.data.data;
}

export function useSubmitOnboarding() {
  const s = useSc();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardingInput) => s.send<SellerStore>('post', '/seller/onboarding', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
}

// ---------------------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------------------

export function useSellerStore(enabled = true) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'store'], queryFn: () => s.get<SellerStore>('/seller/store'), enabled: enabled && key[1] !== 'none', staleTime: 30_000 });
}

function useStoreMutation<V>(fn: (s: ReturnType<typeof sc>, v: V) => Promise<SellerStore>) {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: (v: V) => fn(s, v),
    onSuccess: (store) => {
      if (store) qc.setQueryData([...key, 'store'], store);
      void qc.invalidateQueries({ queryKey: meKey });
    },
  });
}
export const useUpdateStore = () => useStoreMutation((s, b: StoreUpdateInput) => s.send<SellerStore>('patch', '/seller/store', b));
export const useUpdatePayout = () => useStoreMutation((s, b: PayoutInput) => s.send<SellerStore>('patch', '/seller/store/payout', b));
export const useUpdateBusiness = () => useStoreMutation((s, b: BusinessInput) => s.send<SellerStore>('patch', '/seller/store/business', b));
export const useMallRequest = () => useStoreMutation((s, _: void) => s.send<SellerStore>('post', '/seller/store/mall-request'));

// ---------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------

export function useDashboard(range: SellerDashboard['range'], enabled = true) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({
    queryKey: [...key, 'dashboard', range],
    queryFn: () => s.get<SellerDashboard>('/seller/dashboard', { range }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  });
}

// ---------------------------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------------------------

export function useSellerProducts(params: { status?: ProductStatus; q?: string }) {
  const s = useSc();
  const key = useSellerKey();
  return useInfiniteQuery({
    queryKey: [...key, 'products', 'list', params],
    queryFn: ({ pageParam }) => s.page<SellerProduct, CountsMeta>('/seller/products', { ...params, cursor: pageParam, limit: 24 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useSellerProduct(id: string | undefined) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'products', 'one', id], queryFn: () => s.get<SellerProduct>(`/seller/products/${id}`), enabled: !!id });
}

function useProductsInvalidation() {
  const qc = useQueryClient();
  const key = useSellerKey();
  return () => {
    void qc.invalidateQueries({ queryKey: [...key, 'products'] });
    void qc.invalidateQueries({ queryKey: [...key, 'inventory'] });
    void qc.invalidateQueries({ queryKey: [...key, 'store'] });
  };
}

export function useSaveProduct() {
  const s = useSc();
  const done = useProductsInvalidation();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: ProductCreateInput | ProductUpdateInput }) =>
      id ? s.send<SellerProduct>('patch', `/seller/products/${id}`, body) : s.send<SellerProduct>('post', '/seller/products', body),
    onSuccess: done,
  });
}
export function useProductAction() {
  const s = useSc();
  const done = useProductsInvalidation();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'duplicate' | 'archive' }): Promise<SellerProduct | void> =>
      action === 'archive'
        ? s.send<SellerProduct | void>('delete', `/seller/products/${id}`)
        : s.send<SellerProduct | void>('post', `/seller/products/${id}/${action}`),
    onSuccess: done,
  });
}

/** Bulk publish / archive; each id succeeds or fails on its own. */
export function useBulkProducts() {
  const s = useSc();
  const done = useProductsInvalidation();
  return useMutation({
    mutationFn: (b: { ids: string[]; action: 'publish' | 'archive' }) => s.send<SellerProductBulkResult>('post', '/seller/products/bulk', b),
    onSuccess: done,
  });
}

// ---------------------------------------------------------------------------------------------
// Inventory & warehouses
// ---------------------------------------------------------------------------------------------

export function useInventory(params: { lowStock?: boolean; q?: string }) {
  const s = useSc();
  const key = useSellerKey();
  return useInfiniteQuery({
    queryKey: [...key, 'inventory', 'list', params],
    queryFn: ({ pageParam }) =>
      s.page<InventoryRow, CursorMeta>('/seller/inventory', { q: params.q, lowStock: params.lowStock ? '1' : undefined, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

/** Low-stock count for the nav badge (first page is enough to show "50+"). */
export function useLowStockCount(enabled: boolean) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({
    queryKey: [...key, 'inventory', 'lowCount'],
    queryFn: async () => (await s.page<InventoryRow, CursorMeta>('/seller/inventory', { lowStock: '1', limit: 50 })).data.length,
    enabled,
    staleTime: 60_000,
  });
}

export function useMovements(productId: string | undefined) {
  const s = useSc();
  const key = useSellerKey();
  return useInfiniteQuery({
    queryKey: [...key, 'inventory', 'movements', productId],
    queryFn: ({ pageParam }) => s.page<StockMovementDTO, CursorMeta>('/seller/inventory/movements', { productId, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    enabled: !!productId,
  });
}

export function useAdjustStock() {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: (b: InventoryAdjustInput) => s.send<{ balanceAfter: number; movementId: string }>('post', '/seller/inventory/adjust', b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...key, 'inventory'] });
      void qc.invalidateQueries({ queryKey: [...key, 'products'] });
    },
  });
}

export function useWarehouses() {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'warehouses'], queryFn: () => s.get<WarehouseDTO[]>('/seller/warehouses') });
}
export type WarehouseInput = { name: string; address: WarehouseDTO['address']; isDefault?: boolean };
export function useSaveWarehouse() {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<WarehouseInput> }) =>
      id ? s.send<WarehouseDTO>('patch', `/seller/warehouses/${id}`, body) : s.send<WarehouseDTO>('post', '/seller/warehouses', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...key, 'warehouses'] }),
  });
}
export function useDeleteWarehouse() {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: (id: string) => s.send<void>('delete', `/seller/warehouses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...key, 'warehouses'] }),
  });
}

// ---------------------------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------------------------

export type SellerOrderFilters = { status?: OrderStatus; q?: string; from?: string; to?: string };

export function useSellerOrders(params: SellerOrderFilters) {
  const s = useSc();
  const key = useSellerKey();
  return useInfiniteQuery({
    queryKey: [...key, 'orders', 'list', params],
    queryFn: ({ pageParam }) => s.page<OrderDTO, CountsMeta>('/seller/orders', { ...params, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useSellerOrder(id: string | undefined) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'orders', 'one', id], queryFn: () => s.get<OrderDTO>(`/seller/orders/${id}`), enabled: !!id });
}

function useOrdersInvalidation() {
  const qc = useQueryClient();
  const key = useSellerKey();
  return () => {
    void qc.invalidateQueries({ queryKey: [...key, 'orders'] });
    void qc.invalidateQueries({ queryKey: [...key, 'dashboard'] });
  };
}

export type StatusChange = {
  to: 'confirmed' | 'packed' | 'shipped' | 'cancelled';
  note?: string;
  reason?: string;
  tracking?: { courier: string; trackingNumber: string };
};
export function useOrderStatus() {
  const s = useSc();
  const done = useOrdersInvalidation();
  return useMutation({ mutationFn: ({ id, ...b }: StatusChange & { id: string }) => s.send<OrderDTO>('post', `/seller/orders/${id}/status`, b), onSuccess: done });
}
export function useBulkOrderStatus() {
  const s = useSc();
  const done = useOrdersInvalidation();
  return useMutation({
    mutationFn: (b: { ids: string[]; to: 'confirmed' | 'packed' }) =>
      s.send<{ results: { id: string; ok: boolean; error?: string }[]; updated: number }>('post', '/seller/orders/bulk-status', b),
    onSuccess: done,
  });
}
export function useOrderNote() {
  const s = useSc();
  const done = useOrdersInvalidation();
  return useMutation({ mutationFn: ({ id, text }: { id: string; text: string }) => s.send<OrderDTO>('post', `/seller/orders/${id}/notes`, { text }), onSuccess: done });
}
export type OrderRiderOption = { memberId: string; user: { id: string; name: string; phone?: string }; activeDeliveries: number };

/** Rider picker for order assignment (needs only orders.view, unlike `/seller/riders`). */
export function useOrderRiders(enabled: boolean) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({
    queryKey: [...key, 'orders', 'riders'],
    queryFn: () => s.get<OrderRiderOption[]>('/seller/orders/riders'),
    enabled,
    staleTime: 60_000,
  });
}

export function useAssignRider() {
  const s = useSc();
  const done = useOrdersInvalidation();
  return useMutation({
    mutationFn: ({ id, riderMemberId }: { id: string; riderMemberId: string }) => s.send<OrderDTO>('post', `/seller/orders/${id}/assign-rider`, { riderMemberId }),
    onSuccess: done,
  });
}

/** Downloads an authenticated PDF (invoice / label) and opens the browser save dialog. */
export async function downloadPdf(url: string, filename: string, sid?: string): Promise<void> {
  const res = await api.get(url, cfg(sid, { responseType: 'blob' }));
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

// ---------------------------------------------------------------------------------------------
// Staff, roles, activity, invitations
// ---------------------------------------------------------------------------------------------

export function useStaff(enabled = true) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'staff'], queryFn: () => s.get<StaffMemberDTO[]>('/seller/staff'), enabled });
}
function useStaffInvalidation() {
  const qc = useQueryClient();
  const key = useSellerKey();
  return () => {
    void qc.invalidateQueries({ queryKey: [...key, 'staff'] });
    void qc.invalidateQueries({ queryKey: [...key, 'roles'] });
    void qc.invalidateQueries({ queryKey: [...key, 'activity'] });
  };
}
export function useInviteStaff() {
  const s = useSc();
  const done = useStaffInvalidation();
  return useMutation({
    mutationFn: (b: StaffInviteInput) => s.send<{ status: 'invited' | 'email_sent'; member?: StaffMemberDTO }>('post', '/seller/staff/invite', b),
    onSuccess: done,
  });
}
export function useUpdateStaff() {
  const s = useSc();
  const done = useStaffInvalidation();
  return useMutation({ mutationFn: ({ id, ...b }: StaffUpdateInput & { id: string }) => s.send<StaffMemberDTO>('patch', `/seller/staff/${id}`, b), onSuccess: done });
}
export function useRemoveStaff() {
  const s = useSc();
  const done = useStaffInvalidation();
  return useMutation({ mutationFn: (id: string) => s.send<void>('delete', `/seller/staff/${id}`), onSuccess: done });
}

export function useRoles(enabled = true) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'roles'], queryFn: () => s.get<CustomRoleDTO[]>('/seller/roles'), enabled });
}
export function useSaveRole() {
  const s = useSc();
  const done = useStaffInvalidation();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: { name: string; permissions: string[] } }) =>
      id ? s.send<CustomRoleDTO>('patch', `/seller/roles/${id}`, body) : s.send<CustomRoleDTO>('post', '/seller/roles', body),
    onSuccess: done,
  });
}
export function useDeleteRole() {
  const s = useSc();
  const done = useStaffInvalidation();
  return useMutation({ mutationFn: (id: string) => s.send<void>('delete', `/seller/roles/${id}`), onSuccess: done });
}

export function useActivity() {
  const s = useSc();
  const key = useSellerKey();
  return useInfiniteQuery({
    queryKey: [...key, 'activity'],
    queryFn: ({ pageParam }) => s.page<ActivityEntry, CursorMeta>('/seller/activity', { cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
}

/** Buyer side: invitations addressed to the signed-in user (no store context). */
export function useMyInvitations(enabled = true) {
  return useQuery({
    queryKey: ['invitations'],
    queryFn: async () => (await api.get<Envelope<StoreInvitationDTO[]>>('/seller/invitations')).data.data,
    enabled,
    staleTime: 60_000,
  });
}
export function useRespondInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => api.post(`/seller/invitations/${id}/${accept ? 'accept' : 'decline'}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invitations'] });
      void qc.invalidateQueries({ queryKey: meKey });
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

type SettingsMap = { shipping: ShippingSettings; notifications: NotificationSettings; chat: ChatSettings };
export function useSellerSettings<K extends keyof SettingsMap>(section: K, enabled = true) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'settings', section], queryFn: () => s.get<SettingsMap[K]>(`/seller/settings/${section}`), enabled });
}
export function useSaveSellerSettings<K extends keyof SettingsMap>(section: K) {
  const s = useSc();
  const qc = useQueryClient();
  const key = useSellerKey();
  return useMutation({
    mutationFn: (body: Partial<SettingsMap[K]>) => s.send<SettingsMap[K]>('put', `/seller/settings/${section}`, body),
    onSuccess: (data) => {
      qc.setQueryData([...key, 'settings', section], data);
      void qc.invalidateQueries({ queryKey: [...key, 'store'] });
    },
  });
}
