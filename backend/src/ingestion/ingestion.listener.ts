import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmbeddingService } from '../embedding/embedding.service';
import { WeaviateService, type DocumentChunkData } from '../weaviate/weaviate.service';
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
  ) {}

  @OnEvent('document.created')
  async handleDocumentCreated(event: DocumentCreatedEvent) {
    this.logger.log(`Processing new document: ${event.id}`);
    await this.ingestDocument(event);
  }

  @OnEvent('document.updated')
  async handleDocumentUpdated(event: DocumentUpdatedEvent) {
    this.logger.log(`Re-processing updated document: ${event.id}`);

    // Delete existing chunks first
    try {
      await this.weaviateService.deleteDocumentChunks(event.id, event.userId);
    } catch (error) {
      this.logger.warn(`Failed to delete old chunks for document ${event.id}`, error);
    }

    // Re-ingest the document
    await this.ingestDocument(event);
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

  private async ingestDocument(
    event: DocumentCreatedEvent | DocumentUpdatedEvent,
  ): Promise<void> {
    try {
      // Chunk the document
      const chunks = this.chunkDocument(event.content);
      this.logger.log(`Document ${event.id} split into ${chunks.length} chunks`);

      // Process each chunk
      for (const [index, chunk] of chunks.entries()) {
        try {
          // Generate embedding
          const embedding = await this.embeddingService.embed(chunk);

          // Store in Weaviate
          const chunkData: DocumentChunkData = {
            documentId: event.id,
            chunkIndex: index,
            content: chunk,
            title: event.title,
            source: event.source,
            userId: event.userId,
          };

          await this.weaviateService.storeChunk(chunkData, embedding);
          this.logger.debug(`Stored chunk ${index + 1}/${chunks.length} for document ${event.id}`);
        } catch (error) {
          this.logger.error(
            `Failed to process chunk ${index} for document ${event.id}`,
            error,
          );
        }
      }

      this.logger.log(`Successfully ingested document ${event.id}`);
    } catch (error) {
      this.logger.error(`Failed to ingest document ${event.id}`, error);
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

