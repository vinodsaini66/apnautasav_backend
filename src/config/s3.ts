import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { env } from './env';

// Lazily built so the server can boot even before real AWS credentials are
// filled in (see .env.example) — only the upload endpoint needs them, and it
// fails with a clear message instead of crashing the whole process at start.
let cachedClient: S3Client | null = null;

const isS3Configured = (): boolean =>
  Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_S3_BUCKET);

const getS3Client = (): S3Client => {
  if (!isS3Configured()) {
    throw new Error(
      'AWS S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_S3_BUCKET in .env before uploading.'
    );
  }

  if (!cachedClient) {
    cachedClient = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY as string,
      },
    });
  }

  return cachedClient;
};

/**
 * Uploads a single file buffer to S3 under `folder/` and returns its public
 * URL. The bucket is expected to allow public read on this prefix (typical
 * for banner/marketing assets); switch to signed URLs later if that changes.
 */
export const uploadBufferToS3 = async (
  buffer: Buffer,
  originalName: string,
  mimetype: string,
  folder: string
): Promise<string> => {
  const client = getS3Client();

  const extension = originalName.includes('.') ? originalName.split('.').pop() : undefined;
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;

  await client.send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
  );

  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
};

/** Best-effort delete — banner deletion should not fail if this errors. */
export const deleteObjectFromS3ByUrl = async (url: string): Promise<void> => {
  if (!isS3Configured()) return;

  const marker = `.amazonaws.com/`;
  const index = url.indexOf(marker);
  if (index === -1) return;

  const key = url.slice(index + marker.length);
  if (!key) return;

  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }));
};

export { isS3Configured };
