import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, type UploadedDocument, type WorkspaceData } from './lib/api';
import { useAuth } from './lib/auth';
import type {
  Account,
  ActionStatus,
  AssetSlice,
  ControlMode,
  Invoice,
  MonthlyPoint,
  OptimisationAction,
  Plan,
  Site,
} from './types';

export interface Metrics {
  spendActual: number;
  spendExpected: number;
  savings: number;
  savingsRate: number;
  previousMonthSpend: number;
  momChangePct: number;
  issuesOpen: number;
  issuesValue: number;
  invoicesAudited: number;
  potentialMonthlySaving: number;
  committedSaving: number;
  automatedSaving: number;
}

export interface UploadPayload {
  siteId: string;
  supplier: string;
  period: string;
  consumptionKwh: number;
  unitRateP: number;
  standingChargeP: number;
}

interface AppContextValue {
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
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setControlMode: (mode: ControlMode) => Promise<void>;
  setActionStatus: (id: string, status: ActionStatus) => Promise<void>;
  advanceAction: (id: string) => Promise<void>;
  recoverInvoice: (id: string) => Promise<void>;
  analyseUpload: (payload: UploadPayload) => Promise<Invoice>;
  uploadDocument: (file: File, invoiceId?: string) => Promise<UploadedDocument>;
  deleteUpload: (id: string) => Promise<void>;
  documentUrl: (id: string) => Promise<string>;
  metrics: Metrics;
  toast: string | null;
  pushToast: (message: string) => void;
  getSiteById: (id: string) => Site | undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const EMPTY_ACCOUNT: Account = {
  name: '—',
  planId: 'starter',
  sites: 0,
  contractStart: '',
  performanceFeePct: 0,
  flexibilitySharePct: 0,
};

const emptyWorkspace = (): WorkspaceData => ({
  account: EMPTY_ACCOUNT,
  sites: [],
  invoices: [],
  actions: [],
  monthly: [],
  assetMix: [],
  plans: [],
  suppliers: [],
  annualSpendTotal: 0,
  controlMode: 'Approve',
  uploads: [],
});

export function AppProvider({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceData>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const pushToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  /** Resolve the bearer token and run an authenticated API call. */
  const withToken = useCallback(
    async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      return fn(token);
    },
    [getToken],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { workspace: data } = await withToken((token) => api.getWorkspace(token));
      setWorkspace(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [withToken]);

  useEffect(() => {
    if (isSignedIn) void refresh();
  }, [isSignedIn, refresh]);

  const setControlMode = useCallback(
    async (mode: ControlMode) => {
      setWorkspace((prev) => ({ ...prev, controlMode: mode }));
      await withToken((token) => api.setControlMode(token, mode));
    },
    [withToken],
  );

  const setActionStatus = useCallback(
    async (id: string, status: ActionStatus) => {
      setWorkspace((prev) => ({
        ...prev,
        actions: prev.actions.map((a) => (a.id === id ? { ...a, status } : a)),
      }));
      await withToken((token) => api.setActionStatus(token, id, status));
    },
    [withToken],
  );

  const advanceAction = useCallback(
    async (id: string) => {
      const current = workspace.actions.find((a) => a.id === id);
      if (current) {
        if (current.status === 'Recommended') pushToast(`Approved: ${current.title}`);
        else if (current.status === 'Approved')
          pushToast(`Automated: ${current.title} — EnerOS will now control this asset.`);
      }
      const { action } = await withToken((token) => api.advanceAction(token, id));
      setWorkspace((prev) => ({
        ...prev,
        actions: prev.actions.map((a) => (a.id === id ? action : a)),
      }));
    },
    [workspace.actions, withToken, pushToast],
  );

  const recoverInvoice = useCallback(
    async (id: string) => {
      const { invoice } = await withToken((token) => api.recoverInvoice(token, id));
      setWorkspace((prev) => ({
        ...prev,
        invoices: prev.invoices.map((inv) => (inv.id === id ? invoice : inv)),
      }));
      pushToast('Recovery requested — EnerOS will challenge this invoice with the supplier.');
    },
    [withToken, pushToast],
  );

  const analyseUpload = useCallback(
    async (payload: UploadPayload): Promise<Invoice> => {
      const { invoice } = await withToken((token) => api.createInvoice(token, { ...payload }));
      setWorkspace((prev) => ({ ...prev, invoices: [invoice, ...prev.invoices] }));
      pushToast(
        invoice.issues.length > 0
          ? `AI audit complete — ${invoice.issues.length} issue${invoice.issues.length > 1 ? 's' : ''} found on ${invoice.id}.`
          : `AI audit complete — ${invoice.id} is clean.`,
      );
      return invoice;
    },
    [withToken, pushToast],
  );

  const uploadDocument = useCallback(
    async (file: File, invoiceId?: string) => {
      const { upload } = await withToken((token) => api.uploadDocument(token, file, invoiceId));
      setWorkspace((prev) => ({ ...prev, uploads: [upload, ...prev.uploads] }));
      pushToast(`Uploaded ${upload.filename} to Cloudflare R2.`);
      return upload;
    },
    [withToken, pushToast],
  );

  const deleteUpload = useCallback(
    async (id: string) => {
      await withToken((token) => api.deleteUpload(token, id));
      setWorkspace((prev) => ({ ...prev, uploads: prev.uploads.filter((u) => u.id !== id) }));
    },
    [withToken],
  );

  const documentUrl = useCallback(
    async (id: string) => {
      const { url } = await withToken((token) => api.documentUrl(token, id));
      return url;
    },
    [withToken],
  );

  const metrics = useMemo<Metrics>(() => {
    const { sites, invoices, actions, monthly } = workspace;
    const spendActual = sum(sites.map((s) => s.monthActual));
    const spendExpected = sum(sites.map((s) => s.monthExpected));
    const savings = spendExpected - spendActual;
    const previousMonthSpend = monthly[monthly.length - 2]?.actual ?? spendActual;
    const flagged = invoices.filter((i) => i.status === 'Flagged');
    const issuesValue = Math.abs(sum(flagged.flatMap((i) => i.issues.map((issue) => issue.impact))));
    const potentialMonthlySaving = sum(actions.map((a) => a.monthlySaving));
    const committedSaving = sum(
      actions.filter((a) => a.status !== 'Recommended').map((a) => a.monthlySaving),
    );
    const automatedSaving = sum(
      actions.filter((a) => a.status === 'Automated').map((a) => a.monthlySaving),
    );

    return {
      spendActual,
      spendExpected,
      savings,
      savingsRate: spendExpected === 0 ? 0 : (savings / spendExpected) * 100,
      previousMonthSpend,
      momChangePct:
        previousMonthSpend === 0
          ? 0
          : ((spendActual - previousMonthSpend) / previousMonthSpend) * 100,
      issuesOpen: flagged.length,
      issuesValue,
      invoicesAudited: invoices.length,
      potentialMonthlySaving,
      committedSaving,
      automatedSaving,
    };
  }, [workspace]);

  const getSiteById = useCallback(
    (id: string) => workspace.sites.find((s) => s.id === id),
    [workspace.sites],
  );

  const value: AppContextValue = {
    account: workspace.account,
    sites: workspace.sites,
    invoices: workspace.invoices,
    actions: workspace.actions,
    monthly: workspace.monthly,
    assetMix: workspace.assetMix,
    plans: workspace.plans,
    suppliers: workspace.suppliers,
    annualSpendTotal: workspace.annualSpendTotal,
    controlMode: workspace.controlMode,
    uploads: workspace.uploads,
    loading,
    error,
    refresh,
    setControlMode,
    setActionStatus,
    advanceAction,
    recoverInvoice,
    analyseUpload,
    uploadDocument,
    deleteUpload,
    documentUrl,
    metrics,
    toast,
    pushToast,
    getSiteById,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an <AppProvider>');
  }
  return ctx;
}


