/**
 * Abstract interface for model backends
 * Allows supporting multiple inference engines (Ollama, vLLM, etc.)
 */
export interface ModelBackend {
  /**
   * Initialize the backend and load the model
   */
  initialize(): Promise<void>;

  /**
   * Check if the backend is ready to handle requests
   */
  isReady(): boolean;

  /**
   * Generate text completion from a prompt
   * @param prompt The input prompt
   * @param options Generation options (max_tokens, temperature, etc.)
   * @returns The generated text
   */
  generate(
    prompt: string,
    options?: {
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      stop?: string[];
    },
  ): Promise<string>;

  /**
   * Get the model name/identifier
   */
  getModelName(): string;
}
