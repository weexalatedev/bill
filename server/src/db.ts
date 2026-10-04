import mongoose from 'mongoose';
import { env } from './env.js';

/** Connect to MongoDB. Safe to call once at boot. */
export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDb,
    serverSelectionTimeoutMS: 8000,
  });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export const isDbConnected = (): boolean => mongoose.connection.readyState === 1;
