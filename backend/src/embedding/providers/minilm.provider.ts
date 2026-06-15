import { Logger } from '@nestjs/common';
import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import type { EmbeddingProvider } from './embedding-provider.interface';

/**
 * Local, dependency-free (no network) embeddings via @xenova/transformers
 * running all-MiniLM-L6-v2 (384-dim). Default provider for local/offline and
 * air-gapped deployments.
 */
export class MiniLmEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(MiniLmEmbeddingProvider.name);
  private readonly modelName = 'Xenova/all-MiniLM-L6-v2';
  private embedder: FeatureExtractionPipeline | null = null;
  private initPromise: Promise<void> | null = null;

  init(): Promise<void> {
    // Load in the background so app startup is not blocked.
    if (!this.initPromise) {
      this.initPromise = this.loadModel();
    }
    return Promise.resolve();
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
    if (!this.initPromise) {
      this.initPromise = this.loadModel();
    }
    await this.initPromise;
    if (!this.embedder) {
      throw new Error('Embedding model not loaded');
    }
  }

  async embed(text: string): Promise<number[]> {
    await this.ensureModelLoaded();
    const output = await this.embedder!(text, {
      pooling: 'mean',
      normalize: true,
    });
    return Array.from(output.data as Float32Array);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.ensureModelLoaded();
    const embeddings: number[][] = [];
    for (const text of texts) {
      embeddings.push(await this.embed(text));
    }
    return embeddings;
  }

  getEmbeddingDimension(): number {
    return 384;
  }
}
