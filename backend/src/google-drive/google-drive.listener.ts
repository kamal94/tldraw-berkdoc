import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { GoogleDriveService } from './google-drive.service';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from '../documents/documents.service';
import { QueueService } from '../queue/queue.service';
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
    private queueService: QueueService,
  ) {}

  @OnEvent('google.drive.sync.requested')
  async handleSyncRequested(event: GoogleDriveSyncRequestedEvent) {
    this.logger.log(`Sync requested for user ${event.userId}`);
    try {
      let pageToken: string | undefined = undefined;
      let pageCount = 0;
      let totalFilesDiscovered = 0;

      do {
        pageCount++;
        this.logger.log(`Fetching page ${pageCount} of Google Drive files for user ${event.userId}${pageToken ? ` (continuing from previous page)` : ''}`);
        
        const { files, nextPageToken } = await this.googleDriveService.listFilesPage(
          event.userId,
          pageToken,
        );

        this.logger.log(`Fetched ${files.length} files on page ${pageCount}`);

        for (const file of files) {
          if (!file.id || !file.name || !file.mimeType || !file.modifiedTime) continue;
          
          // Use emitAsync to ensure events are processed asynchronously
          this.eventEmitter.emitAsync(
            'google.drive.file.discovered',
            new GoogleDriveFileDiscoveredEvent(event.userId, {
              id: file.id,
              name: file.name,
              mimeType: file.mimeType,
              modifiedTime: file.modifiedTime,
              webViewLink: file.webViewLink || undefined,
            }),
          ).catch((error) => {
            this.logger.error(
              `Failed to emit file.discovered event for ${file.name}`,
              error,
            );
          });
          totalFilesDiscovered++;
        }

        pageToken = nextPageToken;
      } while (pageToken);

      this.logger.log(`Completed pagination: discovered ${totalFilesDiscovered} total files across ${pageCount} page(s) for user ${event.userId}`);
    } catch (error) {
      this.logger.error(`Failed to list files for user ${event.userId}`, error);
    }
  }

  @OnEvent('google.drive.file.discovered')
  async handleFileDiscovered(event: GoogleDriveFileDiscoveredEvent) {
    const { userId, file } = event;
    this.logger.log(`Queuing file ${file.name} (${file.id}) for user ${userId}`);

    // Queue the file processing to avoid blocking the event loop
    this.queueService.queueFileProcessing(
      async () => {
        this.logger.log(`Processing file ${file.name} (${file.id}) for user ${userId}`);

        try {
          const existingDoc = this.databaseService.findDocumentByGoogleFileId(file.id);

          // Skip if already synced and not modified
          if (existingDoc && existingDoc.google_modified_time === file.modifiedTime) {
            this.logger.debug(`File ${file.name} is already up to date, skipping.`);
            return;
          }

          this.logger.log(`Downloading and extracting text for ${file.name}...`);
          // Now returns both content and file metadata (permissions, revisions)
          const { content, permissions, revisions } =
            await this.googleDriveService.downloadAndExtractText(
              userId,
              file.id,
              file.mimeType,
            );

          // Extract collaborators from permissions and revisions
          const collaborators =
            this.googleDriveService.extractCollaborators(permissions, revisions);

          if (existingDoc) {
            this.logger.log(`Updating existing document for ${file.name}`);

            // Delete old collaborators and insert new ones
            this.databaseService.deleteCollaboratorsByDocumentId(existingDoc.id);
            this.databaseService.upsertCollaboratorsForDocument(
              existingDoc.id,
              collaborators,
            );

            await this.documentsService.update(userId, existingDoc.id, {
              title: file.name,
              content,
              url: file.webViewLink,
              googleModifiedTime: file.modifiedTime,
            });
          } else {
            this.logger.log(`Creating new document for ${file.name}`);
            const document = await this.documentsService.create(userId, {
              title: file.name,
              content,
              url: file.webViewLink,
              source: 'google-drive',
              googleFileId: file.id,
              googleModifiedTime: file.modifiedTime,
            });

            // Store collaborators after document creation
            this.databaseService.upsertCollaboratorsForDocument(
              document.id,
              collaborators,
            );
          }
        } catch (error) {
          this.logger.error(`Failed to process file ${file.name} for user ${userId}`, error);
          throw error; // Re-throw so queue service can track failures
        }
      },
      `process-file-${file.id}`,
    ).catch((error) => {
      // Error already logged by queue service
      this.logger.error(
        `File processing job failed for ${file.name} (${file.id})`,
        error,
      );
    });
  }
}

