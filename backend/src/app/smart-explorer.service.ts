import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service';
import { WeaviateService } from '../weaviate/weaviate.service';
import { DocumentsService } from '../documents/documents.service';
import { BoardsService } from '../boards/boards.service';

@Injectable()
export class SmartExplorerService {
  private readonly logger = new Logger(SmartExplorerService.name);

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly weaviateService: WeaviateService,
    private readonly documentsService: DocumentsService,
    private readonly boardsService: BoardsService,
  ) {}

  /**
   * Process smart explorer query: search for documents and add them to board
   * @returns count of documents added
   */
  async processSmartExplorer(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<{ count: number }> {
    this.logger.log(`Processing smart explorer for user ${userId}, query: "${query}"`);

    try {
      // 1. Generate embedding from query
      const queryVector = await this.embeddingService.embed(query);

      // 2. Search Weaviate for similar documents
      const results = await this.weaviateService.searchSimilar(queryVector, userId, limit);

      // 3. Extract unique documentIds from results
      const documentScores = new Map<string, { score: number }>();

      for (const result of results) {
        const existing = documentScores.get(result.documentId);
        if (!existing || result.score > existing.score) {
          documentScores.set(result.documentId, {
            score: result.score,
          });
        }
      }

      const documentIds = Array.from(documentScores.keys());
      this.logger.log(`Found ${documentIds.length} unique documents`);

      if (documentIds.length === 0) {
        return { count: 0 };
      }

      // 4. Fetch full Document entities and add to board
      let addedCount = 0;
      for (const documentId of documentIds) {
        try {
          const document = await this.documentsService.findOne(userId, documentId);
          await this.boardsService.addDocumentShape(userId, document);
          addedCount++;
        } catch (error) {
          // Log error but continue with other documents
          this.logger.warn(
            `Failed to add document ${documentId} to board: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(`Added ${addedCount} documents to board for user ${userId}`);
      return { count: addedCount };
    } catch (error) {
      this.logger.error(
        `Error processing smart explorer for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
