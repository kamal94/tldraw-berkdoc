import { Injectable, Logger } from "@nestjs/common";
import { buildSummaryPrompt, buildTagsPrompt } from "./prompts.js";
import { parseSummary, parseTags } from "./parsers.js";

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly ollamaBaseUrl =
    process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  private readonly ollamaModel = process.env.OLLAMA_MODEL || "gemma3:1b";

  /**
   * Call Ollama API directly to generate text
   */
  private async callCompletions(
    prompt: string,
    options?: {
      max_tokens?: number;
      temperature?: number;
    }
  ): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.ollamaModel,
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

  /**
   * Generate a one-sentence summary for the document content
   */
  async generateSummary(content: string): Promise<string> {
    try {
      const prompt = buildSummaryPrompt(content);
      const start = Date.now();
      const response = await this.callCompletions(prompt, {
        max_tokens: 80,
        temperature: 0.5,
      });
      const elapsed = Date.now() - start;
      this.logger.log(`generateSummary took ${elapsed}ms`);

      // Store prompt and response to filesystem for later test data use
      await this.storeCallAndResponse("summary", {
        request: {
          prompt,
          max_tokens: 80,
          temperature: 0.5,
        },
        response,
      });

      return parseSummary(response);
    } catch (error) {
      this.logger.error("Failed to generate summary via Ollama", error);
      return "";
    }
  }

  /**
   * Generate top 10 tags for the document content
   */
  async generateTags(content: string): Promise<string[]> {
    try {
      const prompt = buildTagsPrompt(content);
      const start = Date.now();

      const response = await this.callCompletions(prompt, {
        max_tokens: 100,
        temperature: 0.3,
      });
      const elapsed = Date.now() - start;
      this.logger.log(`generateTags took ${elapsed}ms`);
      await this.storeCallAndResponse("tags", {
        request: {
          prompt,
          max_tokens: 100,
          temperature: 0.3,
        },
        response,
      });
      return parseTags(response);
    } catch (error) {
      this.logger.error("Failed to generate tags via Ollama", error);
      return [];
    }
  }

  /**
   * Generate both summary and tags in one request (more efficient)
   */
  async analyze(content: string): Promise<{ summary: string; tags: string[] }> {
    try {
      // Cap content at 2 MB (2 * 1024 * 1024 bytes), or a reasonable length (e.g., 1 million characters)
      const MAX_CONTENT_LENGTH = 1_000_000; // Approximately 1MB in characters, as JS strings are UTF-16, exact bytes may vary
      let truncatedContent = content;
      if (content.length > MAX_CONTENT_LENGTH) {
        this.logger.warn(
          `Content exceeded ${MAX_CONTENT_LENGTH} characters, truncating for analyze.`
        );
        truncatedContent = content.slice(0, MAX_CONTENT_LENGTH);
      }
      // Generate both in parallel
      const [summary, tags] = await Promise.all([
        this.generateSummary(truncatedContent),
        this.generateTags(truncatedContent),
      ]);

      return { summary, tags };
    } catch (error) {
      this.logger.error("Failed to analyze content via Ollama", error);
      return { summary: "", tags: [] };
    }
  }

  async storeCallAndResponse(
    type: "summary" | "tags",
    data: {
      request: { prompt: string; max_tokens: number; temperature: number };
      response: string;
    }
  ): Promise<void> {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const testDataDir = path.resolve(process.cwd(), "ollama-test-data");
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${type}-${timestamp}.json`;
      const filePath = path.join(testDataDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
      this.logger.warn(`Failed to write ${type} test data: ${err}`);
    }
  }
}
