import type {
  Account,
  AssetSlice,
  ControlMode,
  Invoice,
  MonthlyPoint,
  OptimisationAction,
  Plan,
  Site,
} from '../types.js';
import { PLAN_CATALOG } from './plans.js';

/**
 * Static plan catalogue — identical for every workspace.
 *
 * The definitions (prices, limits, features) live in `./plans.ts`, which is the
 * single source of truth; this is the read-only projection the workspace
 * payload carries so the existing console keeps working unchanged.
 */
export const PLANS: Plan[] = PLAN_CATALOG.map(({ id, name, pricePerSite, tagline, features, highlight }) => ({
  id,
  name,
  pricePerSite,
  tagline,
  features,
  ...(highlight ? { highlight } : {}),
}));

/** Supplier names offered when uploading a new invoice. */
export const SUPPLIERS: string[] = [
  'British Gas Lite',
  'EDF Energy',
  'SSE',
  'npower Business',
  'E.ON Next',
  'ScottishPower',
  'Opus Energy',
  'Corona Energy',
  'TotalEnergies',
];

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

/** The full payload the clients hydrate their store from. */
export interface Workspace {
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
