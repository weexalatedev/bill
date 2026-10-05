import type {
  ActionStatus,
  ControlMode,
  Invoice,
  OptimisationAction,
  Site,
} from '../types.js';
import {
  AccountModel,
  ActionModel,
  AssetMixModel,
  InvoiceModel,
  MonthlyModel,
  SiteModel,
  UploadModel,
} from '../models/index.js';
import {
  account as demoAccount,
  actions as demoActions,
  assetMix as demoAssetMix,
  invoices as demoInvoices,
  monthly as demoMonthly,
  sites as demoSites,
} from '../seed/data.js';
import { PLANS, SUPPLIERS, type UploadedDocument, type Workspace } from './catalog.js';

/** True when the owner already has any site data. */
export async function hasWorkspace(ownerId: string): Promise<boolean> {
  const count = await SiteModel.countDocuments({ ownerId }).exec();
  return count > 0;
}

/**
 * Seed the demo dataset for a given owner.
 * `wipe` clears the owner's data first — used by `npm run seed`.
 */
export async function provisionWorkspace(ownerId: string, wipe = false): Promise<void> {
  if (wipe) {
    await Promise.all([
      SiteModel.deleteMany({ ownerId }),
      InvoiceModel.deleteMany({ ownerId }),
      ActionModel.deleteMany({ ownerId }),
      MonthlyModel.deleteMany({ ownerId }),
      AssetMixModel.deleteMany({ ownerId }),
      AccountModel.deleteMany({ ownerId }),
      UploadModel.deleteMany({ ownerId }),
    ]);
  }

  await SiteModel.insertMany(demoSites.map((s) => ({ ...s, ownerId })));
  await InvoiceModel.insertMany(demoInvoices.map((i) => ({ ...i, ownerId })));
  await ActionModel.insertMany(demoActions.map((a) => ({ ...a, ownerId })));
  await MonthlyModel.insertMany(demoMonthly.map((m) => ({ ...m, ownerId })));
  await AssetMixModel.insertMany(demoAssetMix.map((a) => ({ ...a, ownerId })));
  await AccountModel.create({ ...demoAccount, ownerId, controlMode: 'Approve' });
}

/** Fields a client may supply when adding or editing a site. */
export interface SiteInput {
  name: string;
  city: string;
  region: string;
  type: Site['type'];
  annualSpend: number;
  monthActual: number;
  monthExpected: number;
  meterType: Site['meterType'];
  status: Site['status'];
  postcode?: string;
  loads: string[];
  lastSynced: string;
}

/**
 * Mint a site id that cannot collide with the demo dataset (`s1`…`s12`) or with
 * anything already stored for this owner. The `(ownerId, id)` index is unique, so
 * a clash would throw; probing keeps creation total instead of failing.
 */
async function nextSiteId(ownerId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `s-${Math.random().toString(36).slice(2, 8)}`;
    const clash = await SiteModel.exists({ ownerId, id: candidate });
    if (!clash) return candidate;
  }
  return `s-${Date.now().toString(36)}`;
}

/** Create a site for an owner and keep the account's site count in step. */
export async function addSite(ownerId: string, input: SiteInput): Promise<Site> {
  const created = await SiteModel.create({ ...input, ownerId, id: await nextSiteId(ownerId) });
  const site = strip(created.toObject()) as unknown as Site;
  // `account.sites` is denormalised for the dashboard; recompute rather than
  // increment so it self-heals if earlier counts ever drifted.
  const total = await SiteModel.countDocuments({ ownerId });
  await AccountModel.updateOne({ ownerId }, { $set: { sites: total } }, { upsert: true }).exec();
  return site;
}

/** Update the editable fields of a site. Returns null when it does not exist. */
export async function updateSite(
  ownerId: string,
  id: string,
  patch: Partial<SiteInput>,
): Promise<Site | null> {
  const doc = await SiteModel.findOneAndUpdate(
    { ownerId, id },
    { $set: patch },
    { new: true, runValidators: true },
  )
    .lean()
    .exec();
  return doc ? (strip(doc as unknown as Record<string, unknown>) as unknown as Site) : null;
}

/**
 * Delete a site and everything scoped to it.
 *
 * Invoices and actions carry `siteId`, so removing a site without clearing them
 * would leave rows the UI can never resolve to a name. `MonthlyPoint` and
 * `AssetSlice` are deliberately left alone: both are portfolio-wide aggregates
 * (one doc per month / per asset), not per-site, so they have no `siteId` to
 * match on and would survive regardless.
 */
export async function removeSite(ownerId: string, id: string): Promise<boolean> {
  const existing = await SiteModel.exists({ ownerId, id });
  if (!existing) return false;

  await Promise.all([
    SiteModel.deleteOne({ ownerId, id }),
    InvoiceModel.deleteMany({ ownerId, siteId: id }),
    ActionModel.deleteMany({ ownerId, siteId: id }),
  ]);

  const total = await SiteModel.countDocuments({ ownerId });
  await AccountModel.updateOne({ ownerId }, { $set: { sites: total } }).exec();
  return true;
}

/** Load the full workspace for an owner, provisioning a demo dataset on first run. */
export async function getWorkspace(ownerId: string, autoProvision: boolean): Promise<Workspace> {
  if (autoProvision && !(await hasWorkspace(ownerId))) {
    await provisionWorkspace(ownerId);
  }

  const [account, sites, invoices, actions, monthly, assetMix, uploads] = await Promise.all([
    AccountModel.findOne({ ownerId }).lean().exec(),
    SiteModel.find({ ownerId }).sort({ id: 1 }).lean().exec(),
    InvoiceModel.find({ ownerId }).sort({ _id: -1 }).lean().exec(),
    ActionModel.find({ ownerId }).sort({ id: 1 }).lean().exec(),
    MonthlyModel.find({ ownerId }).lean().exec(),
    AssetMixModel.find({ ownerId }).lean().exec(),
    UploadModel.find({ ownerId }).sort({ createdAt: -1 }).lean().exec(),
  ]);

  const cleanSites = sites.map(strip) as unknown as Site[];
  const accountView = strip(account ?? {}) as unknown as Workspace['account'];
  const controlMode: ControlMode =
    (account?.controlMode as ControlMode | undefined) ?? 'Approve';

  return {
    account: accountView,
    sites: cleanSites,
    invoices: invoices.map(strip) as unknown as Invoice[],
    actions: actions.map(strip) as unknown as OptimisationAction[],
    monthly: monthly.map(strip) as unknown as Workspace['monthly'],
    assetMix: assetMix.map(strip) as unknown as Workspace['assetMix'],
    plans: PLANS,
    suppliers: SUPPLIERS,
    annualSpendTotal: cleanSites.reduce((sum, s) => sum + s.annualSpend, 0),
    controlMode,
    uploads: uploads.map(strip) as unknown as UploadedDocument[],
  };
}

export async function setControlMode(ownerId: string, mode: ControlMode): Promise<void> {
  await AccountModel.updateOne({ ownerId }, { $set: { controlMode: mode } }, { upsert: true }).exec();
}

export async function setActionStatus(
  ownerId: string,
  id: string,
  status: ActionStatus,
): Promise<OptimisationAction | null> {
  const doc = await ActionModel.findOneAndUpdate(
    { ownerId, id },
    { $set: { status } },
    { new: true },
  )
    .lean()
    .exec();
  return doc ? (strip(doc) as unknown as OptimisationAction) : null;
}

/** Recommend → Approve → Automate progression, mirrors the client-side original. */
export async function advanceAction(
  ownerId: string,
  id: string,
): Promise<OptimisationAction | null> {
  const current = await ActionModel.findOne({ ownerId, id }).lean().exec();
  if (!current) return null;
  const status = current.status as ActionStatus;
  const next: ActionStatus =
    status === 'Recommended' ? 'Approved' : status === 'Approved' ? 'Automated' : status;
  if (next === status) return strip(current) as unknown as OptimisationAction;
  return setActionStatus(ownerId, id, next);
}

export async function recoverInvoice(ownerId: string, id: string): Promise<Invoice | null> {
  const doc = await InvoiceModel.findOneAndUpdate(
    { ownerId, id },
    { $set: { status: 'Recovered' } },
    { new: true },
  )
    .lean()
    .exec();
  return doc ? (strip(doc) as unknown as Invoice) : null;
}

/** Strip Mongo internals so DTOs match the shared domain types exactly. */
function strip(doc: Record<string, unknown>): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === '_id' || key === 'ownerId') continue;
    rest[key] = value;
  }
  return rest;
}
