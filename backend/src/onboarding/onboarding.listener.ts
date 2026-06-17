import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventBusService } from '../events/event-bus.service';
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
    private eventBus: EventBusService,
  ) {}

  /**
   * Handle metadata scan request - performs metadata-only scan of Drive
   * Uses incremental processing to write files to database as they're scanned
   */
  @OnEvent('onboarding.metadata.scan.requested')
  async handleMetadataScanRequested(event: MetadataScanRequestedEvent) {
    this.logger.log(`Starting metadata scan ${event.scanId} for user ${event.userId}`);

    // Clear any previous metadata-only documents for this user (those without content analyzed)
    await this.databaseService.deleteDocumentsMetadataByUserId(event.userId);

    // Get user's email to exclude author from collaborator count
    const user = await this.databaseService.findUserById(event.userId);
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
          const result = await this.driveFileProcessor.processFileMetadataBatch(
            batchFiles,
            event.userId,
          );

          // Batch-write all file metadata in a single D1 round-trip and
          // increment the scan counter once for the whole batch.
          await this.driveFileProcessor.storeFileMetadataBatch(event.userId, result.processedFiles);
          await this.databaseService.incrementMetadataFilesScannedBy(event.userId, result.processedFiles.length);

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
          await this.onboardingService.updateMetadataSnapshot(
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
      await this.onboardingService.updateMetadataSnapshot(
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
      await this.onboardingService.updateEstimatedCost(event.userId, totalSupportedFileCount);

      // Emit completion event
      await this.eventBus.publish(
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
    await this.eventBus.publish(
      'google.drive.sync.requested',
      new GoogleDriveSyncRequestedEvent(event.userId),
    );
  }
}
