import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Enabled, env } from './env.js';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!r2Enabled) {
    throw new Error('Cloudflare R2 is not configured (set R2_* environment variables)');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
  }
  return client;
}

export interface StoredObject {
  key: string;
  /** Public URL if a custom domain is configured, otherwise null. */
  url: string | null;
}

/** Upload a buffer to R2 under `key`. */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<StoredObject> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, url: publicUrl(key) };
}

/** Delete an object from R2. */
export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
}

/** A permanent URL when a public base URL / custom domain is configured. */
export function publicUrl(key: string): string | null {
  if (!env.r2.publicBaseUrl) return null;
  return `${env.r2.publicBaseUrl.replace(/\/$/, '')}/${key}`;
}

/** A short-lived signed GET URL — used when the bucket is private. */
export async function presignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
    { expiresIn },
  );
}
