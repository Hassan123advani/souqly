import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import i18n from '@/i18n';

const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export const api = axios.create({
  baseURL: `${base}/api/v1`,
  withCredentials: true,
  timeout: 20_000,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

/** Shape of every error body returned by the Souqly API. */
export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };
export type ApiError = AxiosError<ApiErrorBody>;

/** Unwraps `{ data }` envelopes. */
export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.get<{ data: T }>(url, config);
  return res.data.data;
}
export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.post<{ data: T }>(url, body, config);
  return res.data?.data as T;
}
export async function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.patch<{ data: T }>(url, body, config);
  return res.data?.data as T;
}
export async function del<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.delete<{ data: T }>(url, config);
  return res.data?.data as T;
}

// ---- Refresh on TOKEN_EXPIRED (single flight) ----
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; _skipRefresh?: boolean };
let refreshing: Promise<void> | null = null;

/** Single-flight `POST /auth/refresh`; also used by the socket to recover from TOKEN_EXPIRED. */
export function refreshOnce(): Promise<void> {
  if (!refreshing) {
    refreshing = api
      .post('/auth/refresh', undefined, { _skipRefresh: true } as AxiosRequestConfig)
      .then(() => undefined)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error: ApiError) => {
    const cfg = error.config as RetriableConfig | undefined;
    const code = error.response?.data?.error?.code;
    if (error.response?.status === 401 && code === 'TOKEN_EXPIRED' && cfg && !cfg._retried && !cfg._skipRefresh) {
      cfg._retried = true;
      try {
        await refreshOnce();
        return api(cfg);
      } catch {
        // Fall through: the original 401 propagates and useMe() treats the user as signed out.
      }
    }
    return Promise.reject(error);
  },
);

export function getErrorCode(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) return (err as ApiError).response?.data?.error?.code;
  return undefined;
}

/** `error.details` of an API error, when it is an object. */
export function getErrorDetails(err: unknown): Record<string, unknown> | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  const d = (err as ApiError).response?.data?.error?.details;
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : undefined;
}

export function getErrorStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

/**
 * Human friendly, translated message for any thrown error. Known error codes are translated
 * via `errors.<CODE>`; otherwise the server message, then a generic fallback.
 */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const e = err as ApiError;
    if (!e.response) return i18n.t('errors.NETWORK');
    const code = e.response.data?.error?.code;
    if (code && i18n.exists(`errors.${code}`)) {
      const msg = i18n.t(`errors.${code}`);
      const left = getErrorDetails(err)?.attemptsLeft;
      return typeof left === 'number' ? `${msg} ${i18n.t('errors.attemptsLeft', { n: left })}` : msg;
    }
    if (e.response.status >= 500) return i18n.t('errors.SERVER');
    return e.response.data?.error?.message || i18n.t('errors.GENERIC');
  }
  if (err instanceof Error && err.message) return err.message;
  return i18n.t('errors.GENERIC');
}
