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
    pricePerSite: 49,
    tagline: 'Find and fix what you are wasting.',
    features: [
      'Bill auditing and error detection',
      'Live monitoring dashboard',
      'AI energy assistant (Copilot)',
      'Anomaly and overnight-waste detection',
      'Monthly cost-saving plan',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    pricePerSite: 149,
    tagline: 'Continuously reduce what you spend.',
    highlight: true,
    features: [
      'Everything in Starter',
      'Half-hourly consumption analysis',
      'Consumption and price forecasting',
      'Tariff optimisation and dispute letters',
      'Verified savings reports',
      'Multi-site management',
    ],
  },
  {
    id: 'autonomous',
    name: 'Autonomous',
    pricePerSite: 249,
    tagline: 'Let EnerOS run the eligible assets for you.',
    features: [
      'Everything in Growth',
      'Automated EV charger control (with approval)',
      'Battery optimisation',
      'Flexibility market participation',
      'Advanced integrations (BMS, VPP, hardware)',
      'Safety-limited: never refrigeration or alarms',
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
