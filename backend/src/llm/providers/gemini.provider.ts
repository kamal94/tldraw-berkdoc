import { Logger } from "@nestjs/common";
import { GenerateContentConfig, GoogleGenAI } from "@google/genai";
import type { CompletionOptions, LlmProvider } from "./llm-provider.interface.js";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

export class GeminiProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for Gemini provider");
    }

    this.model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

    this.client = new GoogleGenAI({
      apiKey,
    });
  }

  async generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<string> {
    try {

      const config: GenerateContentConfig = {
          maxOutputTokens: options?.max_tokens,
          temperature: options?.temperature,
      };
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config,
      });

      const text = response.text;
      return text?.trim() || "";
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to call Gemini API", errorMessage);
      throw error;
    }
  }
}
