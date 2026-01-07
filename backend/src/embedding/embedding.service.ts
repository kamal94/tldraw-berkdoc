import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private embedder: FeatureExtractionPipeline | null = null;
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly modelName = 'Xenova/all-MiniLM-L6-v2';
  private initPromise: Promise<void> | null = null;

  async onModuleInit() {
    // Start loading the model in the background
    this.initPromise = this.loadModel();
  }

  private async loadModel(): Promise<void> {
    try {
      this.logger.log(`Loading embedding model: ${this.modelName}...`);
      this.embedder = await pipeline('feature-extraction', this.modelName);
      this.logger.log('Embedding model loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load embedding model', error);
      throw error;
    }
  }

  private async ensureModelLoaded(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.embedder) {
      throw new Error('Embedding model not loaded');
    }
  }

  /**
   * Generate embedding vector for a single text
   * Returns a 384-dimensional vector (for all-MiniLM-L6-v2)
   */
  async embed(text: string): Promise<number[]> {
    await this.ensureModelLoaded();

    const output = await this.embedder!(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert to regular array
    return Array.from(output.data as Float32Array);
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.ensureModelLoaded();

    const embeddings: number[][] = [];
    for (const text of texts) {
      const embedding = await this.embed(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * Get the dimension of the embedding vectors
   */
  getEmbeddingDimension(): number {
    // all-MiniLM-L6-v2 produces 384-dimensional vectors
    return 384;
  }
}

