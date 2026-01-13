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
   * @param userId - The user ID
   * @param query - The search query
   * @param limit - Maximum number of documents to return (default: 10)
   * @returns count of documents added to the board
   */
  async processSmartExplorer(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<{ count: number }> {
    this.logger.log(`Processing smart explorer for user ${userId}, query: "${query}"`);

    try {
      const results = await this.searchSimilarDocuments(query, userId, limit);

      if (results.length === 0) {
        this.logger.log(`No documents found for query: "${query}"`);
        return { count: 0 };
      }

      const addedCount = await this.addDocumentsToBoard(userId, results);
      this.logger.log(`Added ${addedCount} documents to board for user ${userId}`);
      return { count: addedCount };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error processing smart explorer for user ${userId}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Search for similar documents using vector similarity
   * @param query - The search query
   * @param userId - The user ID
   * @param limit - Maximum number of results
   * @returns Array of search results with document IDs
   */
  private async searchSimilarDocuments(
    query: string,
    userId: string,
    limit: number,
  ) {
    const queryVector = await this.embeddingService.embed(query);
    const results = await this.weaviateService.searchSimilarDocuments(queryVector, userId, limit);
    this.logger.log(`Found ${results.length} similar documents`);
    return results;
  }

  /**
   * Add documents to the user's board
   * Shape validation happens automatically in addDocumentShape.
   * If validation fails, a readable error message will be logged and the document will be skipped.
   * @param userId - The user ID
   * @param results - Array of search results containing document IDs
   * @returns Number of documents successfully added
   */
  private async addDocumentsToBoard(
    userId: string,
    results: Array<{ documentId: string }>,
  ): Promise<number> {
    let addedCount = 0;

    for (const result of results) {
      try {
        const document = await this.documentsService.findDocumentWithCollaboratorsById(
          userId,
          result.documentId,
        );
        await this.boardsService.addDocumentShape(userId, document);
        addedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to add document ${result.documentId} to board: ${errorMessage}`,
        );
      }
    }

    return addedCount;
  }
}
