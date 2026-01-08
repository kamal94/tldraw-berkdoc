# LLM Service cURL Examples

## Service Information
- Default port: `3001`
- Base URL: `http://localhost:3001`

## 1. Health Check

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "ready": true
}
```

## 2. Ready Check

```bash
curl http://localhost:3001/ready
```

Expected response (when ready):
```json
{
  "ready": true
}
```

## 3. List Models

```bash
curl http://localhost:3001/v1/models
```

Expected response:
```json
{
  "object": "list",
  "data": [
    {
      "id": "model-name",
      "object": "model",
      "created": 1234567890,
      "owned_by": "xenova"
    }
  ]
}
```

## 4. Text Completions (Basic)

```bash
curl -X POST http://localhost:3001/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?"
  }'
```

## 5. Text Completions (With Options)

```bash
curl -X POST http://localhost:3001/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing in simple terms:",
    "max_tokens": 100,
    "temperature": 0.7,
    "top_p": 0.9,
    "stop": ["\n\n"]
  }'
```

## 6. Chat Completions (Basic)

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ]
  }'
```

## 7. Chat Completions (Multi-turn Conversation)

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "What is Python?"
      },
      {
        "role": "assistant",
        "content": "Python is a programming language."
      },
      {
        "role": "user",
        "content": "What are its main features?"
      }
    ],
    "max_tokens": 150,
    "temperature": 0.8
  }'
```

## 8. Pretty Print JSON Response

Add `| jq` to any command for formatted output:

```bash
curl -X POST http://localhost:3001/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a haiku about coding"
  }' | jq
```

## 9. Save Response to File

```bash
curl -X POST http://localhost:3001/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Summarize the benefits of renewable energy"
  }' > response.json
```

## Request Parameters

### `/v1/completions` endpoint:
- `prompt` (required): The text prompt to complete
- `max_tokens` (optional): Maximum number of tokens to generate
- `temperature` (optional): Sampling temperature (0.0 to 2.0)
- `top_p` (optional): Nucleus sampling parameter
- `stop` (optional): String or array of strings to stop generation

### `/v1/chat/completions` endpoint:
- `messages` (required): Array of message objects with `role` and `content`
- `max_tokens` (optional): Maximum number of tokens to generate
- `temperature` (optional): Sampling temperature (0.0 to 2.0)
- `top_p` (optional): Nucleus sampling parameter
- `stop` (optional): String or array of strings to stop generation
