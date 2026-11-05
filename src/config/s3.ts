import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import fs from 'fs';
import { env } from './env';

// Uploads go to Cloudflare R2 when it's configured (S3-compatible API, no
// egress fees, served through Cloudflare's CDN), otherwise to AWS S3. Files
// already uploaded keep working either way — their full URLs are stored.
//
// Lazily built so the server can boot even before real credentials are
// filled in (see .env.example) — only the upload endpoints need them, and
// they fail with a clear message instead of crashing the whole process.

interface StorageTarget {
  client: S3Client;
  bucket: string;
  /** Public base URL, no trailing slash. */
  publicBase: string;
}

const isR2Configured = (): boolean =>
  Boolean(
    env.CLOUDFLARE_ACCESS_KEY_ID &&
      env.CLOUDFLARE_SECRET_ACCESS_KEY &&
      env.CLOUDFLARE_BUCKET &&
      env.CLOUDFLARE_S3_ENDPOINT &&
      env.CLOUDFLARE_PUBLIC_URL
  );

const isAwsConfigured = (): boolean => Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_S3_BUCKET);

const isS3Configured = (): boolean => isR2Configured() || isAwsConfigured();

let cachedTarget: StorageTarget | null = null;

const getTarget = (): StorageTarget => {
  if (cachedTarget) return cachedTarget;

  if (isR2Configured()) {
    cachedTarget = {
      client: new S3Client({
        region: 'auto',
        endpoint: env.CLOUDFLARE_S3_ENDPOINT,
        credentials: {
          accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID as string,
          secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY as string,
        },
      }),
      bucket: env.CLOUDFLARE_BUCKET as string,
      publicBase: (env.CLOUDFLARE_PUBLIC_URL as string).replace(/\/+$/, ''),
    };
  } else if (isAwsConfigured()) {
    cachedTarget = {
      client: new S3Client({
        region: env.AWS_REGION,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID as string,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY as string,
        },
      }),
      bucket: env.AWS_S3_BUCKET as string,
      publicBase: `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com`,
    };
  } else {
    throw new Error(
      'File storage is not configured. Set the CLOUDFLARE_* (R2) or AWS_* (S3) variables in .env before uploading.'
    );
  }

  return cachedTarget;
};

const buildKey = (originalName: string, folder: string) => {
  const extension = originalName.includes('.') ? originalName.split('.').pop() : undefined;
  return `${folder}/${Date.now()}-${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
};

// Uploaded names are unique (timestamp + uuid) and never overwritten, so the
// CDN and browsers may cache them for a year.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Uploads a single file buffer under `folder/` and returns its public URL.
 * The bucket is expected to allow public read (typical for banner and
 * invitation media); switch to signed URLs later if that changes.
 */
export const uploadBufferToS3 = async (
  buffer: Buffer,
  originalName: string,
  mimetype: string,
  folder: string
): Promise<string> => {
  const { client, bucket, publicBase } = getTarget();
  const key = buildKey(originalName, folder);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      CacheControl: CACHE_CONTROL,
    })
  );

  return `${publicBase}/${key}`;
};

/**
 * Streams a file from disk (for uploads too large to buffer in memory, e.g.
 * Vendor OS portfolio videos). Returns the public URL.
 */
export const uploadFileToS3 = async (
  filePath: string,
  originalName: string,
  mimetype: string,
  folder: string
): Promise<string> => {
  const { client, bucket, publicBase } = getTarget();
  const key = buildKey(originalName, folder);
  const { size } = await fs.promises.stat(filePath);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentLength: size,
      ContentType: mimetype,
      CacheControl: CACHE_CONTROL,
    })
  );

  return `${publicBase}/${key}`;
};

/**
 * Best-effort delete — callers should not fail if this errors. Only deletes
 * from the storage currently in use; an old AWS URL is left alone once R2
 * has taken over (its bucket isn't ours to clean up from here).
 */
export const deleteObjectFromS3ByUrl = async (url: string): Promise<void> => {
  if (!isS3Configured()) return;

  const { client, bucket, publicBase } = getTarget();
  const prefix = `${publicBase}/`;
  if (!url.startsWith(prefix)) return;

  const key = url.slice(prefix.length);
  if (!key) return;

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
};

export { isS3Configured };
