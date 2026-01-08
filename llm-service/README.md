# LLM Microservice

A lightweight CPU-based LLM service for document summarization and tag extraction.

## Features

- **Model**: Configurable via `LLM_MODEL_NAME` env var (default: LaMini-Flan-T5-77M)
- **Endpoints**:
  - `POST /summarize` - Generate one-sentence summary
  - `POST /tags` - Extract top 10 tags
  - `POST /analyze` - Get both summary and tags in one request
  - `GET /health` - Health check
  - `GET /ready` - Model readiness check
- **Evaluation Tools**: Test suite and scripts to evaluate different models (see [EVALUATION.md](./EVALUATION.md))

## Local Development

```bash
bun install
bun run dev
```

## Model Evaluation

Test different models to find the best one for your use case:

```bash
# Quick test on 3 samples
bun run quick-test [model-name]

# Full evaluation suite
bun run evaluate [model-name]
```

See [EVALUATION.md](./EVALUATION.md) for detailed documentation.

## Docker

### Building the Image

The Docker image pre-downloads the LLM model during build time, which means:
- **First build**: Takes ~2-3 minutes (downloads model)
- **Subsequent builds**: Fast (model is cached in image layers)
- **Container startup**: Near-instant (model already downloaded)

```bash
docker build -t llm-service .
docker run -p 3001:3001 llm-service
```

### Build Performance

The model (~300MB) is downloaded and cached during the Docker build:
```
[Build] Pre-downloading LLM model...
[Model Cache] Downloading Xenova/LaMini-Flan-T5-77M...
[Model Cache] ✓ Model downloaded successfully
[Build] Model cached successfully
```

This means containers start in **~5 seconds** instead of 60-90 seconds!

## API Examples

### Analyze Document
```bash
curl -X POST http://localhost:3001/analyze \
  -H "Content-Type: application/json" \
  -d '{"content": "Your document content here..."}'
```

Response:
```json
{
  "summary": "One-sentence summary of the document.",
  "tags": ["tag1", "tag2", "tag3", ...]
}
```

