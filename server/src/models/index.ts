import { Schema, model, type InferSchemaType } from 'mongoose';
import type {
  Account,
  AssetSlice,
  Invoice,
  MonthlyPoint,
  OptimisationAction,
  Site,
} from '../types.js';

/**
 * Every document is scoped to a Clerk owner (`clerk:<userId>`). Both the web
 * and mobile clients resolve to the same owner when signed into the same
 * account, which keeps the two apps in sync.
 */
const baseFields = {
  ownerId: { type: String, required: true },
} as const;

const schemaOptions = {
  versionKey: false,
  /** Disable Mongoose's virtual `id`, our domain already carries a string `id`. */
  id: false,
  toJSON: {
    transform(_doc: unknown, ret: Record<string, unknown>) {
      delete ret._id;
      delete ret.ownerId;
      return ret;
    },
  },
} as const;

// ── Sites ─────────────────────────────────────────────────────────────────────
const siteSchema = new Schema(
  {
    ...baseFields,
    id: { type: String, required: true },
    name: { type: String, required: true },
    city: String,
    region: String,
    type: String,
    annualSpend: Number,
    monthActual: Number,
    monthExpected: Number,
    meterType: String,
    status: String,
    postcode: String,
    loads: [String],
    lastSynced: String,
    /** How much real consumption data we hold for this site. */
    dataQuality: {
      consumption: { type: String, default: 'none' },
      coveragePct: { type: Number, default: 0 },
      lastReadingAt: String,
    },
  },
  schemaOptions,
);
siteSchema.index({ ownerId: 1, id: 1 }, { unique: true });
export const SiteModel = model('Site', siteSchema);

// ── Invoices ──────────────────────────────────────────────────────────────────
const billIssueSchema = new Schema(
  {
    type: String,
    detail: String,
    impact: Number,
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    ...baseFields,
    id: { type: String, required: true },
    siteId: { type: String, required: true },
    supplier: String,
    period: String,
    consumptionKwh: Number,
    unitRateP: Number,
    standingChargeP: Number,
    total: Number,
    status: String,
    issues: [billIssueSchema],
  },
  schemaOptions,
);
invoiceSchema.index({ ownerId: 1, id: 1 }, { unique: true });
export const InvoiceModel = model('Invoice', invoiceSchema);

// ── Optimisation actions ──────────────────────────────────────────────────────
const actionSchema = new Schema(
  {
    ...baseFields,
    id: { type: String, required: true },
    title: { type: String, required: true },
    asset: String,
    siteId: String,
    fromSchedule: String,
    toSchedule: String,
    monthlySaving: Number,
    confidence: Number,
    status: String,
    rationale: String,
  },
  schemaOptions,
);
actionSchema.index({ ownerId: 1, id: 1 }, { unique: true });
export const ActionModel = model('Action', actionSchema);

// ── Monthly history / asset mix / account (one doc per owner) ──────────────────
const monthlySchema = new Schema(
  {
    ...baseFields,
    month: String,
    actual: Number,
    expected: Number,
  },
  schemaOptions,
);
monthlySchema.index({ ownerId: 1, month: 1 }, { unique: true });
export const MonthlyModel = model('MonthlyPoint', monthlySchema);

const assetMixSchema = new Schema(
  {
    ...baseFields,
    asset: String,
    kwh: Number,
    spend: Number,
  },
  schemaOptions,
);
assetMixSchema.index({ ownerId: 1, asset: 1 }, { unique: true });
export const AssetMixModel = model('AssetSlice', assetMixSchema);

const accountSchema = new Schema(
  {
    ...baseFields,
    name: String,
    planId: String,
    sites: Number,
    contractStart: String,
    performanceFeePct: Number,
    flexibilitySharePct: Number,
    controlMode: { type: String, default: 'Approve' },
    /** Captured during onboarding, used for pricing and cap-region benchmarking. */
    postcode: String,
    /** Ofgem price-cap region id resolved from the postcode. */
    region: String,
    onboarded: { type: Boolean, default: false },
    /** Billing state, driven by Stripe (or dev-mode activation). */
    subscriptionStatus: { type: String, default: 'none' },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    currentPeriodEnd: String,
  },
  schemaOptions,
);
accountSchema.index({ ownerId: 1 }, { unique: true });
export const AccountModel = model('Account', accountSchema);

// ── Half-hourly consumption ───────────────────────────────────────────────────
const consumptionSchema = new Schema(
  {
    ...baseFields,
    siteId: { type: String, required: true },
    /** Start of the settlement period (30 minutes). */
    from: { type: Date, required: true },
    kwh: { type: Number, required: true },
  },
  schemaOptions,
);
consumptionSchema.index({ ownerId: 1, siteId: 1, from: 1 }, { unique: true });
export const ConsumptionModel = model('Consumption', consumptionSchema);

// ── Uploaded documents (Cloudflare R2 objects) ─────────────────────────────────
const uploadSchema = new Schema(
  {
    ...baseFields,
    id: { type: String, required: true },
    key: { type: String, required: true },
    filename: String,
    contentType: String,
    size: Number,
    url: String,
    invoiceId: String,
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  schemaOptions,
);
uploadSchema.index({ ownerId: 1, id: 1 }, { unique: true });
export const UploadModel = model('Upload', uploadSchema);

export type SiteDoc = InferSchemaType<typeof siteSchema> & Site;
export type InvoiceDoc = InferSchemaType<typeof invoiceSchema> & Invoice;
export type ActionDoc = InferSchemaType<typeof actionSchema> & OptimisationAction;
export type MonthlyDoc = InferSchemaType<typeof monthlySchema> & MonthlyPoint;
export type AssetMixDoc = InferSchemaType<typeof assetMixSchema> & AssetSlice;
export type AccountDoc = InferSchemaType<typeof accountSchema> & Account;
