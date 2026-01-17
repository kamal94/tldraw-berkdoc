import type { LlmProvider } from "./llm-provider.interface.js";
import { JarvisProvider } from "./jarvis.provider.js";
import { OllamaProvider } from "./ollama.provider.js";
import { RunpodProvider } from "./runpod.provider.js";
import { GeminiProvider } from "./gemini.provider.js";

export type LlmProviderType = "ollama" | "jarvis" | "runpod" | "gemini";

export function createLlmProvider(): LlmProvider {
  const providerType = (process.env.LLM_PROVIDER || "ollama").toLowerCase();

  if (providerType === "ollama") {
    return new OllamaProvider();
  }

  if (providerType === "jarvis") {
    return new JarvisProvider();
  }

  if (providerType === "runpod") {
    return new RunpodProvider();
  }

  if (providerType === "gemini") {
    return new GeminiProvider();
  }

  throw new Error(`Unsupported LLM_PROVIDER value: ${providerType}`);
}
