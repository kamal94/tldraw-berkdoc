import express from 'express';
import { ModelService } from './model-service.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = express();

// Initialize model service
const modelService = new ModelService(config);
modelService.initialize().catch((error) => {
  console.error('[API] Failed to initialize model service:', error);
  process.exit(1);
});

// Middleware
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ready: modelService.isReady(),
  });
});

// Ready check endpoint
app.get('/ready', (req, res) => {
  if (modelService.isReady()) {
    res.json({ ready: true });
  } else {
    res.status(503).json({ ready: false, message: 'Model is still loading' });
  }
});

// OpenAI-compatible API endpoints

// List models
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      {
        id: modelService.getModelName(),
        object: 'model',
        created: Date.now(),
        owned_by: config.backend,
      },
    ],
  });
});

// Completions endpoint (OpenAI-compatible)
app.post('/v1/completions', async (req, res) => {
  try {
    const { prompt, max_tokens, temperature, top_p, stop } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        error: {
          message: 'prompt is required and must be a string',
          type: 'invalid_request_error',
        },
      });
    }

    if (!modelService.isReady()) {
      return res.status(503).json({
        error: {
          message: 'Model is not ready yet',
          type: 'service_unavailable',
        },
      });
    }

    const generatedText = await modelService.generate(prompt, {
      max_tokens,
      temperature,
      top_p,
      stop: Array.isArray(stop) ? stop : stop ? [stop] : undefined,
    });

    // OpenAI-compatible response format
    res.json({
      id: `cmpl-${Date.now()}`,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: modelService.getModelName(),
      choices: [
        {
          text: generatedText,
          index: 0,
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: Math.ceil(prompt.length / 4), // Rough estimate
        completion_tokens: Math.ceil(generatedText.length / 4), // Rough estimate
        total_tokens: Math.ceil((prompt.length + generatedText.length) / 4),
      },
    });
  } catch (error) {
    console.error('[API] Error in /v1/completions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: {
        message: errorMessage,
        type: 'internal_server_error',
      },
    });
  }
});

// Chat completions endpoint (optional, for future use)
app.listen(config.port, () => {
  console.log(`[LLM Service] Running on http://localhost:${config.port}`);
  console.log(`[LLM Service] Health check: http://localhost:${config.port}/health`);
  console.log(`[LLM Service] Ready check: http://localhost:${config.port}/ready`);
  console.log(`[LLM Service] OpenAI API: http://localhost:${config.port}/v1/completions`);
});

