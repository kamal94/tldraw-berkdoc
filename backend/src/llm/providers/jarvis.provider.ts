import { Logger } from "@nestjs/common";
import OpenAI from "openai";
import type { CompletionOptions, LlmProvider } from "./llm-provider.interface.js";

const DEFAULT_JARVIS_MODEL = "gemma3:12b";

export class JarvisProvider implements LlmProvider {
  private readonly logger = new Logger(JarvisProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.JARVIS_API_KEY;
    if (!apiKey) {
      throw new Error("JARVIS_API_KEY is required for Jarvis provider");
    }

    const deploymentId = process.env.JARVIS_DEPLOYMENT_ID;
    if (!deploymentId) {
      throw new Error("JARVIS_DEPLOYMENT_ID is required for Jarvis provider");
    }

    this.model = process.env.JARVIS_MODEL || DEFAULT_JARVIS_MODEL;

    this.client = new OpenAI({
      apiKey,
      baseURL: `https://serverless.jarvislabs.net/openai/${deploymentId}/v1/`,
    });
  }

  async generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: options?.max_tokens,
        temperature: options?.temperature,
      });

      const content = response.choices?.[0]?.message?.content;
      return content?.trim() || "";
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to call Jarvis API", errorMessage);
      throw error;
    }
  }
}
