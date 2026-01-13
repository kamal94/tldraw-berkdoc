import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmbeddingService } from '../embedding/embedding.service';
import { WeaviateService, type DocumentChunkData, type DocumentData } from '../weaviate/weaviate.service';
import { LlmService } from '../llm/llm.service';
import { DatabaseService } from '../database/database.service';
import { QueueService } from '../queue/queue.service';
import {
  DocumentCreatedEvent,
  DocumentUpdatedEvent,
  DocumentDeletedEvent,
} from './events/document.events';

type DocumentEvent = DocumentCreatedEvent | DocumentUpdatedEvent;

@Injectable()
export class IngestionListener {
  private readonly logger = new Logger(IngestionListener.name);

  // Chunk configuration
  private readonly chunkSize = 2000; // characters per chunk
  private readonly chunkOverlap = 50; // character overlap between chunks

  constructor(
    private embeddingService: EmbeddingService,
    private weaviateService: WeaviateService,
    private llmService: LlmService,
    private databaseService: DatabaseService,
    private queueService: QueueService,
  ) {}

  @OnEvent('document.created')
  async processEmbeddings(event: DocumentCreatedEvent) {
    this.logger.log(`Queuing embeddings processing for document: ${event.id}`);
    // Queue the embedding generation to avoid blocking
    this.queueService
      .queueEmbedding(
        () => this.generateEmbeddings(event),
        `embeddings-${event.id}`,
      )
      .catch((error) => {
        this.logger.error(
          `Failed to queue embeddings for document ${event.id}`,
          error,
        );
      });
  }

  @OnEvent('document.updated')
  async handleDocumentUpdated(event: DocumentUpdatedEvent) {
    this.logger.log(`Queuing re-processing for updated document: ${event.id}`);

    // Queue all operations - they will be processed with appropriate concurrency limits
    await Promise.all([
      this.queueDeleteOperations(event),
      this.queueLlmOperations(event),
      this.queueEmbeddingOperation(event),
    ]).catch((error) => {
      this.logger.error(
        `Failed to queue document update processing for ${event.id}`,
        error,
      );
    });
  }

  @OnEvent('document.deleted')
  async handleDocumentDeleted(event: DocumentDeletedEvent) {
    this.logger.log(`Removing document from vector store: ${event.id}`);

    try {
      await Promise.all([
        this.weaviateService.deleteDocumentChunks(event.id, event.userId),
        this.weaviateService.deleteDocumentEmbedding(event.id, event.userId),
      ]);
      this.logger.log(`Successfully removed chunks and document embedding for document ${event.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove chunks and document embedding for document ${event.id}`,
        error,
      );
    }
  }

  /**
   * Queue deletion of existing chunks and document embedding
   */
  private async queueDeleteOperations(event: DocumentUpdatedEvent): Promise<void> {
    return this.queueService
      .queueWeaviate(
        async () => {
          await this.weaviateService.deleteDocumentChunks(event.id, event.userId);
          await this.weaviateService.deleteDocumentEmbedding(event.id, event.userId);
        },
        `delete-chunks-${event.id}`,
      )
      .catch((error) => {
        this.logger.warn(
          `Failed to delete old chunks and document embedding for document ${event.id}`,
          error,
        );
      });
  }

  /**
   * Queue LLM operations (tags and summary extraction)
   */
  private async queueLlmOperations(event: DocumentUpdatedEvent): Promise<void> {
    await Promise.all([
      this.queueService
        .queueLlmOperation(() => this.extractTags(event), `tags-${event.id}`)
        .catch((error) => {
          this.logger.error(
            `Failed to queue tags extraction for document ${event.id}`,
            error,
          );
        }),
      this.queueService
        .queueLlmOperation(() => this.generateSummary(event), `summary-${event.id}`)
        .catch((error) => {
          this.logger.error(
            `Failed to queue summary generation for document ${event.id}`,
            error,
          );
        }),
    ]);
  }

  /**
   * Queue embedding generation operation
   */
  private async queueEmbeddingOperation(event: DocumentUpdatedEvent): Promise<void> {
    return this.queueService
      .queueEmbedding(() => this.generateEmbeddings(event), `embeddings-${event.id}`)
      .catch((error) => {
        this.logger.error(
          `Failed to queue embeddings for document ${event.id}`,
          error,
        );
      });
  }

  /**
   * Process tags: generate tags using LLM and update database
   */
  private async extractTags(event: DocumentEvent): Promise<void> {
    try {
      this.logger.log(`Generating tags for document ${event.id}...`);
      const tags = await this.llmService.generateTags(event.content);

      this.logger.log(`Generated tags for document ${event.id}: ${tags.join(', ')}`);

      await this.databaseService.updateDocument(event.id, { tags });
      this.logger.log(`Successfully processed tags for document ${event.id}`);
    } catch (error) {
      this.logger.error(`Failed to process tags for document ${event.id}`, error);
      throw error;
    }
  }

  /**
   * Process summary: generate summary using LLM and update database
   */
  private async generateSummary(event: DocumentEvent): Promise<void> {
    try {
      this.logger.log(`Generating summary for document ${event.id}...`);
      const summary = await this.llmService.generateSummary(event.content);

      this.logger.log(`Generated summary for document ${event.id}: ${summary}`);

      await this.databaseService.updateDocument(event.id, { summary });
      this.logger.log(`Successfully processed summary for document ${event.id}`);
    } catch (error) {
      this.logger.error(`Failed to process summary for document ${event.id}`, error);
      throw error;
    }
  }

  /**
   * Process embeddings: chunk document, generate embeddings, and store in Weaviate
   */
  private async generateEmbeddings(event: DocumentEvent): Promise<void> {
    try {
      const chunks = this.chunkDocument(event.content);
      this.logger.log(`Document ${event.id} split into ${chunks.length} chunks`);

      await this.processChunks(event, chunks);
      await this.computeAndStoreDocumentEmbedding(event);

      this.logger.log(`Successfully processed embeddings for document ${event.id}`);
    } catch (error) {
      this.logger.error(`Failed to process embeddings for document ${event.id}`, error);
      throw error;
    }
  }

  /**
   * Process all chunks: generate embeddings and store in Weaviate
   */
  private async processChunks(event: DocumentEvent, chunks: string[]): Promise<void> {
    const chunkPromises = chunks.map((chunk, index) =>
      this.processChunk(event, chunk, index, chunks.length),
    );

    await Promise.all(chunkPromises);
  }

  /**
   * Process a single chunk: generate embedding and store in Weaviate
   */
  private async processChunk(
    event: DocumentEvent,
    chunk: string,
    index: number,
    totalChunks: number,
  ): Promise<void> {
    try {
      const embedding = await this.queueService.queueEmbedding(
        () => this.embeddingService.embed(chunk),
        `embed-chunk-${event.id}-${index}`,
      );

      const chunkData: DocumentChunkData = {
        documentId: event.id,
        chunkIndex: index,
        content: chunk,
        title: event.title,
        source: event.source,
        userId: event.userId,
      };

      await this.queueService.queueWeaviate(
        () => this.weaviateService.storeChunk(chunkData, embedding),
        `store-chunk-${event.id}-${index}`,
      );

      this.logger.debug(
        `Stored chunk ${index + 1}/${totalChunks} for document ${event.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process chunk ${index} for document ${event.id}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Compute document embedding by averaging chunk embeddings and store it
   */
  private async computeAndStoreDocumentEmbedding(event: DocumentEvent): Promise<void> {
    try {
      this.logger.log(`Computing document embedding for document ${event.id}`);

      const chunksWithVectors = await this.weaviateService.getDocumentChunksWithVectors(
        event.id,
        event.userId,
      );

      if (chunksWithVectors.length === 0) {
        this.logger.warn(
          `No chunks found for document ${event.id}, skipping document embedding`,
        );
        return;
      }

      const validChunks = chunksWithVectors.filter(
        (chunk) => chunk.vector && chunk.vector.length > 0,
      );

      if (validChunks.length === 0) {
        this.logger.warn(
          `No valid chunk vectors found for document ${event.id}, skipping document embedding`,
        );
        return;
      }

      const avgVector = this.computeAverageVector(
        validChunks.map((chunk) => chunk.vector),
      );

      const documentData: DocumentData = {
        documentId: event.id,
        title: event.title,
        source: event.source,
        userId: event.userId,
      };

      await this.queueService.queueWeaviate(
        () => this.weaviateService.storeDocument(documentData, avgVector),
        `store-document-${event.id}`,
      );

      this.logger.log(
        `Successfully computed and stored document embedding for document ${event.id} (from ${validChunks.length} chunks)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to compute and store document embedding for document ${event.id}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Compute average vector from multiple chunk vectors
   * Sums all vectors, divides by count, and normalizes
   */
  private computeAverageVector(vectors: number[][]): number[] {
    if (vectors.length === 0) {
      throw new Error('Cannot compute average of empty vector array');
    }

    const dimension = vectors[0].length;
    const sum = new Array(dimension).fill(0);

    // Sum all vectors
    for (const vector of vectors) {
      if (vector.length !== dimension) {
        throw new Error(`Vector dimension mismatch: expected ${dimension}, got ${vector.length}`);
      }
      for (let i = 0; i < dimension; i++) {
        sum[i] += vector[i];
      }
    }

    // Compute average
    const avg = sum.map((val) => val / vectors.length);

    // L2 normalization
    const norm = Math.sqrt(avg.reduce((acc, val) => acc + val * val, 0));
    if (norm > 0) {
      return avg.map((val) => val / norm);
    }

    return avg;
  }

  /**
   * Split document content into overlapping chunks
   */
  private chunkDocument(content: string): string[] {
    const cleanedContent = this.normalizeContent(content);

    if (cleanedContent.length <= this.chunkSize) {
      return [cleanedContent];
    }

    return this.splitIntoChunks(cleanedContent);
  }

  /**
   * Normalize content by collapsing whitespace
   */
  private normalizeContent(content: string): string {
    return content.replace(/\s+/g, ' ').trim();
  }

  /**
   * Split normalized content into chunks with smart break points
   */
  private splitIntoChunks(content: string): string[] {
    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < content.length) {
      const endIndex = this.findChunkEndIndex(content, startIndex);
      const chunk = content.substring(startIndex, endIndex).trim();

      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      startIndex = this.calculateNextStartIndex(endIndex, chunks.length);
    }

    return chunks;
  }

  /**
   * Find the optimal end index for a chunk, preferring sentence/word boundaries
   */
  private findChunkEndIndex(content: string, startIndex: number): number {
    const idealEndIndex = startIndex + this.chunkSize;

    if (idealEndIndex >= content.length) {
      return content.length;
    }

    const searchStart = Math.max(idealEndIndex - 100, startIndex);
    const searchText = content.substring(searchStart, idealEndIndex);

    const sentenceEnd = this.findLastSentenceBoundary(searchText);
    if (sentenceEnd !== -1) {
      return searchStart + sentenceEnd + 1;
    }

    const wordEnd = content.lastIndexOf(' ', idealEndIndex);
    return wordEnd > startIndex ? wordEnd : idealEndIndex;
  }

  /**
   * Find the last sentence boundary in the search text
   */
  private findLastSentenceBoundary(text: string): number {
    return Math.max(
      text.lastIndexOf('. '),
      text.lastIndexOf('! '),
      text.lastIndexOf('? '),
      text.lastIndexOf('\n'),
    );
  }

  /**
   * Calculate the next start index with overlap, ensuring progress
   */
  private calculateNextStartIndex(endIndex: number, chunkCount: number): number {
    const nextStart = endIndex - this.chunkOverlap;
    const minProgress = chunkCount * (this.chunkSize - this.chunkOverlap) - this.chunkSize;

    return nextStart > minProgress ? nextStart : endIndex;
  }
}

