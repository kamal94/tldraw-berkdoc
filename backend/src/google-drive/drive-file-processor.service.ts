import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { GoogleDriveService, type DriveFileMetadata } from './google-drive.service';
import {
  classifyMimeType,
  getMimeTypeDisplayName,
} from '../onboarding/mime-types';
import type { FileTypeBreakdown } from '../onboarding/dto/onboarding.dto';

export interface ProcessedFileMetadata {
  file: DriveFileMetadata;
  classification: 'supported' | 'future' | 'ignored';
  displayName: string;
  sizeBytes: number;
  collaboratorEmails: Set<string>;
  isShared: boolean;
}

export interface FileMetadataProcessingResult {
  processedFiles: ProcessedFileMetadata[];
  fileTypeBreakdown: FileTypeBreakdown;
  supportedFileCount: number;
  supportedSizeBytes: number;
  unsupportedFileCount: number;
  sharedDocCount: number;
  uniqueCollaboratorCount: number;
  totalSizeBytes: number;
}

@Injectable()
export class DriveFileProcessorService {
  private readonly logger = new Logger(DriveFileProcessorService.name);

  constructor(
    private databaseService: DatabaseService,
    private googleDriveService: GoogleDriveService,
  ) {}

  /**
   * Process a batch of Drive files and extract metadata
   * This is the shared logic used by both onboarding and ingestion
   */
  processFileMetadataBatch(
    files: DriveFileMetadata[],
    userId: string,
  ): FileMetadataProcessingResult {
    // Get user's email to exclude author from collaborator count
    const user = this.databaseService.findUserById(userId);
    const authorEmail = user?.email?.toLowerCase();

    const fileTypeBreakdown: FileTypeBreakdown = {};
    let supportedFileCount = 0;
    let supportedSizeBytes = 0;
    let unsupportedFileCount = 0;
    let sharedDocCount = 0;
    const allCollaboratorEmails = new Set<string>();
    let totalSizeBytes = 0;

    const processedFiles: ProcessedFileMetadata[] = [];

    for (const file of files) {
      if (!file.id || !file.name || !file.mimeType) continue;

      const mimeType = file.mimeType;
      const size = parseInt(file.size || '0', 10);
      const classification = classifyMimeType(mimeType);
      const displayName = getMimeTypeDisplayName(mimeType);
      const collaboratorEmails = new Set<string>();
      const isShared = file.shared || false;

      // Extract collaborators from permissions (exclude author)
      if (file.permissions) {
        for (const perm of file.permissions) {
          if (perm.emailAddress && perm.type === 'user') {
            const email = perm.emailAddress.toLowerCase();
            // Exclude the author from collaborator count
            if (email !== authorEmail) {
              collaboratorEmails.add(email);
              allCollaboratorEmails.add(email);
            }
          }
        }
      }

      // Update file type breakdown
      if (!fileTypeBreakdown[mimeType]) {
        fileTypeBreakdown[mimeType] = {
          count: 0,
          sizeBytes: 0,
          displayName,
          classification,
        };
      }
      fileTypeBreakdown[mimeType].count++;
      fileTypeBreakdown[mimeType].sizeBytes += size;

      // Count supported vs unsupported
      if (classification === 'supported') {
        supportedFileCount++;
        supportedSizeBytes += size;
      } else {
        unsupportedFileCount++;
      }

      // Count shared documents
      if (isShared) {
        sharedDocCount++;
      }

      // Accumulate total size
      totalSizeBytes += size;

      processedFiles.push({
        file,
        classification,
        displayName,
        sizeBytes: size,
        collaboratorEmails,
        isShared,
      });
    }

    return {
      processedFiles,
      fileTypeBreakdown,
      supportedFileCount,
      supportedSizeBytes,
      unsupportedFileCount,
      sharedDocCount,
      uniqueCollaboratorCount: allCollaboratorEmails.size,
      totalSizeBytes,
    };
  }

  /**
   * Store file metadata to database (metadata-only, no content)
   * This is used during onboarding to create document records with metadata
   */
  storeFileMetadata(
    userId: string,
    file: DriveFileMetadata,
    processed: ProcessedFileMetadata,
  ): void {
    this.databaseService.upsertDocumentMetadata({
      userId,
      googleFileId: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      classification: processed.classification,
      sizeBytes: processed.sizeBytes,
      modifiedTime: file.modifiedTime,
      shared: processed.isShared,
      url: file.webViewLink,
    });
  }

  /**
   * Extract collaborator emails from file permissions
   * Used for counting unique collaborators during metadata scans
   * Note: Full collaborator details (name, avatar, role) are extracted during
   * ingestion when file content is downloaded
   */
  extractCollaboratorEmails(file: DriveFileMetadata, authorEmail?: string): Set<string> {
    const collaboratorEmails = new Set<string>();
    const normalizedAuthorEmail = authorEmail?.toLowerCase();

    if (file.permissions) {
      for (const perm of file.permissions) {
        if (perm.emailAddress && perm.type === 'user') {
          const email = perm.emailAddress.toLowerCase();
          // Exclude the author from collaborator count
          if (email !== normalizedAuthorEmail) {
            collaboratorEmails.add(email);
          }
        }
      }
    }

    return collaboratorEmails;
  }
}
