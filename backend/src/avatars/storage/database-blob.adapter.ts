import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { AvatarStorageAdapter } from './avatar-storage.adapter';

@Injectable()
export class DatabaseBlobAdapter implements AvatarStorageAdapter {
  private readonly logger = new Logger(DatabaseBlobAdapter.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async get(hash: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const result = await this.databaseService.getAvatarCache(hash);

      if (!result) {
        return null;
      }

      return {
        buffer: Buffer.from(result.data),
        contentType: result.content_type || 'image/png', // Default fallback
      };
    } catch (error) {
      this.logger.error(`Error getting avatar from cache: ${error}`);
      return null;
    }
  }

  async set(hash: string, data: Buffer, contentType: string, originalUrl?: string): Promise<void> {
    try {
      await this.databaseService.setAvatarCache(hash, data, contentType, originalUrl);
    } catch (error) {
      this.logger.error(`Error storing avatar in cache: ${error}`);
      throw error;
    }
  }

  async exists(hash: string): Promise<boolean> {
    try {
      return await this.databaseService.avatarCacheExists(hash);
    } catch (error) {
      this.logger.error(`Error checking avatar existence: ${error}`);
      return false;
    }
  }

  async delete(hash: string): Promise<void> {
    try {
      await this.databaseService.deleteAvatarCache(hash);
    } catch (error) {
      this.logger.error(`Error deleting avatar from cache: ${error}`);
      throw error;
    }
  }
}
