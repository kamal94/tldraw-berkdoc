import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { OnboardingService } from './onboarding.service';
import { GoogleDriveService, type DriveFileMetadata } from '../google-drive/google-drive.service';
import { DriveFileProcessorService } from '../google-drive/drive-file-processor.service';
import { DatabaseService } from '../database/database.service';
import { GoogleDriveSyncRequestedEvent } from '../google-drive/events/google-drive.events';
import {
  MetadataScanRequestedEvent,
  MetadataScanCompletedEvent,
  ProcessingConfirmedEvent,
} from './events/onboarding.events';

@Injectable()
export class OnboardingListener {
  private readonly logger = new Logger(OnboardingListener.name);

  constructor(
    private onboardingService: OnboardingService,
    private googleDriveService: GoogleDriveService,
    private driveFileProcessor: DriveFileProcessorService,
    private databaseService: DatabaseService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Handle metadata scan request - performs metadata-only scan of Drive
   * Uses incremental processing to write files to database as they're scanned
   */
  @OnEvent('onboarding.metadata.scan.requested')
  async handleMetadataScanRequested(event: MetadataScanRequestedEvent) {
    this.logger.log(`Starting metadata scan ${event.scanId} for user ${event.userId}`);

    // Clear any previous metadata-only documents for this user (those without content analyzed)
    this.databaseService.deleteDocumentsMetadataByUserId(event.userId);

    // Get user's email to exclude author from collaborator count
    const user = this.databaseService.findUserById(event.userId);
    const authorEmail = user?.email?.toLowerCase();

    try {
      // Track aggregations across all batches
      let totalSupportedFileCount = 0;
      let totalSupportedSizeBytes = 0;
      let totalUnsupportedFileCount = 0;
      let totalSharedDocCount = 0;
      const allCollaboratorEmails = new Set<string>();
      let totalSizeBytes = 0;
      let folderCount = 0;

      // Process files incrementally as they're scanned
      const snapshot = await this.googleDriveService.listAllFilesMetadata(
        event.userId,
        async (batchFiles: DriveFileMetadata[], batchFolderCount: number) => {
          folderCount += batchFolderCount;

          // Use shared processing service to process batch
          const result = this.driveFileProcessor.processFileMetadataBatch(
            batchFiles,
            event.userId,
          );

          // Store each file's metadata to database (including URL and classification)
          // File type breakdown is now computed from documents table, not stored in onboarding
          for (const processed of result.processedFiles) {
            this.driveFileProcessor.storeFileMetadata(
              event.userId,
              processed.file,
              processed,
            );

            // Increment scan progress counter
            this.databaseService.incrementMetadataFilesScanned(event.userId);
          }

          // Aggregate results across batches
          totalSupportedFileCount += result.supportedFileCount;
          totalSupportedSizeBytes += result.supportedSizeBytes;
          totalUnsupportedFileCount += result.unsupportedFileCount;
          totalSharedDocCount += result.sharedDocCount;
          totalSizeBytes += result.totalSizeBytes;

          // Merge collaborator emails (author already excluded by processFileMetadataBatch, but add safeguard)
          for (const processed of result.processedFiles) {
            processed.collaboratorEmails.forEach((email) => {
              // Extra safeguard: exclude author email if somehow it got through
              if (email !== authorEmail) {
                allCollaboratorEmails.add(email);
              }
            });
          }

          // Update onboarding table incrementally after each batch for live stats
          // Don't mark as complete during incremental updates
          // File type breakdown is computed from documents table when needed
          this.onboardingService.updateMetadataSnapshot(
            event.userId,
            {
              totalFileCount: totalSupportedFileCount + totalUnsupportedFileCount,
              totalSizeBytes,
              folderCount,
              supportedFileCount: totalSupportedFileCount,
              supportedSizeBytes: totalSupportedSizeBytes,
              unsupportedFileCount: totalUnsupportedFileCount,
              sharedDocCount: totalSharedDocCount,
              uniqueCollaboratorCount: allCollaboratorEmails.size,
            },
            false,
          );
        },
      );

      // Final update with complete snapshot - mark as complete
      // File type breakdown is computed from documents table when needed
      this.onboardingService.updateMetadataSnapshot(
        event.userId,
        {
          totalFileCount: snapshot.totalFileCount,
          totalSizeBytes: snapshot.totalSizeBytes,
          folderCount: snapshot.folderCount,
          supportedFileCount: totalSupportedFileCount,
          supportedSizeBytes: totalSupportedSizeBytes,
          unsupportedFileCount: totalUnsupportedFileCount,
          sharedDocCount: totalSharedDocCount,
          uniqueCollaboratorCount: allCollaboratorEmails.size,
        },
        true,
      );

      // Track estimated cost for telemetry
      this.onboardingService.updateEstimatedCost(event.userId, totalSupportedFileCount);

      // Emit completion event
      this.eventEmitter.emit(
        'onboarding.metadata.scan.completed',
        new MetadataScanCompletedEvent(
          event.userId,
          event.scanId,
          snapshot.totalFileCount,
          totalSupportedFileCount,
        ),
      );

      this.logger.log(
        `Metadata scan ${event.scanId} completed for user ${event.userId}: ` +
        `${totalSupportedFileCount} supported files out of ${snapshot.totalFileCount} total`,
      );
    } catch (error) {
      this.logger.error(
        `Metadata scan ${event.scanId} failed for user ${event.userId}`,
        error,
      );
    }
  }

  /**
   * Handle processing confirmed - trigger the actual content sync
   */
  @OnEvent('onboarding.processing.confirmed')
  async handleProcessingConfirmed(event: ProcessingConfirmedEvent) {
    this.logger.log(`Processing confirmed for user ${event.userId}, triggering sync`);

    // Emit the Google Drive sync event which will now proceed
    // because the user has confirmed processing
    this.eventEmitter.emit(
      'google.drive.sync.requested',
      new GoogleDriveSyncRequestedEvent(event.userId),
    );
  }
}
