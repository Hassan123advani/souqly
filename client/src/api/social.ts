import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';
import type {
  AlertDTO,
  AlertType,
  FollowedStoreDTO,
  PendingReviewDTO,
  QuestionDTO,
  ReportTarget,
  ReviewCreateInput,
  ReviewDTO,
  ReviewSummaryDTO,
  SocialUploadKind,
  WishlistDTO,
  WishlistItemDTO,
} from '@souqly/shared';
import { useActiveStoreId } from '@/components/seller/useActiveStore';
import { useMe } from './auth';
import { api, del, get, post } from './client';

export type Page<T> = { data: T[]; meta?: { nextCursor?: string | null } };

/** GET a cursor-paginated list (keeps `meta.nextCursor`). */
export async function getPage<T>(url: string, params: Record<string, unknown> = {}, config: AxiosRequestConfig = {}): Promise<Page<T>> {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));
  const res = await api.get<Page<T>>(url, { ...config, params: clean });
  return { data: res.data.data ?? [], meta: res.data.meta };
}
export const nextCursor = <T,>(last: Page<T>) => last.meta?.nextCursor ?? undefined;
export const flatPages = <T,>(d: InfiniteData<Page<T>> | undefined): T[] => d?.pages.flatMap((p) => p.data) ?? [];

/** Seller Center request config: the selected store goes in `x-store-id` (verified server-side). */
export function storeCfg(sid: string | undefined, extra: AxiosRequestConfig = {}): AxiosRequestConfig {
  return { ...extra, headers: { ...(sid ? { 'x-store-id': sid } : {}), ...(extra.headers ?? {}) } };
}

export const socialKeys = {
  reviews: (slug: string, f: ReviewFilters) => ['reviews', slug, f] as const,
  reviewSummary: (slug: string) => ['reviews', slug, 'summary'] as const,
  myReviews: ['reviews', 'mine'] as const,
  pending: ['reviews', 'pending'] as const,
  questions: (slug: string) => ['questions', slug] as const,
  follow: (slug: string) => ['follow', slug] as const,
  following: ['following'] as const,
  feed: ['following', 'feed'] as const,
  wishlists: ['wishlists'] as const,
  wishlist: (id: string) => ['wishlists', id] as const,
  has: (productId: string) => ['wishlists', 'has', productId] as const,
  alerts: ['alerts'] as const,
  sellerReviews: (sid: string | undefined, f: object) => ['seller', sid, 'reviews', f] as const,
  sellerQuestions: (sid: string | undefined, unanswered: boolean) => ['seller', sid, 'questions', unanswered] as const,
};

// ---------------- Uploads ----------------
export type SocialUpload = { url: string; key: string; mimetype: string; size: number };
export async function uploadSocial(file: File, kind: SocialUploadKind, onProgress?: (pct: number) => void): Promise<SocialUpload> {
  const fd = new FormData();
  fd.append('kind', kind);
  fd.append('file', file);
  const res = await api.post<{ data: SocialUpload }>('/social/uploads', fd, {
    timeout: 120_000,
    onUploadProgress: (e) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
  });
  return res.data.data;
}

// ---------------- Reviews ----------------
export type ReviewSort = 'recent' | 'helpful' | 'rating_high' | 'rating_low';
export type ReviewFilters = { sort: ReviewSort; rating?: number; withMedia?: boolean };

export function useReviewSummary(slug: string) {
  return useQuery({ queryKey: socialKeys.reviewSummary(slug), queryFn: () => get<ReviewSummaryDTO>(`/products/${encodeURIComponent(slug)}/reviews/summary`) });
}

export function useProductReviews(slug: string, f: ReviewFilters) {
  return useInfiniteQuery({
    queryKey: socialKeys.reviews(slug, f),
    queryFn: ({ pageParam }) =>
      getPage<ReviewDTO>(`/products/${encodeURIComponent(slug)}/reviews`, {
        sort: f.sort,
        rating: f.rating,
        withMedia: f.withMedia ? '1' : undefined,
        cursor: pageParam,
        limit: 10,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
}

export function useHelpfulVote(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? post(`/reviews/${id}/helpful`) : del(`/reviews/${id}/helpful`)),
    onMutate: ({ id, on }) => {
      // Optimistic: flip the vote in every cached list of this product.
      qc.setQueriesData<InfiniteData<Page<ReviewDTO>>>({ queryKey: ['reviews', slug] }, (d) =>
        d?.pages
          ? {
              ...d,
              pages: d.pages.map((pg) => ({
                ...pg,
                data: pg.data.map((r) => (r.id === id ? { ...r, myVote: on, helpfulCount: Math.max(0, r.helpfulCount + (on ? 1 : -1)) } : r)),
              })),
            }
          : d,
      );
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['reviews', slug] }),
  });
}

export function useMyReviews(enabled = true) {
  return useInfiniteQuery({
    queryKey: socialKeys.myReviews,
    queryFn: ({ pageParam }) => getPage<ReviewDTO>('/reviews/mine', { cursor: pageParam, limit: 10 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled,
  });
}

export function usePendingReviews() {
  const { data: me } = useMe();
  return useQuery({ queryKey: socialKeys.pending, queryFn: () => get<PendingReviewDTO[]>('/reviews/pending'), enabled: !!me, staleTime: 60_000 });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewCreateInput) => post<ReviewDTO>('/reviews', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

// ---------------- Reports ----------------
export type ReportReason = 'spam' | 'offensive' | 'fake' | 'counterfeit' | 'prohibited' | 'misleading' | 'harassment' | 'other';
export function useReport() {
  return useMutation({
    mutationFn: ({ targetType, targetId, reason, details }: { targetType: ReportTarget; targetId: string; reason: ReportReason; details?: string }) =>
      targetType === 'review'
        ? post(`/reviews/${targetId}/report`, { reason, ...(details ? { details } : {}) })
        : post('/reports', { targetType, targetId, reason, ...(details ? { details } : {}) }),
  });
}

// ---------------- Q&A ----------------
export function useProductQuestions(slug: string) {
  return useInfiniteQuery({
    queryKey: socialKeys.questions(slug),
    queryFn: ({ pageParam }) => getPage<QuestionDTO>(`/products/${encodeURIComponent(slug)}/questions`, { cursor: pageParam, limit: 5 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
}

export function useAskQuestion(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => post<QuestionDTO>(`/products/${encodeURIComponent(slug)}/questions`, { text }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.questions(slug) }),
  });
}

// ---------------- Follows ----------------
type FollowStatus = { following: boolean; followerCount: number };
export function useFollowStatus(slug: string) {
  return useQuery({ queryKey: socialKeys.follow(slug), queryFn: () => get<FollowStatus>(`/stores/${encodeURIComponent(slug)}/follow-status`), staleTime: 60_000 });
}

export function useToggleFollow(slug: string) {
  const qc = useQueryClient();
  const key = socialKeys.follow(slug);
  return useMutation({
    mutationFn: (follow: boolean) =>
      follow ? post<FollowStatus>(`/stores/${encodeURIComponent(slug)}/follow`) : del<FollowStatus>(`/stores/${encodeURIComponent(slug)}/follow`),
    onMutate: async (follow) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<FollowStatus>(key);
      if (prev) qc.setQueryData<FollowStatus>(key, { following: follow, followerCount: Math.max(0, prev.followerCount + (follow ? 1 : -1)) });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      void qc.invalidateQueries({ queryKey: socialKeys.following });
    },
  });
}

export function useFollowing() {
  return useInfiniteQuery({
    queryKey: socialKeys.following,
    queryFn: ({ pageParam }) => getPage<FollowedStoreDTO>('/me/following', { cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
}

export type FeedProduct = {
  id: string;
  title: string;
  slug: string;
  image?: string;
  price: number;
  compareAtPrice?: number;
  discountPct: number;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  inStock: boolean;
  publishedAt?: string;
  store: { id: string; slug: string; name: string };
};
export function useFollowingFeed() {
  return useInfiniteQuery({
    queryKey: socialKeys.feed,
    queryFn: ({ pageParam }) => getPage<FeedProduct>('/feed/following', { cursor: pageParam, limit: 12 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
}

// ---------------- Wishlists ----------------
export type WishlistDetail = WishlistDTO & { items: WishlistItemDTO[] };

export function useWishlists(enabled = true) {
  return useQuery({ queryKey: socialKeys.wishlists, queryFn: () => get<WishlistDTO[]>('/wishlists'), enabled });
}
export function useWishlist(id: string | undefined) {
  return useQuery({ queryKey: socialKeys.wishlist(id ?? ''), queryFn: () => get<WishlistDetail>(`/wishlists/${id}`), enabled: !!id });
}

/**
 * Heart state for one product. Every card on screen asks for its own id; the loader batches the
 * ids requested in the same tick into one `GET /wishlists/contains` call (max 60 per request).
 */
type Waiter = { resolve: (v: boolean) => void; reject: (e: unknown) => void };
const batch = { ids: new Map<string, Waiter[]>(), timer: null as ReturnType<typeof setTimeout> | null };
function loadContains(id: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    batch.ids.set(id, [...(batch.ids.get(id) ?? []), { resolve, reject }]);
    if (batch.timer) return;
    batch.timer = setTimeout(async () => {
      const pending = new Map(batch.ids);
      batch.ids.clear();
      batch.timer = null;
      const all = [...pending.keys()];
      for (let i = 0; i < all.length; i += 60) {
        const chunk = all.slice(i, i + 60);
        try {
          const res = await get<Record<string, boolean>>('/wishlists/contains', { params: { productIds: chunk.join(',') } });
          for (const pid of chunk) pending.get(pid)?.forEach((w) => w.resolve(!!res[pid]));
        } catch (e) {
          for (const pid of chunk) pending.get(pid)?.forEach((w) => w.reject(e));
        }
      }
    }, 30);
  });
}

export function useInWishlist(productId: string) {
  const { data: me } = useMe();
  return useQuery({ queryKey: socialKeys.has(productId), queryFn: () => loadContains(productId), enabled: !!me && !!productId, staleTime: 5 * 60_000 });
}

export function useWishlistMutations() {
  const qc = useQueryClient();
  const refresh = (productId?: string, has?: boolean) => {
    if (productId !== undefined && has !== undefined) qc.setQueryData(socialKeys.has(productId), has);
    void qc.invalidateQueries({ queryKey: socialKeys.wishlists, predicate: (q) => q.queryKey[1] !== 'has' });
  };
  return {
    addDefault: useMutation({
      mutationFn: (b: { productId: string; variantId?: string }) => post('/wishlists/items', b),
      onMutate: (b) => qc.setQueryData(socialKeys.has(b.productId), true),
      onError: (_e, b) => qc.setQueryData(socialKeys.has(b.productId), false),
      onSuccess: (_d, b) => refresh(b.productId, true),
    }),
    addTo: useMutation({
      mutationFn: ({ listId, ...b }: { listId: string; productId: string; variantId?: string }) => post(`/wishlists/${listId}/items`, b),
      onSuccess: (_d, b) => refresh(b.productId, true),
    }),
    removeEverywhere: useMutation({
      mutationFn: (productId: string) => del(`/wishlists/items/${productId}`),
      onMutate: (pid) => qc.setQueryData(socialKeys.has(pid), false),
      onError: (_e, pid) => qc.setQueryData(socialKeys.has(pid), true),
      onSuccess: (_d, pid) => refresh(pid, false),
    }),
    removeFrom: useMutation({
      mutationFn: ({ listId, productId, variantId }: { listId: string; productId: string; variantId?: string }) =>
        del(`/wishlists/${listId}/items/${productId}`, variantId ? { params: { variantId } } : undefined),
      onSuccess: (_d, b) => {
        void qc.invalidateQueries({ queryKey: socialKeys.has(b.productId) });
        refresh();
      },
    }),
    create: useMutation({ mutationFn: (name: string) => post<WishlistDTO>('/wishlists', { name }), onSuccess: () => refresh() }),
    rename: useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/wishlists/${id}`, { name }), onSuccess: () => refresh() }),
    remove: useMutation({
      mutationFn: (id: string) => del(`/wishlists/${id}`),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['wishlists', 'has'] });
        refresh();
      },
    }),
  };
}

// ---------------- Alerts ----------------
export function useAlerts(enabled = true) {
  return useQuery({ queryKey: socialKeys.alerts, queryFn: () => get<AlertDTO[]>('/alerts'), enabled });
}
export function useToggleAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ on, ...b }: { on: boolean; productId: string; variantId?: string; type: AlertType }) =>
      on ? post('/alerts', b) : del('/alerts', { data: b }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.alerts }),
  });
}

// ---------------- Seller: reviews & questions ----------------
export function useSellerReviews(f: { rating?: number; replied?: '0' | '1' }) {
  const sid = useActiveStoreId();
  return useInfiniteQuery({
    queryKey: socialKeys.sellerReviews(sid, f),
    queryFn: ({ pageParam }) => getPage<ReviewDTO>('/seller/reviews', { ...f, cursor: pageParam, limit: 20 }, storeCfg(sid)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: !!sid,
  });
}
export function useReplyReview() {
  const sid = useActiveStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => post<ReviewDTO>(`/seller/reviews/${id}/reply`, { text }, storeCfg(sid)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['seller', sid, 'reviews'] }),
  });
}
export function useSellerQuestions(unanswered: boolean) {
  const sid = useActiveStoreId();
  return useInfiniteQuery({
    queryKey: socialKeys.sellerQuestions(sid, unanswered),
    queryFn: ({ pageParam }) => getPage<QuestionDTO>('/seller/questions', { unanswered: unanswered ? '1' : undefined, cursor: pageParam, limit: 20 }, storeCfg(sid)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: !!sid,
  });
}
export function useAnswerQuestion() {
  const sid = useActiveStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => post<QuestionDTO>(`/seller/questions/${id}/answer`, { text }, storeCfg(sid)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['seller', sid, 'questions'] }),
  });
}
