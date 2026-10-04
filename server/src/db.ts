import mongoose from 'mongoose';
import { env } from './env.js';

let connection: Promise<void> | undefined;

/** Connect to MongoDB once, reusing the in-flight connection across requests. */
export async function connectDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  if (process.env.VERCEL === '1' && !process.env.MONGODB_URI?.trim()) {
    throw new Error('MONGODB_URI must be configured in the Vercel project environment.');
  }

  mongoose.set('strictQuery', true);
  connection ??= mongoose
    .connect(env.mongoUri, {
      dbName: env.mongoDb,
      serverSelectionTimeoutMS: 8000,
    })
    .then(() => undefined)
    .catch((error: unknown) => {
      connection = undefined;
      throw error;
    });
  await connection;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export const isDbConnected = (): boolean => mongoose.connection.readyState === 1;
