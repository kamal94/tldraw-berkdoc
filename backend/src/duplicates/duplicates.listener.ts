import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DuplicatesService } from './duplicates.service';
import {
  // DocumentCreatedEvent,
  // DocumentUpdatedEvent,
  DocumentDeletedEvent,
} from '../ingestion/events/document.events';

@Injectable()
export class DuplicatesListener {
  private readonly logger = new Logger(DuplicatesListener.name);

  constructor(private duplicatesService: DuplicatesService) {}

  // @OnEvent('document.created')
  // async handleDocumentCreated(event: DocumentCreatedEvent) {
  //   this.logger.log(
  //     `Queuing duplicate detection for newly created document: ${event.id}`,
  //   );

  //   // Queue duplicate detection for the user
  //   // We use a delay to ensure embeddings are processed first
  //   setTimeout(() => {
  //     this.duplicatesService
  //       .detectAllDuplicates(event.userId)
  //       .then((result) => {
  //         this.logger.log(
  //           `Duplicate detection completed for user ${event.userId}: ${result.chunkDuplicates} chunk duplicates, ${result.documentDuplicates} document duplicates`,
  //         );
  //       })
  //       .catch((error) => {
  //         this.logger.error(
  //           `Failed to detect duplicates after document creation for user ${event.userId}`,
  //           error,
  //         );
  //       });
  //   }, 5000); // Wait 5 seconds for embeddings to be processed
  // }

  // @OnEvent('document.updated')
  // async handleDocumentUpdated(event: DocumentUpdatedEvent) {
  //   this.logger.log(
  //     `Queuing duplicate detection for updated document: ${event.id}`,
  //   );

  //   // Delete existing duplicates for this document first
  //   try {
  //     await this.duplicatesService.deleteDuplicatesForDocument(event.id);
  //     this.logger.debug(`Cleaned up existing duplicates for document ${event.id}`);
  //   } catch (error) {
  //     this.logger.warn(
  //       `Failed to clean up duplicates for document ${event.id}`,
  //       error,
  //     );
  //   }

  //   // Queue duplicate detection for the user
  //   // We use a delay to ensure embeddings are processed first
  //   setTimeout(() => {
  //     this.duplicatesService
  //       .detectAllDuplicates(event.userId)
  //       .then((result) => {
  //         this.logger.log(
  //           `Duplicate detection completed for user ${event.userId}: ${result.chunkDuplicates} chunk duplicates, ${result.documentDuplicates} document duplicates`,
  //         );
  //       })
  //       .catch((error) => {
  //         this.logger.error(
  //           `Failed to detect duplicates after document update for user ${event.userId}`,
  //           error,
  //         );
  //       });
  //   }, 5000); // Wait 5 seconds for embeddings to be processed
  // }

  @OnEvent('document.deleted')
  async handleDocumentDeleted(event: DocumentDeletedEvent) {
    this.logger.log(
      `Cleaning up duplicates for deleted document: ${event.id}`,
    );

    try {
      await this.duplicatesService.deleteDuplicatesForDocument(event.id);
      this.logger.log(
        `Successfully cleaned up duplicates for document ${event.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to clean up duplicates for document ${event.id}`,
        error,
      );
    }
  }
}
