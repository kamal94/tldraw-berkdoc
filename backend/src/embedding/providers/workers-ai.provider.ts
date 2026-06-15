import { Logger } from '@nestjs/common';
import type { EmbeddingProvider } from './embedding-provider.interface';

/** Known output dimensions for the Workers AI BGE embedding models. */
export const WORKERS_AI_MODEL_DIMENSIONS: Record<string, number> = {
  '@cf/baai/bge-small-en-v1.5': 384,
  '@cf/baai/bge-base-en-v1.5': 768,
  '@cf/baai/bge-large-en-v1.5': 1024,
};

export const DEFAULT_WORKERS_AI_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

export interface WorkersAiEmbeddingProviderOptions {
  accountId: string;
  apiToken: string;
  model: string;
  dimension: number;
  // Override for testing; defaults to the Cloudflare API.
  baseUrl?: string;
}

interface WorkersAiEmbeddingResponse {
  result: { shape: number[]; data: number[][] };
  success: boolean;
  errors: { code?: number; message: string }[] | null;
}

/**
 * Cloudflare Workers AI embeddings (BGE family) over the REST API. Used for the
 * SaaS/cloud deployment; reuses CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN.
 */
export class WorkersAiEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(WorkersAiEmbeddingProvider.name);
  private readonly endpoint: string;

  constructor(private readonly options: WorkersAiEmbeddingProviderOptions) {
    const base = options.baseUrl ?? 'https://api.cloudflare.com/client/v4';
    this.endpoint = `${base}/accounts/${options.accountId}/ai/run/${options.model}`;
  }

  private async run(texts: string[]): Promise<number[][]> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: texts }),
    });

    const body = (await response.json()) as WorkersAiEmbeddingResponse;
    if (!response.ok || !body.success) {
      const message =
        body.errors?.map((e) => e.message).join('; ') ||
        `HTTP ${response.status}`;
      throw new Error(`Workers AI embedding failed: ${message}`);
    }
    return body.result.data;
  }

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.run([text]);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.run(texts);
  }

  getEmbeddingDimension(): number {
    return this.options.dimension;
  }
}
