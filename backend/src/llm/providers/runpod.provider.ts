import { Logger } from "@nestjs/common";
import runpodSdk from "runpod-sdk";
import type { CompletionOptions, LlmProvider } from "./llm-provider.interface.js";

interface RunPodOutput {
  text?: string[] | string;
  response?: string;
  [key: string]: unknown;
}

export class RunpodProvider implements LlmProvider {
  private readonly logger = new Logger(RunpodProvider.name);
  private readonly apiKey: string;
  private readonly endpointId: string;
  private readonly endpoint: NonNullable<ReturnType<ReturnType<typeof runpodSdk>["endpoint"]>>;
  private readonly maxPollAttempts = 60; // 5 minutes max (60 * 5 seconds)
  private readonly pollIntervalMs = 5000; // 5 seconds

  constructor() {
    const apiKey = process.env.RUNPOD_API_KEY;
    if (!apiKey) {
      throw new Error("RUNPOD_API_KEY is required for RunPod provider");
    }

    const endpointId = process.env.RUNPOD_ENDPOINT_ID;
    if (!endpointId) {
      throw new Error("RUNPOD_ENDPOINT_ID is required for RunPod provider");
    }

    this.apiKey = apiKey;
    this.endpointId = endpointId;
    const runpod = runpodSdk(apiKey);
    const endpoint = runpod.endpoint(endpointId);
    
    if (!endpoint) {
      throw new Error(`Failed to create RunPod endpoint for ID: ${endpointId}`);
    }
    
    this.endpoint = endpoint;
  }

  async generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<string> {
    try {
      // Submit asynchronous job
      const runResult = await this.endpoint.run({
        input: {
          prompt,
          max_tokens: options?.max_tokens,
          temperature: options?.temperature,
        },
      });

      if (!runResult?.id) {
        throw new Error("No job ID returned from RunPod endpoint.run");
      }

      const jobId = runResult.id;
      this.logger.log(`RunPod job submitted with ID: ${jobId}`);

      // Poll for job completion
      const result = await this.pollForCompletion(jobId);

      if (result.status !== "COMPLETED") {
        throw new Error(
          `RunPod job failed with status: ${result.status}`
        );
      }

      this.logger.log(`RunPod job completed with output: ${JSON.stringify(result)}`);
      // Parse output based on RunPod response format
      // According to docs: output.text is an array of strings
      const output = result.output;
      if (!output) {
        this.logger.warn("RunPod job completed but output is empty");
        return "";
      }

      // Handle the documented format: { text: ["string1", "string2", ...] }
      if (typeof output === "object" && output !== null && !Array.isArray(output)) {
        const outputObj = output as RunPodOutput;
        
        if (outputObj.text) {
          if (Array.isArray(outputObj.text)) {
            return outputObj.text.join("").trim();
          }
          return String(outputObj.text).trim();
        }
        
        if (outputObj.response) {
          return String(outputObj.response).trim();
        }
        
        // Last resort: stringify
        this.logger.warn(
          "Unexpected output format from RunPod, stringifying object"
        );
        return JSON.stringify(output).trim();
      }

      // Fallback for other formats
      if (typeof output === "string") {
        return output.trim();
      }

      if (Array.isArray(output)) {
        return output.map((item) => String(item)).join("").trim();
      }

      return String(output).trim();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to call RunPod API", errorMessage);
      throw error;
    }
  }

  private async pollForCompletion(jobId: string): Promise<{
    status: string;
    output?: unknown;
  }> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      const statusResult = await this.endpoint.status(jobId);

      if (!statusResult) {
        throw new Error("No status returned from RunPod endpoint.status");
      }

      const status = statusResult.status;
      if (!status) {
        throw new Error("Status result missing status field");
      }

      if (status === "COMPLETED") {
        this.logger.log(
          `RunPod job ${jobId} completed after ${attempt + 1} polling attempts`
        );
        // Type guard: check if output exists (completed jobs should have output)
        const output = "output" in statusResult ? statusResult.output : undefined;
        return {
          status,
          output,
        };
      }

      if (status === "FAILED" || status === "CANCELLED") {
        throw new Error(`RunPod job ${jobId} ended with status: ${status}`);
      }

      // Job is still in progress (IN_QUEUE, IN_PROGRESS, etc.)
      if (attempt < this.maxPollAttempts - 1) {
        await this.sleep(this.pollIntervalMs);
      }
    }

    throw new Error(
      `RunPod job ${jobId} did not complete within ${this.maxPollAttempts * this.pollIntervalMs}ms`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
