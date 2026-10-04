import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  account as accountData,
  actions as actionsData,
  annualSpendTotal,
  assetMix,
  invoices as invoicesData,
  monthly,
  plans,
  sites as sitesData,
  suppliers,
} from './data/mock';
import type {
  Account,
  ActionStatus,
  AssetSlice,
  BillIssue,
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
  setControlMode: (mode: ControlMode) => void;
  setActionStatus: (id: string, status: ActionStatus) => void;
  advanceAction: (id: string) => void;
  recoverInvoice: (id: string) => void;
  analyseUpload: (payload: UploadPayload) => Invoice;
  metrics: Metrics;
  toast: string | null;
  pushToast: (message: string) => void;
  getSiteById: (id: string) => Site | undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/** Heuristic "AI audit" of a freshly uploaded invoice. */
function auditInvoice(payload: UploadPayload, site: Site | undefined): BillIssue[] {
  const issues: BillIssue[] = [];
  const benchmarkKwh = site ? Math.round(site.monthActual / 0.26) : 20000;

  if (payload.consumptionKwh > benchmarkKwh * 1.1) {
    const overKwh = payload.consumptionKwh - benchmarkKwh;
    issues.push({
      type: 'Abnormal consumption',
      detail: `Consumption is ${Math.round((overKwh / benchmarkKwh) * 100)}% above comparable sites.`,
      impact: -Math.round((overKwh * payload.unitRateP) / 100),
    });
  }

  if (payload.unitRateP > 26) {
    issues.push({
      type: 'Tariff discrepancy',
      detail: `Unit rate of ${payload.unitRateP.toFixed(1)}p/kWh is above your contracted rate.`,
      impact: -Math.round(((payload.unitRateP - 26) * payload.consumptionKwh) / 100),
    });
  }

  if (payload.standingChargeP > 100) {
    issues.push({
      type: 'Standing charge',
      detail: 'Standing charge looks high for a meter with this profile — worth querying.',
      impact: -Math.round((payload.standingChargeP - 100) * 0.31),
    });
  }

  return issues;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [invoices, setInvoices] = useState<Invoice[]>(invoicesData);
  const [actions, setActions] = useState<OptimisationAction[]>(actionsData);
  const [controlMode, setControlMode] = useState<ControlMode>('Approve');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const pushToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  const setActionStatus = useCallback((id: string, status: ActionStatus) => {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  const advanceAction = useCallback(
    (id: string) => {
      setActions((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          if (a.status === 'Recommended') {
            pushToast(`Approved: ${a.title}`);
            return { ...a, status: 'Approved' };
          }
          if (a.status === 'Approved') {
            pushToast(`Automated: ${a.title} — EnerOS will now control this asset.`);
            return { ...a, status: 'Automated' };
          }
          return a;
        }),
      );
    },
    [pushToast],
  );

  const recoverInvoice = useCallback(
    (id: string) => {
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, status: 'Recovered' } : inv)),
      );
      pushToast('Recovery requested — EnerOS will challenge this invoice with the supplier.');
    },
    [pushToast],
  );

  const analyseUpload = useCallback(
    (payload: UploadPayload): Invoice => {
      const site = sitesData.find((s) => s.id === payload.siteId);
      const issues = auditInvoice(payload, site);
      const total =
        (payload.consumptionKwh * payload.unitRateP) / 100 + (payload.standingChargeP * 31) / 100;
      const invoice: Invoice = {
        id: `INV-2026-${Math.floor(1000 + Math.random() * 8999)}`,
        siteId: payload.siteId,
        supplier: payload.supplier,
        period: payload.period,
        consumptionKwh: payload.consumptionKwh,
        unitRateP: payload.unitRateP,
        standingChargeP: payload.standingChargeP,
        total: Math.round(total * 100) / 100,
        status: issues.length > 0 ? 'Flagged' : 'Clean',
        issues,
      };
      setInvoices((prev) => [invoice, ...prev]);
      pushToast(
        issues.length > 0
          ? `AI audit complete — ${issues.length} issue${issues.length > 1 ? 's' : ''} found on ${invoice.id}.`
          : `AI audit complete — ${invoice.id} is clean.`,
      );
      return invoice;
    },
    [pushToast],
  );

  const metrics = useMemo<Metrics>(() => {
    const spendActual = sum(sitesData.map((s) => s.monthActual));
    const spendExpected = sum(sitesData.map((s) => s.monthExpected));
    const savings = spendExpected - spendActual;
    const previousMonthSpend = monthly[monthly.length - 2]?.actual ?? spendActual;
    const flagged = invoices.filter((i) => i.status === 'Flagged');
    const issuesValue = Math.abs(
      sum(flagged.flatMap((i) => i.issues.map((issue) => issue.impact))),
    );
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
  }, [invoices, actions]);

  const getSiteById = useCallback((id: string) => sitesData.find((s) => s.id === id), []);

  const value: AppContextValue = {
    account: accountData,
    sites: sitesData,
    invoices,
    actions,
    monthly,
    assetMix,
    plans,
    suppliers,
    annualSpendTotal,
    controlMode,
    setControlMode,
    setActionStatus,
    advanceAction,
    recoverInvoice,
    analyseUpload,
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