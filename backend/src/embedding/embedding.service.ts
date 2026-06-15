import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { createEmbeddingProvider, type EmbeddingProvider } from './providers';

/**
 * Facade over an environment-selected embedding backend (MiniLM locally,
 * Cloudflare Workers AI in the cloud). Consumers inject EmbeddingService and are
 * unaware of the underlying provider.
 */
@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly provider: EmbeddingProvider = createEmbeddingProvider(this.logger);

  async onModuleInit(): Promise<void> {
    await this.provider.init?.();
  }

  /**
   * Generate embedding vector for a single text.
   */
  embed(text: string): Promise<number[]> {
    return this.provider.embed(text);
  }

  /**
   * Generate embeddings for multiple texts in batch.
   */
  embedBatch(texts: string[]): Promise<number[][]> {
    return this.provider.embedBatch(texts);
  }

  /**
   * Get the dimension of the embedding vectors.
   */
  getEmbeddingDimension(): number {
    return this.provider.getEmbeddingDimension();
  }
}
