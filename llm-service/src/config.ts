/**
 * Configuration for the LLM service
 */

export type ModelBackendType = 'ollama';

export interface ServiceConfig {
  port: number;
  backend: ModelBackendType;
  ollama: {
    baseUrl: string;
    model: string;
  };
}

export function loadConfig(): ServiceConfig {
  const port = parseInt(process.env.PORT || '3001', 10);
  const backend = (process.env.MODEL_BACKEND || 'ollama') as ModelBackendType;

  if (backend !== 'ollama') {
    throw new Error(
      `Invalid MODEL_BACKEND: ${backend}. Must be 'ollama'`,
    );
  }

  const config: ServiceConfig = {
    port,
    backend,
    ollama: {
      // Default to localhost when running directly, or host.docker.internal when in Docker
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'gemma3:270m',
    },
  };

  console.log('[Config] Loaded configuration:');
  console.log(`  Backend: ${config.backend}`);
  console.log(`  Ollama URL: ${config.ollama.baseUrl}`);
  console.log(`  Ollama Model: ${config.ollama.model}`);

  return config;
}
