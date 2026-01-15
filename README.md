# BerkDoc

An AI-powered knowledge management platform designed to help teams organize, explore, and understand large collections of text-based documents.

## Business Problem

Traditional document management systems rely on static folder hierarchies that force users to choose a single organizational structure. This becomes problematic when:

- Documents relate to multiple projects, topics, or workflows simultaneously
- Teams need different views of the same information
- The meaning and relationships between documents evolve over time
- Large document collections become difficult to navigate and understand

BerkDoc solves this by using AI to automatically infer semantic relationships between documents, enabling flexible, multi-dimensional views of information without duplication.

## Core Concepts

- **Semantic Organization**: Documents are automatically connected based on meaning, not just location
- **Infinite Canvas UI**: Knowledge can be explored spatially (similar to tools like Figma or Miro), not just as lists
- **Live Folders**: Collections that auto-update as documents are added or their meaning changes
- **Multi-Context Documents**: A single document can appear in multiple folders or hierarchies simultaneously

## Tech Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **tldraw** - Infinite canvas UI for spatial document exploration
- **Tailwind CSS** - Styling
- **@tldraw/sync** - Real-time collaboration and synchronization

### Backend
- **NestJS** - Node.js framework
- **TypeScript** - Type safety
- **Bun** - Runtime and package manager
- **Weaviate** - Vector database for semantic search
- **@xenova/transformers** - Local embeddings (all-MiniLM-L6-v2 model, 384 dimensions)
- **JWT + Google OAuth** - Authentication
- **WebSocket** - Real-time communication
- **SQLite** - Primary database (PostgreSQL-ready architecture)

### Infrastructure
- **Docker** - Containerization (Weaviate)
- **Event-Driven Architecture** - Document ingestion pipeline
- **Python** - Document clustering scripts (HDBSCAN)

### Key Features
- Semantic document search using vector embeddings
- Real-time collaborative boards with tldraw sync
- Automatic document chunking and embedding
- Duplicate detection across document collections
- Google Drive integration
- Document clustering and organization
- User avatars and collaboration features

## Project Structure

```
├── backend/          # NestJS backend API
├── frontend/         # React + tldraw frontend
├── shared/           # Shared TypeScript types
└── docker-compose.yml # Weaviate configuration
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Docker](https://www.docker.com/) (for Weaviate)

### Quick Start

1. **Start Weaviate**:
   ```bash
   docker-compose up -d
   ```

2. **Backend Setup**:
   ```bash
   cd backend
   bun install
   cp .env.example .env  # Configure your environment variables
   bun run start:dev
   ```
   See [backend/README.md](./backend/README.md) for detailed setup instructions.

3. **Frontend Setup**:
   ```bash
   cd frontend
   bun install
   bun run dev
   ```

## Documentation

- **[Backend README](./backend/README.md)** - Backend API documentation, architecture, and development guide
- **[Frontend README](./frontend/README.md)** - Frontend setup and development notes
- **[Duplicate Detection Testing](./backend/src/duplicates/README_TESTING.md)** - Guide for testing duplicate detection features

## Development

### Linting

```bash
# Lint both frontend and backend
bun run lint

# Lint individually
bun run lint:backend
bun run lint:frontend
```

### Architecture Highlights

- **Event-Driven Ingestion**: Documents are automatically chunked and embedded when created/updated
- **Real-Time Collaboration**: tldraw sync provides production-grade real-time collaboration with automatic conflict resolution
- **Semantic Search**: Vector embeddings enable search by meaning, not just keywords
- **Modular Design**: Clean separation between frontend, backend, and shared types

## License

Private project.
