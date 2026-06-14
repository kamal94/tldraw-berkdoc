import { Logger } from '@nestjs/common';
import type { DatabaseService } from '../../database/database.service';
import type { AvatarStorageAdapter } from './avatar-storage.adapter';
import { DatabaseBlobAdapter } from './database-blob.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function hasR2Env(): boolean {
  return (
    !!process.env.R2_BUCKET &&
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY &&
    (!!process.env.R2_ENDPOINT || !!process.env.CLOUDFLARE_ACCOUNT_ID)
  );
}

function hasS3Env(): boolean {
  return (
    !!process.env.S3_BUCKET &&
    !!process.env.S3_ENDPOINT &&
    !!process.env.S3_ACCESS_KEY_ID &&
    !!process.env.S3_SECRET_ACCESS_KEY
  );
}

/**
 * Selects the avatar/blob storage backend from the environment, mirroring the
 * database driver pattern:
 *   - BLOB_DRIVER=r2|s3  -> S3-compatible object storage
 *   - BLOB_DRIVER=database (or unset with no object-store env) -> SQLite/D1 blob
 * Local development keeps the zero-config database blob default.
 */
export function createAvatarStorageAdapter(
  databaseService: DatabaseService,
  logger?: Logger,
): AvatarStorageAdapter {
  const explicit = (process.env.BLOB_DRIVER ?? '').toLowerCase();
  const useR2 = explicit === 'r2' || (explicit === '' && hasR2Env());
  const useS3 = explicit === 's3' || (explicit === '' && !useR2 && hasS3Env());

  if (useR2) {
    const endpoint =
      process.env.R2_ENDPOINT ??
      `https://${requireEnv('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
    const bucket = requireEnv('R2_BUCKET');
    logger?.log(`Using Cloudflare R2 avatar storage (bucket: ${bucket})`);
    return new S3StorageAdapter({
      bucket,
      endpoint,
      region: process.env.R2_REGION ?? 'auto',
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      prefix: process.env.R2_PREFIX,
    });
  }

  if (useS3) {
    const bucket = requireEnv('S3_BUCKET');
    logger?.log(`Using S3-compatible avatar storage (bucket: ${bucket})`);
    return new S3StorageAdapter({
      bucket,
      endpoint: requireEnv('S3_ENDPOINT'),
      region: process.env.S3_REGION ?? 'auto',
      accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
      prefix: process.env.S3_PREFIX,
    });
  }

  logger?.log('Using database blob avatar storage');
  return new DatabaseBlobAdapter(databaseService);
}
