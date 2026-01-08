import type { ModelBackend } from './model-backend.js';

interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export class OllamaBackend implements ModelBackend {
  private readonly config: OllamaConfig;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: OllamaConfig) {
    this.config = config;
    this.initPromise = this.initialize();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log(`[Ollama] Initializing connection to ${this.config.baseUrl}`);
    console.log(`[Ollama] Model: ${this.config.model}`);

    // Check if Ollama is reachable and model is available
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama API returned status ${response.status}`);
      }

      const data = await response.json();
      const models = data.models || [];
      const modelExists = models.some(
        (m: any) => m.name === this.config.model || m.name.startsWith(this.config.model + ':'),
      );

      if (!modelExists) {
        console.warn(
          `[Ollama] Model ${this.config.model} not found. ` +
            `Please pull it manually: ollama pull ${this.config.model}`,
        );
        console.warn(
          `[Ollama] The service will continue, but generation requests may fail until the model is available.`,
        );
        // Don't fail initialization - let the user pull the model manually
        // This allows the service to start even if the model isn't ready yet
      }

      this.isInitialized = true;
      console.log('[Ollama] Backend initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Ollama] Failed to initialize:`, errorMessage);
      throw new Error(`Ollama backend initialization failed: ${errorMessage}`);
    }
  }

  isReady(): boolean {
    return this.isInitialized;
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
    if (!this.isInitialized) {
      if (this.initPromise) {
        await this.initPromise;
      }
      if (!this.isInitialized) {
        throw new Error('Ollama backend not initialized');
      }
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          options: {
            num_predict: options?.max_tokens,
            temperature: options?.temperature ?? 0.7,
            top_p: options?.top_p,
            stop: options?.stop,
          },
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.response?.trim() || '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Ollama] Generation failed:`, errorMessage);
      throw new Error(`Ollama generation failed: ${errorMessage}`);
    }
  }

  getModelName(): string {
    return this.config.model;
  }
}
