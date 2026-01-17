# BerkDoc Backend

A NestJS backend for BerkDoc - an AI-powered knowledge management platform. Features Weaviate vector database for semantic search, JWT + Google OAuth authentication, and an event-driven document ingestion pipeline.

## Features

- **Vector Database**: Weaviate integration for semantic document search
- **Local Embeddings**: Uses `@xenova/transformers` with the all-MiniLM-L6-v2 model (384 dimensions)
- **Authentication**: JWT + Google OAuth support
- **Event-Driven Ingestion**: Automatic document chunking and embedding on create/update
- **Semantic Search**: Search documents by meaning, not just keywords

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Docker](https://www.docker.com/) (for Weaviate)

## Quick Start

### 1. Start Weaviate

```bash
docker-compose up -d
```

This starts Weaviate on:
- HTTP: `http://localhost:8080`
- gRPC: `localhost:50051`

### 2. Configure Environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Update `.env` with your settings:
- `JWT_SECRET`: A secure secret for JWT signing
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: From Google Cloud Console (optional, for OAuth)
- `LLM_PROVIDER`: `ollama`, `jarvis`, `runpod`, or `gemini` (defaults to `ollama`)
- `OLLAMA_BASE_URL`: Ollama base URL (defaults to `http://localhost:11434`)
- `OLLAMA_MODEL`: Ollama model name (defaults to `gemma3:12b`)
- `JARVIS_API_KEY`: Jarvis Labs API key
- `JARVIS_DEPLOYMENT_ID`: Jarvis Labs deployment ID
- `JARVIS_MODEL`: Jarvis model name (defaults to `gemma3:12b`)
- `RUNPOD_API_KEY`: RunPod API key
- `RUNPOD_ENDPOINT_ID`: RunPod endpoint ID
- `GEMINI_API_KEY`: Google Gemini API key (required for Gemini provider)
- `GEMINI_MODEL`: Gemini model name (defaults to `gemini-2.5-flash-lite`)

### 3. Install Dependencies

```bash
bun install
```

### 4. Start the Server

```bash
bun run start:dev
```

The server runs on `http://localhost:3000`.

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register with email/password |
| POST | `/auth/login` | Login, returns JWT |
| GET | `/auth/google` | Start Google OAuth flow |
| GET | `/auth/google/callback` | OAuth callback |
| GET | `/auth/me` | Get current user (requires auth) |

### Documents

All document endpoints require authentication (Bearer token).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/documents` | List all documents |
| POST | `/documents` | Create document |
| GET | `/documents/:id` | Get document by ID |
| PUT | `/documents/:id` | Update document |
| DELETE | `/documents/:id` | Delete document |
| POST | `/documents/search` | Semantic search |

## Example Usage

### Register a User

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123", "name": "Test User"}'
```

### Create a Document

```bash
curl -X POST http://localhost:3000/documents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "My Document",
    "content": "This is the full text content of my document...",
    "source": "manual",
    "dimensions": ["topic1", "topic2"]
  }'
```

### Semantic Search

```bash
curl -X POST http://localhost:3000/documents/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"query": "What are the key features?", "limit": 10}'
```

## Architecture

```
src/
├── auth/           # JWT + Google OAuth authentication
├── documents/      # Document CRUD operations
├── embedding/      # Local embedding with transformers.js
├── ingestion/      # Event-driven document processing
└── weaviate/       # Vector database integration
```

### Document Ingestion Flow

1. Document is created/updated via API
2. `document.created` or `document.updated` event is emitted
3. Ingestion listener chunks the document (500 chars with 50 char overlap)
4. Each chunk is embedded using all-MiniLM-L6-v2
5. Chunks + vectors are stored in Weaviate

## Development

```bash
# Run in development mode with hot reload
bun run start:dev

# Type check
bun x tsc --noEmit

# Run linter
bun run lint
```

## Document Clustering

The backend includes a Python script for HDBSCAN clustering of user document collections.

### Setup

Install Python dependencies using `uv`:

```bash
cd backend
uv pip install -r requirements-clustering.txt
```

### Usage

```bash
# Basic usage (uses default min_cluster_size=5, min_samples=5)
python scripts/cluster_documents.py <user_id>

# Custom parameters
python scripts/cluster_documents.py <user_id> --min-cluster-size 10 --min-samples 10

# With SQLite database access for additional metadata
python scripts/cluster_documents.py <user_id> --db-path data/berkdoc.db

# Save results to file
python scripts/cluster_documents.py <user_id> --output results.json
```

The script:
- Fetches all document chunks from Weaviate for the specified user
- Aggregates chunk embeddings per document (mean pooling)
- Performs HDBSCAN clustering on document-level embeddings
- Outputs cluster assignments and statistics as JSON

## Production Notes

- Replace in-memory user/document stores with a real database (PostgreSQL, MongoDB, etc.)
- Use proper password hashing (bcrypt) instead of SHA-256
- Set a strong `JWT_SECRET`
- Configure proper CORS origins
- Set up Google OAuth credentials in Google Cloud Console
