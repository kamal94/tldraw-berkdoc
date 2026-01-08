import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { GoogleDriveService } from './google-drive.service';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from '../documents/documents.service';
import {
  GoogleDriveSyncRequestedEvent,
  GoogleDriveFileDiscoveredEvent,
} from './events/google-drive.events';

@Injectable()
export class GoogleDriveSyncListener {
  private readonly logger = new Logger(GoogleDriveSyncListener.name);

  constructor(
    private googleDriveService: GoogleDriveService,
    private databaseService: DatabaseService,
    private documentsService: DocumentsService,
    private eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('google.drive.sync.requested')
  async handleSyncRequested(event: GoogleDriveSyncRequestedEvent) {
    this.logger.log(`Sync requested for user ${event.userId}`);
    try {
      const files = await this.googleDriveService.listFiles(event.userId);
      this.logger.log(`Discovered ${files.length} files for user ${event.userId}`);

      // only filter the first 10 for now as we test
      for (const file of files.slice(0, 10)) {
        if (!file.id || !file.name || !file.mimeType || !file.modifiedTime) continue;
        
        this.eventEmitter.emit(
          'google.drive.file.discovered',
          new GoogleDriveFileDiscoveredEvent(event.userId, {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime,
            webViewLink: file.webViewLink || undefined,
          }),
        );
      }
    } catch (error) {
      this.logger.error(`Failed to list files for user ${event.userId}`, error);
    }
  }

  @OnEvent('google.drive.file.discovered')
  async handleFileDiscovered(event: GoogleDriveFileDiscoveredEvent) {
    const { userId, file } = event;
    this.logger.log(`Processing file ${file.name} (${file.id}) for user ${userId}`);

    try {
      const existingDoc = this.databaseService.findDocumentByGoogleFileId(file.id);

      // Skip if already synced and not modified
      if (existingDoc && existingDoc.google_modified_time === file.modifiedTime) {
        this.logger.debug(`File ${file.name} is already up to date, skipping.`);
        return;
      }

      this.logger.log(`Downloading and extracting text for ${file.name}...`);
      const content = await this.googleDriveService.downloadAndExtractText(
        userId,
        file.id,
        file.mimeType,
      );

      if (existingDoc) {
        this.logger.log(`Updating existing document for ${file.name}`);
        await this.documentsService.update(userId, existingDoc.id, {
          title: file.name,
          content,
          url: file.webViewLink,
          googleModifiedTime: file.modifiedTime,
        });
      } else {
        this.logger.log(`Creating new document for ${file.name}`);
        await this.documentsService.create(userId, {
          title: file.name,
          content,
          url: file.webViewLink,
          source: 'google-drive',
          googleFileId: file.id,
          googleModifiedTime: file.modifiedTime,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to process file ${file.name} for user ${userId}`, error);
    }
  }
}

