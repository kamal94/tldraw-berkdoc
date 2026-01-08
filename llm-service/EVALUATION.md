# LLM Model Evaluation

This directory contains tools to evaluate different LLM models for document tagging and summarization tasks.

## Quick Start

### Test a Single Model Quickly

```bash
bun run quick-test [model-name]
```

Example:
```bash
bun run quick-test Xenova/flan-t5-base
```

This will test the model on 3 sample documents and show results immediately.

### Full Evaluation Suite

```bash
# Test all models
bun run evaluate

# Test a specific model
bun run evaluate Xenova/flan-t5-base

# Test multiple specific models
bun run evaluate Xenova/flan-t5-small Xenova/flan-t5-base
```

## Test Suite

The test suite (`src/test-suite.ts`) includes 8 diverse test cases:

1. **Technical Architecture Document** - Microservices, infrastructure
2. **Product Roadmap** - Product planning, features, metrics
3. **Brand Guidelines** - Design, typography, visual identity
4. **User Research Report** - UX research, personas, findings
5. **API Documentation** - Technical docs, endpoints, authentication
6. **Financial Report** - Revenue, metrics, business data
7. **Marketing Campaign** - Marketing strategy, channels, metrics
8. **Privacy Policy** - Legal, compliance, data protection

Each test case includes:
- Sample document content
- Expected tags (ground truth)
- Category classification

## Evaluation Metrics

The evaluation script calculates:

- **Parse Success Rate**: Whether the model returns parseable tags (non-empty array). Critical metric - if a model can't return parseable output, it's not useful.
- **Precision**: How many predicted tags are correct (only calculated if parseable)
- **Recall**: How many expected tags were found (only calculated if parseable)
- **F1 Score**: Harmonic mean of precision and recall (only calculated if parseable)
- **Exact Matches**: Number of tags that match exactly (only calculated if parseable)
- **Latency**: Time to generate tags and summary

**Scoring Formula**: The recommendation score weights:
- 30% - Parse Success Rate (critical - must return parseable tags)
- 40% - F1 Score (quality of tag extraction)
- 20% - Latency (speed)
- 10% - Error Rate (reliability)

## Available Models

The evaluation script tests these models by default:

1. `Xenova/LaMini-Flan-T5-77M` (77M params, ~300MB) - Current default
2. `Xenova/flan-t5-small` (60M params, ~240MB)
3. `Xenova/flan-t5-base` (250M params, ~900MB)
4. `Xenova/LaMini-Flan-T5-248M` (248M params, ~950MB)
5. `Xenova/LaMini-Flan-T5-783M` (783M params, ~3GB) - May be slow on CPU

**Note**: `Xenova/flan-t5-large` is not available in the Xenova namespace. Use `Xenova/LaMini-Flan-T5-783M` for a large model instead.

## Model Selection

The evaluation script provides a recommendation based on:
- **F1 Score** (70% weight) - Quality of tag extraction
- **Latency** (20% weight) - Speed of inference
- **Error Rate** (10% weight) - Reliability

## Using a Different Model in Production

To use a different model, set the `LLM_MODEL_NAME` environment variable:

```bash
# In docker-compose.yml or .env
LLM_MODEL_NAME=Xenova/flan-t5-base

# Or when running the service
LLM_MODEL_NAME=Xenova/flan-t5-base bun run start
```

## Interpreting Results

### Good Model Characteristics:
- **Parse Success Rate = 100%**: Model always returns parseable tags (critical!)
- **F1 Score > 0.6**: Good tag extraction quality
- **Precision > 0.7**: Most predicted tags are relevant
- **Recall > 0.5**: Finds most important tags
- **Latency < 5000ms**: Fast enough for real-time use
- **No errors**: Reliable operation

⚠️ **Warning**: Models with parse success rate < 100% are problematic - they sometimes fail to return any parseable tags, which breaks the application.

### Trade-offs:
- **Larger models** (base, large): Better quality, slower inference
- **Smaller models** (77M, small): Faster inference, may miss some tags
- **CPU inference**: All models run on CPU, larger models will be slower

## Example Output

```
EVALUATION SUMMARY
============================================================

Xenova/flan-t5-base:
  Parse Success Rate:    100.0% (8/8 tests)
  Average F1 Score:     68.5%
  Average Precision:     72.3%
  Average Recall:        65.1%
  Exact Tag Matches:     45/80 (56.3%)
  Average Latency:       2340ms
  Failed Tests:          0/8

RECOMMENDATION
============================================================

Best Model: Xenova/flan-t5-base
  Score: 72.1%
  Parse Success: 100.0%
  F1: 68.5%
  Latency: 2340ms
  Errors: 0
```

## Tips

1. **Start with quick-test**: Use `quick-test` to quickly try a model before full evaluation
2. **Test incrementally**: Test one model at a time to avoid memory issues
3. **Check system resources**: Larger models require more RAM
4. **Consider latency**: For real-time applications, prefer faster models even if F1 is slightly lower
5. **Add custom test cases**: Edit `src/test-suite.ts` to add domain-specific test cases
