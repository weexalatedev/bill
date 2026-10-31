'use client';
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
import { api, type IntakeResult, type SiteDraft, type UploadedDocument, type WorkspaceData } from './lib/api';
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
  addSite: (draft: SiteDraft) => Promise<Site>;
  removeSite: (id: string) => Promise<void>;
  analyseUpload: (payload: UploadPayload) => Promise<Invoice>;
  analyseBillFile: (
    file: File,
    siteId: string,
  ) => Promise<{ result: IntakeResult; invoice: Invoice | null }>;
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

/** Human label for a bill period from ISO dates, e.g. "Feb 2026 – Mar 2026". */
function billPeriod(start: string, end: string): string {
  const label = (iso: string): string | null => {
    const date = iso ? new Date(iso) : null;
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
      : null;
  };
  const from = label(start);
  const to = label(end);
  if (from && to && from !== to) return `${from} – ${to}`;
  return from ?? to ?? 'Latest bill';
}

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

  /**
   * The primary intake path: upload a bill file, have the AI read it (OCR when
   * there is no text layer), and — when the figures were readable — file it as
   * an audited invoice against the chosen site so it appears in the list.
   */
  const analyseBillFile = useCallback(
    async (file: File, siteId: string): Promise<{ result: IntakeResult; invoice: Invoice | null }> => {
      const result = await withToken((token) => api.analyseFile(token, file, siteId || undefined));
      const e = (result.extracted ?? {}) as Record<string, unknown>;
      const supplier = typeof e.supplier === 'string' ? e.supplier.trim() : '';
      const consumptionKwh = typeof e.consumptionKwh === 'number' ? e.consumptionKwh : NaN;
      const unitRateP = typeof e.unitRateP === 'number' ? e.unitRateP : NaN;
      const standingChargeP = typeof e.standingChargeP === 'number' ? e.standingChargeP : NaN;

      let invoice: Invoice | null = null;
      if (
        result.ok &&
        supplier &&
        Number.isFinite(consumptionKwh) &&
        consumptionKwh > 0 &&
        Number.isFinite(unitRateP) &&
        unitRateP > 0 &&
        Number.isFinite(standingChargeP) &&
        standingChargeP >= 0
      ) {
        const start = typeof e.periodStart === 'string' ? e.periodStart : '';
        const end = typeof e.periodEnd === 'string' ? e.periodEnd : '';
        const { invoice: created } = await withToken((token) =>
          api.createInvoice(token, {
            siteId,
            supplier,
            period: billPeriod(start, end),
            consumptionKwh,
            unitRateP,
            standingChargeP,
          }),
        );
        invoice = created;
        setWorkspace((prev) => ({ ...prev, invoices: [created, ...prev.invoices] }));
        pushToast(
          created.issues.length > 0
            ? `Audited and filed as ${created.id} — ${created.issues.length} issue${created.issues.length > 1 ? 's' : ''} found.`
            : `Audited and filed as ${created.id} — this bill looks clean.`,
        );
      }
      return { result, invoice };
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

  const addSite = useCallback(
    async (draft: SiteDraft): Promise<Site> => {
      const { site } = await withToken((token) => api.createSite(token, draft));
      // `annualSpendTotal` is derived from the site list, so recompute it here
      // rather than refetching the whole workspace on every add.
      setWorkspace((prev) => {
        const sites = [...prev.sites, site];
        return {
          ...prev,
          sites,
          account: { ...prev.account, sites: sites.length },
          annualSpendTotal: sites.reduce((sum, s) => sum + s.annualSpend, 0),
        };
      });
      pushToast(`${site.name} added to the portfolio.`);
      return site;
    },
    [withToken, pushToast],
  );

  const removeSite = useCallback(
    async (id: string) => {
      const snapshot = workspace.sites;
      await withToken((token) => api.deleteSite(token, id));
      setWorkspace((prev) => {
        const sites = prev.sites.filter((s) => s.id !== id);
        return {
          ...prev,
          sites,
          invoices: prev.invoices.filter((i) => i.siteId !== id),
          actions: prev.actions.filter((a) => a.siteId !== id),
          account: { ...prev.account, sites: sites.length },
          annualSpendTotal: sites.reduce((sum, s) => sum + s.annualSpend, 0),
        };
      });
      pushToast(`Removed ${snapshot.find((s) => s.id === id)?.name ?? 'site'} from the portfolio.`);
    },
    [withToken, workspace.sites, pushToast],
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
    addSite,
    removeSite,
    analyseUpload,
    analyseBillFile,
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


