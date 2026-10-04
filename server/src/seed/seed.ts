/**
 * EnerOS seed script.
 *
 *   cd server && npm run seed
 *
 * Creates the demo account in Clerk and populates MongoDB with the EnerOS demo
 * dataset for that Clerk user. Both clients then access the same workspace.
 */
import { createClerkClient } from '@clerk/backend';
import { connectDb, disconnectDb } from '../db.js';
import { assertClerkConfigured, env } from '../env.js';
import { ownerIdFromClerkUser } from '../auth.js';
import { provisionWorkspace } from '../services/workspace.js';
import { AccountModel, ActionModel, InvoiceModel, SiteModel } from '../models/index.js';

/** Ensure a Clerk user exists for the demo email, returning their Clerk user id. */
async function ensureClerkDemoUser(): Promise<string> {
  const client = createClerkClient({
    secretKey: env.clerkSecretKey,
    publishableKey: env.clerkPublishableKey,
  });

  const existing = await client.users.getUserList({
    emailAddress: [env.demo.email],
    limit: 1,
  });
  const found = existing.data?.[0];
  if (found) {
    console.log(`• Clerk demo user already exists (${found.id})`);
    return found.id;
  }

  const [firstName, ...rest] = env.demo.name.split(' ');
  const created = await client.users.createUser({
    emailAddress: [env.demo.email],
    password: env.demo.password,
    firstName: firstName || 'Demo',
    lastName: rest.join(' ') || 'Operator',
  });
  console.log(`• Created Clerk demo user (${created.id})`);
  return created.id;
}

async function main(): Promise<void> {
  assertClerkConfigured();
  await connectDb();
  console.log('✓ Connected to MongoDB');

  const clerkId = await ensureClerkDemoUser();
  const ownerId = ownerIdFromClerkUser(clerkId);

  console.log(`• Seeding workspace for ${ownerId}…`);
  await provisionWorkspace(ownerId, true);

  const [sites, invoices, actions, account] = await Promise.all([
    SiteModel.countDocuments({ ownerId }),
    InvoiceModel.countDocuments({ ownerId }),
    ActionModel.countDocuments({ ownerId }),
    AccountModel.findOne({ ownerId }).lean().exec(),
  ]);

  console.log('\n✓ Seed complete');
  console.log(`  workspace : ${account?.name ?? env.demo.org}`);
  console.log(`  sites     : ${sites}`);
  console.log(`  invoices  : ${invoices}`);
  console.log(`  actions   : ${actions}`);
  console.log('\n  ── Demo login (use on BOTH web and mobile) ──');
  console.log(`  email    : ${env.demo.email}`);
  console.log(`  password : ${env.demo.password}`);
  console.log('  auth mode: Clerk\n');

  await disconnectDb();
}

main().catch(async (error) => {
  console.error('✗ Seed failed:', error instanceof Error ? error.message : error);
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
