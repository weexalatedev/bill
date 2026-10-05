import app from './app.js';
import { connectDb } from './db.js';
import { clerkEnabled, r2Enabled, env } from './env.js';

async function main(): Promise<void> {
  try {
    await connectDb();
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('✗ Could not connect to MongoDB:', (error as Error).message);
    console.error('  Set MONGODB_URI in server/.env, or start a local mongod.');
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`EnerOS API listening on http://localhost:${env.port}`);
    console.log(`  auth mode: ${clerkEnabled ? 'Clerk' : 'dev (demo credentials)'}`);
    console.log(`  storage:   ${r2Enabled ? 'Cloudflare R2' : 'disabled'}`);
    if (!clerkEnabled) {
      console.log(`  demo login: ${env.demo.email} / ${env.demo.password}`);
    }
  });
}

void main();
