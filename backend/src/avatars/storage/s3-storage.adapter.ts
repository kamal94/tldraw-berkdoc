import { Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { AvatarStorageAdapter } from './avatar-storage.adapter';

export interface S3StorageConfig {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Key prefix for stored objects (e.g. "avatars/"). */
  prefix?: string;
}

/**
 * S3-compatible avatar storage. Works with Cloudflare R2 (its S3 API), AWS S3,
 * or any S3-compatible store (e.g. MinIO) so the same code is portable across
 * SaaS and self-hosted/enterprise deployments.
 */
export class S3StorageAdapter implements AvatarStorageAdapter {
  private readonly logger = new Logger(S3StorageAdapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ?? 'avatars/';
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // R2 and most S3-compatible stores require path-style addressing.
      forcePathStyle: true,
    });
  }

  private key(hash: string): string {
    return `${this.prefix}${hash}`;
  }

  async get(
    hash: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(hash) }),
      );

      if (!result.Body) {
        return null;
      }

      const bytes = await result.Body.transformToByteArray();
      return {
        buffer: Buffer.from(bytes),
        contentType: result.ContentType || 'image/png',
      };
    } catch (error) {
      if (this.isNotFound(error)) {
        return null;
      }
      this.logger.error(`Error getting avatar from S3: ${error}`);
      return null;
    }
  }

  async set(
    hash: string,
    data: Buffer,
    contentType: string,
    originalUrl?: string,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.key(hash),
          Body: data,
          ContentType: contentType,
          Metadata: originalUrl ? { 'original-url': originalUrl } : undefined,
        }),
      );
    } catch (error) {
      this.logger.error(`Error storing avatar in S3: ${error}`);
      throw error;
    }
  }

  async exists(hash: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(hash) }),
      );
      return true;
    } catch (error) {
      if (this.isNotFound(error)) {
        return false;
      }
      this.logger.error(`Error checking avatar existence in S3: ${error}`);
      return false;
    }
  }

  async delete(hash: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(hash) }),
      );
    } catch (error) {
      this.logger.error(`Error deleting avatar from S3: ${error}`);
      throw error;
    }
  }

  private isNotFound(error: unknown): boolean {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404;
  }
}
