import type { ModelBackend } from './backends/model-backend.js';
import { OllamaBackend } from './backends/ollama.backend.js';
import type { ServiceConfig } from './config.js';

/**
 * Main model service that routes to appropriate backend
 */
export class ModelService {
  private backend: ModelBackend | null = null;
  private readonly config: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.backend) {
      return;
    }

    console.log(`[ModelService] Initializing ${this.config.backend} backend...`);

    if (this.config.backend === 'ollama') {
      this.backend = new OllamaBackend(this.config.ollama);
    } else {
      throw new Error(`Unsupported backend: ${this.config.backend}`);
    }

    await this.backend.initialize();
    console.log(`[ModelService] Backend initialized: ${this.backend.getModelName()}`);
  }

  isReady(): boolean {
    return this.backend?.isReady() ?? false;
  }

  async generate(
    prompt: string,
    options?: {
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      stop?: string[];
    },
  ): Promise<string> {
    if (!this.backend) {
      await this.initialize();
    }
    if (!this.backend) {
      throw new Error('Model backend not initialized');
    }

    return this.backend.generate(prompt, options);
  }

  getModelName(): string {
    return this.backend?.getModelName() || 'unknown';
  }
}
