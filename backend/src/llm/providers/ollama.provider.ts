import { Logger } from "@nestjs/common";
import type { CompletionOptions, LlmProvider } from "./llm-provider.interface.js";

export class OllamaProvider implements LlmProvider {
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl =
    process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  private readonly model = process.env.OLLAMA_MODEL || "gemma3:12b";

  async generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          options: {
            num_predict: options?.max_tokens,
            temperature: options?.temperature ?? 0.7,
          },
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.response?.trim() || "";
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to call Ollama API", errorMessage);
      throw error;
    }
  }
}
