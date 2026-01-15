import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { AvatarStorageAdapter } from './avatar-storage.adapter';

@Injectable()
export class DatabaseBlobAdapter implements AvatarStorageAdapter {
  private readonly logger = new Logger(DatabaseBlobAdapter.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async get(hash: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const db = this.databaseService.getDatabase();
      const result = db
        .query('SELECT data, content_type FROM avatar_cache WHERE hash = ?')
        .get(hash) as { data: Buffer; content_type: string } | undefined;

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
      const db = this.databaseService.getDatabase();

      db.query(
        `INSERT OR REPLACE INTO avatar_cache (hash, content_type, data, original_url, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(hash, contentType, data, originalUrl || '', new Date().toISOString());
    } catch (error) {
      this.logger.error(`Error storing avatar in cache: ${error}`);
      throw error;
    }
  }

  async exists(hash: string): Promise<boolean> {
    try {
      const db = this.databaseService.getDatabase();
      const result = db
        .query('SELECT 1 FROM avatar_cache WHERE hash = ? LIMIT 1')
        .get(hash);

      return !!result;
    } catch (error) {
      this.logger.error(`Error checking avatar existence: ${error}`);
      return false;
    }
  }

  async delete(hash: string): Promise<void> {
    try {
      const db = this.databaseService.getDatabase();
      db.query('DELETE FROM avatar_cache WHERE hash = ?').run(hash);
    } catch (error) {
      this.logger.error(`Error deleting avatar from cache: ${error}`);
      throw error;
    }
  }
}
