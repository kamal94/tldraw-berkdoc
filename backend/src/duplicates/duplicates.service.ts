import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService, type DuplicateRow } from '../database/database.service';
import { WeaviateService } from '../weaviate/weaviate.service';
import { QueueService } from '../queue/queue.service';

export interface DuplicateResult {
  id: string;
  userId: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  sourceChunkIndex?: number;
  targetChunkIndex?: number;
  similarityScore: number;
  duplicateType: 'chunk' | 'document';
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class DuplicatesService {
  private readonly logger = new Logger(DuplicatesService.name);
  private readonly similarityThreshold = parseFloat(
    process.env.DUPLICATE_SIMILARITY_THRESHOLD || '0.85',
  ); // Lowered from 0.9 to 0.85, configurable via env var

  constructor(
    private databaseService: DatabaseService,
    private weaviateService: WeaviateService,
    private queueService: QueueService,
  ) {}

  /**
   * Detect document-level duplicates using document embeddings
   */
  async detectDocumentDuplicates(userId: string): Promise<number> {
    this.logger.log(`Starting document duplicate detection for user ${userId}`);

    try {
      // Get all document embeddings for the user
      const documents = await this.weaviateService.getUserDocumentsWithVectors(userId);
      this.logger.log(`Found ${documents.length} documents for user ${userId}`);

      if (documents.length === 0) {
        return 0;
      }

      const processedPairs = new Set<string>();
      let duplicatesFound = 0;

      // Process documents in batches to avoid overwhelming the system
      const batchSize = 50;
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        this.logger.debug(
          `Processing document batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`,
        );

        for (const document of batch) {
          if (!document.vector || document.vector.length === 0) {
            this.logger.warn(
              `Document ${document.documentId} has no vector, skipping`,
            );
            continue;
          }

          // Search for similar documents
          const similarDocuments = await this.weaviateService.searchSimilarDocuments(
            document.vector,
            userId,
            100, // Increase limit to find more matches
          );

          // Filter and process similar documents
          for (const similar of similarDocuments) {
            // Skip if same document or below threshold
            if (similar.documentId === document.documentId) {
              continue;
            }
            
            if (similar.score < this.similarityThreshold) {
              // Log near-misses for debugging (within 0.1 of threshold)
              const thresholdDiff = this.similarityThreshold - similar.score;
              if (thresholdDiff <= 0.1 && similar.score >= this.similarityThreshold - 0.1) {
                this.logger.debug(
                  `Near-miss: ${document.documentId} <-> ${similar.documentId}: ${similar.score.toFixed(3)} (threshold: ${this.similarityThreshold}, diff: ${thresholdDiff.toFixed(3)})`,
                );
              }
              continue;
            }

            // Create a unique pair identifier (always use lexicographically smaller ID first)
            const sourceDocId =
              document.documentId < similar.documentId
                ? document.documentId
                : similar.documentId;
            const targetDocId =
              document.documentId < similar.documentId
                ? similar.documentId
                : document.documentId;
            const pairKey = `${sourceDocId}:${targetDocId}`;

            // Skip if we've already processed this pair
            if (processedPairs.has(pairKey)) {
              continue;
            }

            processedPairs.add(pairKey);

            // Check if duplicate already exists
            const existing = this.findExistingDuplicate(
              userId,
              sourceDocId,
              targetDocId,
              undefined,
              undefined,
              'document',
            );

            if (!existing) {
              // Create duplicate record
              const duplicateId = this.generateId();
              this.databaseService.createDocumentDuplicate({
                id: duplicateId,
                userId,
                sourceDocumentId: sourceDocId,
                targetDocumentId: targetDocId,
                similarityScore: similar.score,
                duplicateType: 'document',
              });
              duplicatesFound++;
              this.logger.debug(
                `Found duplicate: ${sourceDocId} <-> ${targetDocId} (score: ${similar.score.toFixed(3)})`,
              );
            }
          }
        }
      }

      this.logger.log(
        `Document duplicate detection completed. Found ${duplicatesFound} new duplicates for user ${userId}`,
      );
      return duplicatesFound;
    } catch (error) {
      this.logger.error(`Failed to detect document duplicates for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Find all duplicates for a specific document
   */
  async findDuplicatesForDocument(
    userId: string,
    documentId: string,
  ): Promise<DuplicateResult[]> {
    const rows = this.databaseService.findDuplicatesByDocumentId(documentId);
    return rows
      .filter((row) => row.user_id === userId)
      .map((row) => this.rowToDuplicate(row));
  }

  /**
   * Find all duplicates for a user
   */
  async findDuplicatesForUser(userId: string): Promise<DuplicateResult[]> {
    const rows = this.databaseService.findDuplicatesByUserId(userId);
    return rows.map((row) => this.rowToDuplicate(row));
  }

  /**
   * Delete all duplicate records for a document
   */
  async deleteDuplicatesForDocument(documentId: string): Promise<void> {
    this.databaseService.deleteDuplicatesByDocumentId(documentId);
  }

  /**
   * Clear all duplicate records for a user
   */
  async clearDuplicatesForUser(userId: string): Promise<number> {
    this.logger.log(`Clearing all duplicates for user ${userId}`);
    
    // Get count before deletion for logging
    const duplicates = this.databaseService.findDuplicatesByUserId(userId);
    const count = duplicates.length;
    
    // Delete all duplicates for the user
    this.databaseService.deleteDuplicatesByUserId(userId);
    
    this.logger.log(`Cleared ${count} duplicate records for user ${userId}`);
    return count;
  }

  /**
   * Run document-level duplicate detection
   */
  async detectAllDuplicates(userId: string): Promise<{
    chunkDuplicates: number;
    documentDuplicates: number;
  }> {
    this.logger.log(`Starting document duplicate detection for user ${userId}`);

    const documentDuplicates = await this.queueService.queueWeaviate(
      () => this.detectDocumentDuplicates(userId),
      `detect-document-duplicates-${userId}`,
    );

    return {
      chunkDuplicates: 0, // No longer detecting chunk duplicates
      documentDuplicates,
    };
  }

  /**
   * Check if a duplicate already exists
   */
  private findExistingDuplicate(
    userId: string,
    sourceDocumentId: string,
    targetDocumentId: string,
    sourceChunkIndex: number | undefined,
    targetChunkIndex: number | undefined,
    duplicateType: 'chunk' | 'document',
  ): DuplicateRow | null {
    const allDuplicates = this.databaseService.findDuplicatesByUserId(userId);
    return (
      allDuplicates.find(
        (dup) =>
          dup.source_document_id === sourceDocumentId &&
          dup.target_document_id === targetDocumentId &&
          (duplicateType === 'document' ||
            (dup.source_chunk_index === sourceChunkIndex &&
              dup.target_chunk_index === targetChunkIndex)) &&
          dup.duplicate_type === duplicateType,
      ) || null
    );
  }

  private rowToDuplicate(row: DuplicateRow): DuplicateResult {
    return {
      id: row.id,
      userId: row.user_id,
      sourceDocumentId: row.source_document_id,
      targetDocumentId: row.target_document_id,
      sourceChunkIndex: row.source_chunk_index ?? undefined,
      targetChunkIndex: row.target_chunk_index ?? undefined,
      similarityScore: row.similarity_score,
      duplicateType: row.duplicate_type as 'chunk' | 'document',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private generateId(): string {
    return `dup_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
