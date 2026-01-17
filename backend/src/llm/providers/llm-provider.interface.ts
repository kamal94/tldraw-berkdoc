export type CompletionOptions = {
  max_tokens?: number;
  temperature?: number;
};

export interface LlmProvider {
  generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<string>;
}
