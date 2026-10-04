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

/** Static plan catalogue — identical for every workspace. */
export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    pricePerSite: 99,
    tagline: 'Understand where your energy goes.',
    features: [
      'Live monitoring dashboard',
      'AI energy assistant (Copilot)',
      'Automated bill analysis',
      'Anomaly detection',
      'Monthly recommendations',
    ],
  },
  {
    id: 'optimise',
    name: 'Optimise',
    pricePerSite: 199,
    tagline: 'Continuously reduce what you spend.',
    highlight: true,
    features: [
      'Everything in Starter',
      'Consumption & price forecasting',
      'Tariff optimisation',
      'Automated recommendations',
      'Savings measurement & verification',
      'Meter, BMS & supplier integrations',
    ],
  },
  {
    id: 'autonomous',
    name: 'Autonomous',
    pricePerSite: 349,
    tagline: 'Let EnerOS run the site for you.',
    features: [
      'Everything in Optimise',
      'Automated asset controls',
      'EV fleet optimisation',
      'Battery optimisation',
      'Flexibility market participation',
      'Advanced integrations (BMS, VPP, hardware)',
    ],
  },
];

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
