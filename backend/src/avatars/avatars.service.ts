import { Injectable, Logger, Inject } from '@nestjs/common';
import { createHash } from 'crypto';
import type { AvatarStorageAdapter } from './storage/avatar-storage.adapter';

@Injectable()
export class AvatarsService {
  private readonly logger = new Logger(AvatarsService.name);

  constructor(
    @Inject('AvatarStorageAdapter')
    private readonly storageAdapter: AvatarStorageAdapter,
  ) {}

  /**
   * Generate SHA-256 hash from URL
   */
  generateHash(url: string): string {
    return createHash('sha256').update(url).digest('hex');
  }

  /**
   * Get cached avatar, fetching from Google if not in cache
   * @param googleUrl The original Google avatar URL
   * @returns Buffer and content type, or null if failed
   */
  async getCachedAvatar(
    googleUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!googleUrl || !googleUrl.startsWith('http')) {
      this.logger.warn(`Invalid Google URL: ${googleUrl}`);
      return null;
    }

    try {
      const hash = this.generateHash(googleUrl);

      // Check if exists in cache
      const exists = await this.storageAdapter.exists(hash);
      if (exists) {
        const cached = await this.storageAdapter.get(hash);
        if (cached) {
          this.logger.debug(`Avatar cache hit for hash: ${hash}`);
          return cached;
        }
      }

      // Cache miss - fetch from Google
      this.logger.log(`Cache miss for avatar, fetching from Google: ${googleUrl}`);
      const fetched = await this.fetchFromGoogle(googleUrl);

      if (!fetched) {
        return null;
      }

      // Store in cache (non-blocking - continue even if caching fails)
      await this.storeAvatarInCache(hash, fetched, googleUrl);

      return fetched;
    } catch (error) {
      this.logger.error(`Error getting cached avatar: ${error}`);
      return null;
    }
  }

  /**
   * Store avatar in cache, logging errors but not throwing
   */
  private async storeAvatarInCache(
    hash: string,
    fetched: { buffer: Buffer; contentType: string },
    googleUrl: string,
  ): Promise<void> {
    try {
      await this.storageAdapter.set(
        hash,
        fetched.buffer,
        fetched.contentType,
        googleUrl,
      );
      this.logger.log(`Avatar cached successfully with hash: ${hash}`);
    } catch (storageError) {
      this.logger.error(`Failed to store avatar in cache: ${storageError}`);
      // Continue anyway - return the fetched data even if caching failed
    }
  }

  /**
   * Fetch avatar image from Google URL
   */
  private async fetchFromGoogle(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BerkDoc/1.0)',
        },
      });

      if (!response.ok) {
        this.logger.warn(
          `Failed to fetch avatar from Google: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Get content type from response, default to image/png
      const contentType =
        response.headers.get('content-type') || 'image/png';

      return { buffer, contentType };
    } catch (error) {
      this.logger.error(`Error fetching avatar from Google: ${error}`);
      return null;
    }
  }
}
