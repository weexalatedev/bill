// REST client for the EnerOS API (React Native / Expo). Base URL comes from
// EXPO_PUBLIC_API_URL (defaults to the local API). The store attaches a bearer
// token obtained from the active auth provider (Clerk or dev mode).
import type {
  Account,
  AssetSlice,
  ControlMode,
  Invoice,
  MonthlyPoint,
  OptimisationAction,
  Plan,
  Site,
} from '../types';

export const API_URL: string =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:4000';

export interface ApiConfig {
  authMode: 'clerk' | 'dev';
  clerkPublishableKey: string | null;
  r2Enabled: boolean;
  demo: { email: string; password?: string };
}

export interface UploadedDocument {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  size: number;
  url: string | null;
  invoiceId?: string;
  createdAt: string;
}

export interface WorkspaceData {
  account: Account;
  sites: Site[];
  invoices: Invoice[];
  actions: OptimisationAction[];
  monthly: MonthlyPoint[];
  assetMix: AssetSlice[];
  plans: Plan[];
  suppliers: string[];
  annualSpendTotal: number;
  controlMode: ControlMode;
  uploads: UploadedDocument[];
}

/** React Native file descriptor accepted by FormData. */
export interface NativeFile {
  uri: string;
  name: string;
  type: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  formData?: FormData;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, formData } = options;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getConfig: (): Promise<ApiConfig> => request<ApiConfig>('/api/config'),

  devLogin: (email: string, password: string) =>
    request<{ token: string; user: { email: string; name: string }; mode: 'dev' }>(
      '/api/auth/login',
      { method: 'POST', body: { email, password } },
    ),

  getMe: (token: string) =>
    request<{ user: { email: string; name: string }; mode: 'clerk' | 'dev' }>('/api/auth/me', {
      token,
    }),

  getWorkspace: (token: string) =>
    request<{ workspace: WorkspaceData; user: { email: string; name: string } }>('/api/workspace', {
      token,
    }),

  createInvoice: (token: string, payload: Record<string, unknown>) =>
    request<{ invoice: Invoice }>('/api/invoices', { method: 'POST', body: payload, token }),

  recoverInvoice: (token: string, id: string) =>
    request<{ invoice: Invoice }>(`/api/invoices/${id}/recover`, { method: 'POST', token }),

  advanceAction: (token: string, id: string) =>
    request<{ action: OptimisationAction }>(`/api/actions/${id}/advance`, {
      method: 'POST',
      token,
    }),

  setActionStatus: (token: string, id: string, status: string) =>
    request<{ action: OptimisationAction }>(`/api/actions/${id}`, {
      method: 'PATCH',
      body: { status },
      token,
    }),

  setControlMode: (token: string, mode: ControlMode) =>
    request<{ controlMode: ControlMode }>('/api/workspace/control-mode', {
      method: 'PUT',
      body: { mode },
      token,
    }),

  listUploads: (token: string) =>
    request<{ uploads: UploadedDocument[] }>('/api/uploads', { token }),

  uploadDocument: (token: string, file: NativeFile, invoiceId?: string) => {
    const form = new FormData();
    // React Native accepts { uri, name, type } for multipart uploads.
    form.append('file', file as unknown as Blob);
    if (invoiceId) form.append('invoiceId', invoiceId);
    return request<{ upload: UploadedDocument }>('/api/uploads', {
      method: 'POST',
      formData: form,
      token,
    });
  },

  documentUrl: (token: string, id: string) =>
    request<{ url: string; expiresIn: number | null }>(`/api/uploads/${id}/url`, { token }),

  deleteUpload: (token: string, id: string) =>
    request<null>(`/api/uploads/${id}`, { method: 'DELETE', token }),
};
