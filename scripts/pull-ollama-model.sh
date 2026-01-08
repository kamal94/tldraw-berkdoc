#!/bin/bash

# Script to pull an Ollama model (works with local Ollama instance)
# Usage: ./scripts/pull-ollama-model.sh [model-name]
# Example: ./scripts/pull-ollama-model.sh gemma3:270m

MODEL_NAME=${1:-gemma3:270m}

# Check if ollama command is available (local instance)
if ! command -v ollama &> /dev/null; then
  echo "Error: Ollama is not installed or not in PATH."
  echo "Please install Ollama: https://ollama.com"
  echo ""
  echo "Or if using Docker, uncomment the ollama service in docker-compose.yml"
  echo "and use: docker compose exec ollama ollama pull $MODEL_NAME"
  exit 1
fi

# Check if Ollama service is running
if ! ollama list &> /dev/null; then
  echo "Error: Ollama service is not running."
  echo "Please start Ollama: ollama serve"
  echo "Or on Mac, start it from the Ollama app"
  exit 1
fi

echo "Pulling model: $MODEL_NAME"
echo "This may take a while depending on the model size..."
echo ""

ollama pull "$MODEL_NAME"

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ Model $MODEL_NAME pulled successfully!"
  echo ""
  echo "To use this model, set OLLAMA_MODEL=$MODEL_NAME in your docker-compose.yml or .env file"
  echo ""
  echo "Verify it's available:"
  echo "  ollama list"
else
  echo ""
  echo "✗ Failed to pull model. Make sure:"
  echo "  - The model name is correct"
  echo "  - You have internet access"
  echo "  - Ollama service is running (ollama serve)"
  exit 1
fi
