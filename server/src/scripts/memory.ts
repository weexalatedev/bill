/**
 * Local API with in-memory MongoDB. Clerk credentials are still required;
 * authenticated users receive a demo workspace automatically.
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
  const { default: app } = await import('../app.js');

  await connectDb();
  app.listen(env.port, () => {
    console.log(`EnerOS API (in-memory) on http://localhost:${env.port}`);
    console.log('  auth mode: Clerk');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
