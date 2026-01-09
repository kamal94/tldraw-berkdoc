import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmbeddingService } from '../embedding/embedding.service';
import { WeaviateService, type DocumentChunkData } from '../weaviate/weaviate.service';
import { LlmService } from '../llm/llm.service';
import { DatabaseService } from '../database/database.service';
import { QueueService } from '../queue/queue.service';
import {
  DocumentCreatedEvent,
  DocumentUpdatedEvent,
  DocumentDeletedEvent,
} from './events/document.events';

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

  // @OnEvent('document.created')
  // async processTags(event: DocumentCreatedEvent) {
  //   this.logger.log(`Processing tags for document: ${event.id}`);
  //   await this.extractTags(event);
  // }

  // @OnEvent('document.created')
  // async processSummary(event: DocumentCreatedEvent) {
  //   this.logger.log(`Processing summary for document: ${event.id}`);
  //   await this.generateSummary(event);
  // }

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
    Promise.all([
      // Delete existing chunks first (not queued, should be fast)
      this.queueService
        .queueWeaviate(
          () =>
            this.weaviateService.deleteDocumentChunks(event.id, event.userId),
          `delete-chunks-${event.id}`,
        )
        .catch((error) => {
          this.logger.warn(
            `Failed to delete old chunks for document ${event.id}`,
            error,
          );
        }),
      // Queue LLM operations
      this.queueService
        .queueLlmOperation(
          () => this.extractTags(event),
          `tags-${event.id}`,
        )
        .catch((error) => {
          this.logger.error(
            `Failed to queue tags extraction for document ${event.id}`,
            error,
          );
        }),
      this.queueService
        .queueLlmOperation(
          () => this.generateSummary(event),
          `summary-${event.id}`,
        )
        .catch((error) => {
          this.logger.error(
            `Failed to queue summary generation for document ${event.id}`,
            error,
          );
        }),
      // Queue embedding generation
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
        }),
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
      await this.weaviateService.deleteDocumentChunks(event.id, event.userId);
      this.logger.log(`Successfully removed chunks for document ${event.id}`);
    } catch (error) {
      this.logger.error(`Failed to remove chunks for document ${event.id}`, error);
    }
  }

  /**
   * Process tags: generate tags using LLM and update database
   */
  private async extractTags(
    event: DocumentCreatedEvent | DocumentUpdatedEvent,
  ): Promise<void> {
    try {
      this.logger.log(`Generating tags for document ${event.id}...`);
      // LLM call is already queued by the caller, but we ensure it's tracked
      const tags = await this.llmService.generateTags(event.content);

      this.logger.log(`Generated tags for document ${event.id}: ${tags.join(', ')}`);

      // Update document in database with tags
      this.databaseService.updateDocument(event.id, { tags });

      this.logger.log(`Successfully processed tags for document ${event.id}`);
    } catch (error) {
      this.logger.error(`Failed to process tags for document ${event.id}`, error);
      throw error;
    }
  }

  /**
   * Process summary: generate summary using LLM and update database
   */
  private async generateSummary(
    event: DocumentCreatedEvent | DocumentUpdatedEvent,
  ): Promise<void> {
    try {
      this.logger.log(`Generating summary for document ${event.id}...`);
      // LLM call is already queued by the caller, but we ensure it's tracked
      const summary = await this.llmService.generateSummary(event.content);

      this.logger.log(`Generated summary for document ${event.id}: ${summary}`);

      // Update document in database with summary
      this.databaseService.updateDocument(event.id, { summary });

      this.logger.log(`Successfully processed summary for document ${event.id}`);
    } catch (error) {
      this.logger.error(`Failed to process summary for document ${event.id}`, error);
      throw error;
    }
  }

  /**
   * Process embeddings: chunk document, generate embeddings, and store in Weaviate
   */
  private async generateEmbeddings(
    event: DocumentCreatedEvent | DocumentUpdatedEvent,
  ): Promise<void> {
    try {
      // Chunk the document
      const chunks = this.chunkDocument(event.content);
      this.logger.log(`Document ${event.id} split into ${chunks.length} chunks`);

      // Process each chunk with proper queueing
      const chunkPromises = chunks.map(async (chunk, index) => {
        try {
          // Generate embedding (queued with embedding queue)
          const embedding = await this.queueService.queueEmbedding(
            () => this.embeddingService.embed(chunk),
            `embed-chunk-${event.id}-${index}`,
          );

          // Store in Weaviate (queued with weaviate queue)
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
            `Stored chunk ${index + 1}/${chunks.length} for document ${event.id}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to process chunk ${index} for document ${event.id}`,
            error,
          );
          throw error;
        }
      });

      // Wait for all chunks to be processed
      await Promise.all(chunkPromises);

      this.logger.log(`Successfully processed embeddings for document ${event.id}`);
    } catch (error) {
      this.logger.error(`Failed to process embeddings for document ${event.id}`, error);
      throw error;
    }
  }

  /**
   * Split document content into overlapping chunks
   */
  private chunkDocument(content: string): string[] {
    const chunks: string[] = [];

    // Clean and normalize content
    const cleanedContent = content.replace(/\s+/g, ' ').trim();

    if (cleanedContent.length <= this.chunkSize) {
      return [cleanedContent];
    }

    let startIndex = 0;

    while (startIndex < cleanedContent.length) {
      let endIndex = startIndex + this.chunkSize;

      // If not at the end, try to find a good breaking point
      if (endIndex < cleanedContent.length) {
        // Look for sentence boundaries (., !, ?) within the last 100 chars
        const searchStart = Math.max(startIndex + this.chunkSize - 100, startIndex);
        const searchText = cleanedContent.substring(searchStart, endIndex);

        // Find the last sentence boundary
        const sentenceEnd = Math.max(
          searchText.lastIndexOf('. '),
          searchText.lastIndexOf('! '),
          searchText.lastIndexOf('? '),
          searchText.lastIndexOf('\n'),
        );

        if (sentenceEnd !== -1) {
          endIndex = searchStart + sentenceEnd + 1;
        } else {
          // Fall back to word boundary
          const lastSpace = cleanedContent.lastIndexOf(' ', endIndex);
          if (lastSpace > startIndex) {
            endIndex = lastSpace;
          }
        }
      }

      const chunk = cleanedContent.substring(startIndex, endIndex).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      // Move start index with overlap
      startIndex = endIndex - this.chunkOverlap;

      // Make sure we make progress
      if (startIndex <= chunks.length * (this.chunkSize - this.chunkOverlap) - this.chunkSize) {
        startIndex = endIndex;
      }
    }

    return chunks;
  }
}

