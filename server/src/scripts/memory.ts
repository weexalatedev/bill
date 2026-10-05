/**
 * Local API with in-memory MongoDB. Works with Clerk when configured, or in
 * dev-auth mode otherwise; authenticated users receive a demo workspace
 * automatically on first use.
 *
 *   cd server && npm run dev:memory
 *
 * Data lives only for the lifetime of the process.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

async function main(): Promise<void> {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('eneros');

  // env.ts / db.ts read process.env at import time, so import them only now.
  const { connectDb } = await import('../db.js');
  const { clerkEnabled, env } = await import('../env.js');
  const { default: app } = await import('../app.js');

  await connectDb();
  app.listen(env.port, () => {
    console.log(`EnerOS API (in-memory) on http://localhost:${env.port}`);
    console.log(`  auth mode: ${clerkEnabled ? 'Clerk' : 'dev (demo credentials)'}`);
    if (!clerkEnabled) {
      console.log(`  demo login: ${env.demo.email} / ${env.demo.password}`);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
