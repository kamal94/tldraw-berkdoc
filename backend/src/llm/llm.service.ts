import { Injectable, Logger } from '@nestjs/common';
import { buildSummaryPrompt, buildTagsPrompt } from './prompts.js';
import { parseSummary, parseTags } from './parsers.js';

interface OpenAICompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    logprobs: null;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
  };
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly llmServiceUrl = process.env.LLM_SERVICE_URL || 'http://localhost:3001';

  /**
   * Call the OpenAI-compatible completions endpoint
   */
  private async callCompletions(
    prompt: string,
    options?: {
      max_tokens?: number;
      temperature?: number;
    },
  ): Promise<string> {
    try {
      const response = await fetch(`${this.llmServiceUrl}/v1/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          max_tokens: options?.max_tokens || 200,
          temperature: options?.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        const errorData: OpenAIErrorResponse = await response.json().catch(() => ({
          error: { message: `HTTP ${response.status}`, type: 'http_error' },
        }));
        throw new Error(
          `LLM service error: ${errorData.error?.message || response.statusText}`,
        );
      }

      const data: OpenAICompletionResponse = await response.json();
      const text = data.choices[0]?.text || '';
      return text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to call LLM service completions endpoint', errorMessage);
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
      this.logger.log(`generateSummary callCompletions took ${elapsed}ms`);
      return parseSummary(response);
    } catch (error) {
      this.logger.error('Failed to generate summary via LLM service', error);
      return '';
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
      this.logger.log(`generateTags callCompletions took ${elapsed}ms`);
      return parseTags(response);
    } catch (error) {
      this.logger.error('Failed to generate tags via LLM service', error);
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
        this.logger.warn(`Content exceeded ${MAX_CONTENT_LENGTH} characters, truncating for analyze.`);
        truncatedContent = content.slice(0, MAX_CONTENT_LENGTH);
      }
      // Generate both in parallel
      const [summary, tags] = await Promise.all([
        this.generateSummary(truncatedContent),
        this.generateTags(truncatedContent),
      ]);

      return { summary, tags };
    } catch (error) {
      this.logger.error('Failed to analyze content via LLM service', error);
      return { summary: '', tags: [] };
    }
  }

  /**
   * Check if the LLM service is ready
   */
  async isReady(): Promise<boolean> {
    try {
      const response = await fetch(`${this.llmServiceUrl}/ready`);
      if (!response.ok) {
        return false;
      }
      const data = await response.json();
      return data.ready === true;
    } catch {
      this.logger.warn('LLM service is not reachable');
      return false;
    }
  }
}

