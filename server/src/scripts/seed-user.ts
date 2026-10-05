/**
 * Seed the EnerOS demo dataset for a specific user, identified by email.
 *
 *   cd server && npm run seed:user -- you@example.com
 *   cd server && npm run seed:user -- you@example.com --dry-run
 *
 * `npm run seed` targets DEMO_EMAIL and will *create* that Clerk account if it is
 * missing. This script is for seeding a user who already signed up through the
 * app, so it never creates an account: if the email has no Clerk user it stops and
 * says so. That is the whole point — seeding `clerk:<someone-else's-id>` would
 * quietly attach data to the wrong account.
 *
 * Owner ids are mode-dependent (see server/src/auth.ts): with Clerk configured an
 * owner is `clerk:<clerkUserId>`, in dev-auth mode it is `user:<email>`. Seeding
 * the wrong form writes rows the API will never read, so the resolution is derived
 * from the same helpers the request middleware uses rather than being hardcoded.
 */
import { createClerkClient } from '@clerk/backend';
import { connectDb, disconnectDb } from '../db.js';
import { clerkEnabled, env } from '../env.js';
import { ownerIdFromClerkUser, ownerIdFromEmail } from '../auth.js';
import { hasWorkspace, provisionWorkspace } from '../services/workspace.js';
import { AccountModel, ActionModel, InvoiceModel, SiteModel } from '../models/index.js';

function parseArgs(argv: string[]): { email: string; dryRun: boolean } {
  const positional: string[] = [];
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`);
    else positional.push(arg);
  }

  const email = (positional[0] ?? process.env.SEED_EMAIL ?? '').trim().toLowerCase();
  if (!email) {
    throw new Error(
      'Usage: npm run seed:user -- <email> [--dry-run]\n' +
        '       (or set SEED_EMAIL=<email>)',
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`"${email}" is not a valid email address`);
  }
  return { email, dryRun };
}

/** Look up an existing Clerk user by email. Returns null rather than creating one. */
async function findClerkUserId(email: string): Promise<string | null> {
  const client = createClerkClient({
    secretKey: env.clerkSecretKey,
    publishableKey: env.clerkPublishableKey,
  });
  const result = await client.users.getUserList({ emailAddress: [email], limit: 1 });
  return result.data?.[0]?.id ?? null;
}

async function main(): Promise<void> {
  const { email, dryRun } = parseArgs(process.argv.slice(2));

  console.log(`• Target email : ${email}`);
  console.log(`• Auth mode    : ${clerkEnabled ? 'Clerk' : 'dev auth'}`);
  if (dryRun) console.log('• Mode         : DRY RUN — no writes');

  await connectDb();
  console.log('✓ Connected to MongoDB');

  let ownerId: string;
  if (clerkEnabled) {
    const clerkUserId = await findClerkUserId(email);
    if (!clerkUserId) {
      console.error(
        `\n✗ No Clerk user has the email ${email}.\n` +
          '  This script never creates accounts. Sign up through the app first,\n' +
          '  then re-run. (To seed the built-in demo account instead, use `npm run seed`.)',
      );
      await disconnectDb().catch(() => undefined);
      process.exit(1);
    }
    ownerId = ownerIdFromClerkUser(clerkUserId);
    console.log(`• Clerk user   : ${clerkUserId}`);
  } else {
    ownerId = ownerIdFromEmail(email);
    console.log('• Clerk not configured — using the dev-auth owner id');
  }

  console.log(`• Owner id     : ${ownerId}`);

  const [sites, invoices, actions, account] = await Promise.all([
    SiteModel.countDocuments({ ownerId }),
    InvoiceModel.countDocuments({ ownerId }),
    ActionModel.countDocuments({ ownerId }),
    AccountModel.findOne({ ownerId }).lean().exec(),
  ]);

  const existing = sites + invoices + actions;
  if (existing > 0) {
    console.log(
      `\n⚠ This owner already has data (${sites} sites, ${invoices} invoices, ` +
        `${actions} actions). Seeding replaces it.`,
    );
  } else if (await hasWorkspace(ownerId)) {
    console.log('\n⚠ hasWorkspace() reports existing sites; re-seeding will replace them.');
  }

  if (dryRun) {
    console.log('\n✓ Dry run complete — nothing was written.');
    console.log(`  would provision: ${ownerId}`);
    await disconnectDb();
    return;
  }

  console.log('\n• Provisioning demo dataset…');
  await provisionWorkspace(ownerId, true);

  const [newSites, newInvoices, newActions, newAccount] = await Promise.all([
    SiteModel.countDocuments({ ownerId }),
    InvoiceModel.countDocuments({ ownerId }),
    ActionModel.countDocuments({ ownerId }),
    AccountModel.findOne({ ownerId }).lean().exec(),
  ]);

  console.log('\n✓ Seed complete');
  console.log(`  owner    : ${ownerId}`);
  console.log(`  workspace: ${newAccount?.name ?? 'n/a'}`);
  console.log(`  sites    : ${newSites}`);
  console.log(`  invoices : ${newInvoices}`);
  console.log(`  actions  : ${newActions}`);
  console.log(`\n  Sign in as ${email} in the app to see this data.\n`);

  await disconnectDb();
}

main().catch(async (error) => {
  console.error('✗ Seed failed:', error instanceof Error ? error.message : error);
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});