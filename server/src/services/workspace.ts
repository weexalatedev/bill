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
