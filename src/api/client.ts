import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

/** Admin tokens live in sessionStorage: closing the browser tab ends the session. */
const STORAGE_KEY = 'imara-admin-session';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

export const sessionStore = {
  get(): StoredSession | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  },
  set(session: StoredSession) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  },
  clear() {
    sessionStorage.removeItem(STORAGE_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const http = axios.create({ baseURL: API_BASE_URL, timeout: 30000 });

http.interceptors.request.use((config) => {
  const session = sessionStore.get();
  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return config;
});

type Listener = (reason: string) => void;
const sessionEndedListeners = new Set<Listener>();
export function onSessionEnded(listener: Listener) {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  const session = sessionStore.get();
  if (!session?.refreshToken) return false;
  refreshing ??= axios
    .post(`${API_BASE_URL}/admin/auth/refresh`, { refreshToken: session.refreshToken })
    .then((res) => {
      const data = res.data?.data;
      sessionStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const TERMINAL_SESSION_CODES = new Set([
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'SESSION_IDLE_TIMEOUT',
  'ADMIN_ACCOUNT_INACTIVE',
]);

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<any>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;
    const code: string = body?.code || body?.error?.code || (status ? String(status) : 'NETWORK_ERROR');
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    const isAuthCall = original?.url?.includes('/admin/auth/') && !original.url.includes('/admin/auth/me');

    if (status === 401 && !isAuthCall) {
      if (!TERMINAL_SESSION_CODES.has(code) && !original._retried && (await tryRefresh())) {
        original._retried = true;
        return http(original);
      }
      sessionStore.clear();
      sessionEndedListeners.forEach((l) => l(code));
    }

    const message =
      body?.message ||
      (status === 0 ? 'Cannot reach the Imara API. Check that the backend is running.' : error.message);
    return Promise.reject(new ApiError(status, code, Array.isArray(message) ? message.join(', ') : message, body?.error?.details));
  },
);

/** Unwraps the backend envelope { success, data, meta }. */
export async function api<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await http.request(config);
  return res.data?.data as T;
}

export const get = <T>(url: string, params?: Record<string, unknown>) =>
  api<T>({ method: 'GET', url, params: clean(params) });
export const post = <T>(url: string, data?: unknown) => api<T>({ method: 'POST', url, data });
export const put = <T>(url: string, data?: unknown) => api<T>({ method: 'PUT', url, data });
export const patch = <T>(url: string, data?: unknown) => api<T>({ method: 'PATCH', url, data });
export const del = <T>(url: string) => api<T>({ method: 'DELETE', url });

/** Downloads a server-generated export (CSV / XLSX / PDF). */
export async function download(url: string, params?: Record<string, unknown>) {
  const res = await http.get(url, { params: clean(params), responseType: 'blob' });
  const disposition: string = res.headers['content-disposition'] || '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] || 'export';
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

function clean(params?: Record<string, unknown>) {
  if (!params) return undefined;
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };
}
