/**
 * Zero-config local API: boots an in-memory MongoDB, seeds the demo workspace,
 * then serves the API. Handy when you don't have a mongod running.
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
  const { env } = await import('../env.js');
  const { ownerIdFromEmail } = await import('../auth.js');
  const { provisionWorkspace } = await import('../services/workspace.js');
  const { createApp } = await import('../app.js');

  await connectDb();
  await provisionWorkspace(ownerIdFromEmail(env.demo.email), true);

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`EnerOS API (in-memory) on http://localhost:${env.port}`);
    console.log(`  demo login: ${env.demo.email} / ${env.demo.password}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
