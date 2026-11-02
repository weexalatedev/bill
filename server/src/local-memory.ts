/**
 * Local API with an in-memory MongoDB. Sets MONGODB_URI *before* importing any
 * server module so env.js/db.js resolve the in-memory URI correctly.
 *
 *   cd server && npm run dev:memory
 *
 * Data lives only for the lifetime of the process. Clerk-format tokens are not
 * needed: with Clerk configured this still proxies to Clerk in production, and
 * with no keys it runs in dev-auth mode.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

async function main(): Promise<void> {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('eneros');

  const { connectDb } = await import('./db.js');
  const { clerkEnabled, env } = await import('./env.js');
  const { default: app } = await import('./app.js');

  await connectDb();
  app.listen(env.port, () => {
    console.log(`EnerOS API (in-memory) on http://localhost:${env.port}`);
    console.log(`  auth mode: ${clerkEnabled ? 'clerk' : 'dev (demo credentials)'}`);
    if (!clerkEnabled) {
      console.log(`  demo login: ${env.demo.email} / ${env.demo.password}`);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
