import { Logger } from '@nestjs/common';
import type { EmbeddingProvider } from './embedding-provider.interface';
import { MiniLmEmbeddingProvider } from './minilm.provider';
import {
  DEFAULT_WORKERS_AI_EMBEDDING_MODEL,
  WORKERS_AI_MODEL_DIMENSIONS,
  WorkersAiEmbeddingProvider,
} from './workers-ai.provider';

export type { EmbeddingProvider } from './embedding-provider.interface';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function hasWorkersAiEnv(): boolean {
  return !!process.env.CLOUDFLARE_ACCOUNT_ID && !!process.env.CLOUDFLARE_API_TOKEN;
}

/**
 * Selects the embedding backend from the environment, mirroring the database
 * driver and blob storage patterns:
 *   - EMBEDDING_PROVIDER=workers-ai -> Cloudflare Workers AI (BGE)
 *   - EMBEDDING_PROVIDER=minilm (or unset) -> local MiniLM (default)
 * Local/offline/air-gapped deployments keep the zero-config MiniLM default.
 */
export function createEmbeddingProvider(logger?: Logger): EmbeddingProvider {
  const explicit = (process.env.EMBEDDING_PROVIDER ?? '').toLowerCase();
  const useWorkersAi =
    explicit === 'workers-ai' || explicit === 'workersai' || explicit === 'cloudflare';

  if (useWorkersAi) {
    const model =
      process.env.WORKERS_AI_EMBEDDING_MODEL ?? DEFAULT_WORKERS_AI_EMBEDDING_MODEL;
    const dimension =
      Number(process.env.WORKERS_AI_EMBEDDING_DIMENSION) ||
      WORKERS_AI_MODEL_DIMENSIONS[model];
    if (!dimension) {
      throw new Error(
        `Unknown Workers AI embedding model "${model}"; set WORKERS_AI_EMBEDDING_DIMENSION to its output dimension.`,
      );
    }
    logger?.log(`Using Cloudflare Workers AI embeddings (model: ${model}, dim: ${dimension})`);
    return new WorkersAiEmbeddingProvider({
      accountId: requireEnv('CLOUDFLARE_ACCOUNT_ID'),
      apiToken: requireEnv('CLOUDFLARE_API_TOKEN'),
      model,
      dimension,
    });
  }

  if (explicit && explicit !== 'minilm' && explicit !== 'local') {
    logger?.warn(`Unknown EMBEDDING_PROVIDER "${explicit}"; falling back to MiniLM.`);
  }
  logger?.log(
    hasWorkersAiEnv()
      ? 'Using local MiniLM embeddings (set EMBEDDING_PROVIDER=workers-ai to use Workers AI)'
      : 'Using local MiniLM embeddings',
  );
  return new MiniLmEmbeddingProvider();
}
