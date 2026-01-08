# Hugging Face Authentication Guide

## Important Note

**The error "Unsupported model type: qwen2" is NOT an authentication issue.** 

This error means that `transformers.js` doesn't support Qwen2 models yet. Authentication will not fix this. You need to use models that are compatible with transformers.js (usually ones available in the `Xenova/` namespace).

## When Authentication Is Needed

Authentication is only needed if you want to:
1. Access **private models** (your own models)
2. Access **gated models** (models that require agreement to terms)
3. Increase rate limits for Hugging Face API

## How to Authenticate

### 1. Get a Hugging Face Access Token

1. Go to https://huggingface.co/settings/tokens
2. Log in to your Hugging Face account
3. Click "New token"
4. Choose a name and select role:
   - **Read**: For downloading models (sufficient for most use cases)
   - **Write**: For uploading models
   - **Fine-grained**: For specific resources
5. Click "Generate token"
6. **Copy the token immediately** (it's only shown once)

### 2. Set the Environment Variable

You can set the token in several ways:

#### Option A: Environment Variable (Recommended)

```bash
# In your terminal
export HF_TOKEN=your_token_here

# Or for a single command
HF_TOKEN=your_token_here bun run dev
```

#### Option B: In .env file

Create or update `.env` in the `llm-service` directory:

```bash
HF_TOKEN=your_token_here
# or
HUGGINGFACE_TOKEN=your_token_here
```

Then load it in your code (if using dotenv):

```bash
bun add -d dotenv
```

```typescript
import dotenv from 'dotenv';
dotenv.config();
```

#### Option C: In Docker

```bash
# Set in docker-compose.yml
environment:
  - HF_TOKEN=${HF_TOKEN}

# Or when running
docker run -e HF_TOKEN=your_token_here llm-service
```

### 3. Verify Authentication

The service will automatically detect and use the token if it's set. You'll see:

```
[LLM] Loading model: model-name...
[LLM] Using Hugging Face authentication
[LLM] Model loaded successfully
```

## Supported Model Names

The service now supports authentication and will use the token when loading models. However, **only certain models work with transformers.js**:

### ✅ Supported Models (Xenova namespace):
- `Xenova/LaMini-Flan-T5-77M`
- `Xenova/flan-t5-small`
- `Xenova/flan-t5-base`
- `Xenova/LaMini-Flan-T5-248M`
- `Xenova/LaMini-Flan-T5-783M`

### ❌ Not Supported (even with authentication):
- `Qwen/Qwen2.5-0.5B-Instruct` - Qwen2 not supported by transformers.js yet
- `mistralai/Mistral-7B-Instruct-v0.2` - Not in Xenova format
- Most non-Xenova models - Need to be converted to ONNX format first

## Troubleshooting

### "Unauthorized" Error
- ✅ Check that `HF_TOKEN` or `HUGGINGFACE_TOKEN` is set
- ✅ Verify the token is valid at https://huggingface.co/settings/tokens
- ✅ Make sure the token has "Read" permissions
- ✅ For private models, ensure the token has access to the organization/model

### "Unsupported model type" Error
- ❌ This is NOT an authentication issue
- The model architecture is not supported by transformers.js
- Try a model from the `Xenova/` namespace instead

### "Model not found" Error
- Check that the model name is correct
- For private models, ensure:
  - The token has access to the model
  - You're using the full model path (e.g., `organization/model-name`)

## Example Usage

```bash
# Set token and run service
export HF_TOKEN=hf_xxxxxxxxxxxx
bun run dev

# Or test a specific model
HF_TOKEN=hf_xxxxxxxxxxxx bun run quick-test Xenova/flan-t5-base
```

## Security Best Practices

1. **Never commit tokens to git**
   - Add `.env` to `.gitignore`
   - Use environment variables or secret management tools

2. **Use fine-grained tokens in production**
   - Limit access to specific models/resources
   - Easier to revoke if compromised

3. **Rotate tokens regularly**
   - Generate new tokens periodically
   - Revoke old tokens that are no longer needed

4. **Use different tokens for dev/prod**
   - Separate tokens for different environments
   - Limits blast radius if one is compromised
