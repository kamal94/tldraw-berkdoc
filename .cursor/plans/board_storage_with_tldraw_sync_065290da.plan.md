---
name: Board Storage with tldraw Sync
overview: Implement server-side board storage using tldraw sync library for real-time synchronization, with auto-persistence to database, WebSocket-based collaboration, and backend-driven shape additions.
todos:
  - id: backend-db
    content: Add boards table and database methods in DatabaseService
    status: pending
  - id: backend-entities
    content: Create board entity and DTOs
    status: pending
  - id: backend-schema
    content: Extract DocumentShape schema for TLSocketRoom schema creation
    status: pending
  - id: backend-room-manager
    content: Implement RoomManager service to manage TLSocketRoom instances
    status: pending
  - id: backend-service
    content: Implement BoardsService with CRUD and addDocumentShape using TLSocketRoom
    status: pending
  - id: backend-controller
    content: Create BoardsController with REST endpoints
    status: pending
  - id: backend-websocket
    content: Implement WebSocket gateway/adapter for TLSocketRoom integration
    status: pending
  - id: backend-listener
    content: Create BoardListener to handle document.created events and add shapes via TLSocketRoom
    status: pending
  - id: backend-module
    content: Create BoardsModule and register in AppModule
    status: pending
  - id: backend-deps
    content: Add @tldraw/sync-core, @tldraw/tlschema dependencies
    status: pending
  - id: frontend-api
    content: Create boards API client (findAll, create, findOne, delete)
    status: pending
  - id: frontend-sync-hook
    content: Implement useBoardSync hook using @tldraw/sync useSync
    status: pending
  - id: frontend-selector
    content: Build BoardSelector component for board management
    status: pending
  - id: frontend-app
    content: Update App.tsx to use useBoardSync and pass store to Tldraw
    status: pending
  - id: frontend-deps
    content: Add @tldraw/sync dependency
    status: pending
  - id: migration
    content: Implement migration logic for existing users (create default board)
    status: pending
---

# Board Storage System with tldraw Sync

## Overview

Replace client-side shape creation with server-side board storage using **tldraw sync** (`@tldraw/sync` and `@tldraw/sync-core`). This provides production-grade real-time collaboration, automatic conflict resolution, and built-in persistence hooks. Each board maps to a tldraw sync "room" with automatic WebSocket synchronization.

## Architecture

### Data Flow

```
Frontend (useSync hook)
  → TLSocketRoom (WebSocket)
  → Persistence Hook (onChange)
  → Database (boards table)

Backend (document.created event)
  → Board Service (get TLSocketRoom instance)
  → Add shape via TLSocketRoom.store
  → Auto-synced to all connected clients
  → Persistence hook saves to database
```

### Key Components

1. **TLSocketRoom** (backend) - Manages WebSocket connections and document state per board
2. **useSync hook** (frontend) - Connects to TLSocketRoom and manages store
3. **Persistence hooks** - Save snapshots to database when document changes
4. **Board CRUD API** - Manage board metadata (name, creation, deletion)

## Backend Implementation

### 1. Database Schema

**File:** `backend/src/database/database.service.ts`

Add `boards` table:

- `id` (TEXT PRIMARY KEY) - Maps to tldraw sync room ID
- `user_id` (TEXT, FOREIGN KEY to users)
- `name` (TEXT, board name)
- `snapshot` (TEXT, JSON string of TLStoreSnapshot - optional, for initial load)
- `created_at` (TEXT)
- `updated_at` (TEXT)

Add database methods:

- `createBoard(userId, name, snapshot?)`
- `findBoardById(boardId)`
- `findBoardsByUserId(userId)`
- `updateBoardSnapshot(boardId, snapshot)` - Called by persistence hook
- `deleteBoard(boardId)`

### 2. Board Entity & DTOs

**Files:**

- `backend/src/boards/entities/board.entity.ts` - Board interface
- `backend/src/boards/dto/board.dto.ts` - CreateBoardDto, BoardResponseDto

### 3. TLSocketRoom Manager

**File:** `backend/src/boards/boards.room-manager.ts`

Singleton service to manage TLSocketRoom instances:

- `getOrCreateRoom(boardId, initialSnapshot?)` - Get existing room or create new
- `getRoom(boardId)` - Get existing room (throws if not found)
- `deleteRoom(boardId)` - Clean up room instance
- Store rooms in Map: `Map<boardId, TLSocketRoom>`

**Key implementation:**

```typescript
import { TLSocketRoom } from '@tldraw/sync-core'
import { createTLSchema, defaultShapeSchemas } from '@tldraw/tlschema'
import { DocumentShapeProps } from '../shapes/document-shape-schema' // Need to extract schema

const schema = createTLSchema({
  shapes: {
    ...defaultShapeSchemas,
    document: {
      props: DocumentShapeProps,
      migrations: {}, // Add if needed
    },
  },
})

// Create room with persistence hook
const room = new TLSocketRoom({
  schema,
  initialSnapshot: snapshotFromDB,
  onLoad: async (room) => {
    // Load snapshot from DB if exists
  },
  onPersist: async (room, snapshot) => {
    // Save snapshot to database
    await databaseService.updateBoardSnapshot(boardId, snapshot)
  },
})
```

### 4. Board Service

**File:** `backend/src/boards/boards.service.ts`

Methods:

- `create(userId, name)` - Create board, initialize TLSocketRoom
- `findAll(userId)` - List user's boards
- `findOne(userId, boardId)` - Get board metadata
- `delete(userId, boardId)` - Delete board and cleanup room
- `addDocumentShape(boardId, document)` - Add document shape via TLSocketRoom

**For adding shapes:**

```typescript
async addDocumentShape(boardId: string, document: Document) {
  const room = this.roomManager.getRoom(boardId)
  const store = room.store
  
  // Use tldraw store API to add shape
  store.createShape({
    id: createShapeId(document.id),
    type: 'document',
    // ... shape props
  })
}
```

### 5. Board Controller

**File:** `backend/src/boards/boards.controller.ts`

Endpoints:

- `GET /boards` - List user's boards
- `POST /boards` - Create new board
- `GET /boards/:id` - Get board metadata (not snapshot - that comes via sync)
- `DELETE /boards/:id` - Delete board

### 6. WebSocket Gateway (tldraw sync)

**File:** `backend/src/boards/boards.gateway.ts`

Use NestJS WebSocket gateway that integrates with TLSocketRoom:

- Authenticate WebSocket connections (JWT)
- Route connections to appropriate TLSocketRoom
- TLSocketRoom handles all WebSocket communication internally

**Implementation approach:**

- TLSocketRoom expects WebSocket server
- Use NestJS WebSocket adapter (socket.io or ws)
- Create adapter that bridges NestJS WebSocket to TLSocketRoom's expected interface
- Or use TLSocketRoom's built-in WebSocket handling if available

**Alternative simpler approach:**

- Use tldraw sync's simple server example pattern
- Create HTTP endpoint that upgrades to WebSocket
- TLSocketRoom manages its own WebSocket connections

### 7. Board Listener (Document Events)

**File:** `backend/src/boards/boards.listener.ts`

Listen to `document.created` events:

- Find user's active/default board (or create one)
- Get TLSocketRoom instance for that board
- Add document shape using store API
- TLSocketRoom automatically syncs to all connected clients
- Persistence hook automatically saves to database

### 8. Board Module

**File:** `backend/src/boards/boards.module.ts`

Register BoardService, BoardController, BoardGateway, BoardListener, RoomManager.

**File:** `backend/src/app.module.ts` - Import BoardsModule

### 9. Dependencies

**File:** `backend/package.json`

Add:

- `@tldraw/sync-core` - TLSocketRoom and server-side sync
- `@tldraw/tlschema` - Schema creation for custom shapes
- `@nestjs/websockets` - WebSocket support (if using NestJS adapter)
- `socket.io` or `ws` - WebSocket implementation

## Frontend Implementation

### 1. Board API Client

**File:** `frontend/src/api/boards.ts`

Methods:

- `findAll()` - List boards
- `create(name)` - Create board
- `findOne(boardId)` - Get board metadata
- `delete(boardId)` - Delete board

Note: Snapshots are loaded via sync, not API.

### 2. useBoardSync Hook

**File:** `frontend/src/hooks/useBoardSync.ts`

Wrapper around `useSync` from `@tldraw/sync`:

- Connect to WebSocket endpoint: `wss://api/boards/:boardId/sync`
- Handle authentication (JWT token in query/header)
- Return store for use with `<Tldraw store={store} />`
- Handle reconnection logic
```typescript
import { useSync } from '@tldraw/sync'
import { defaultShapeUtils } from 'tldraw'
import { DocumentShapeUtil } from '../shapes/DocumentShape'

export function useBoardSync(boardId: string | null) {
  const token = getAuthToken()
  const uri = boardId 
    ? `${WS_URL}/boards/${boardId}/sync?token=${token}`
    : null

  const store = useSync({
    uri,
    shapeUtils: useMemo(() => [
      DocumentShapeUtil,
      ...defaultShapeUtils
    ], []),
    // Asset store if needed
  })

  return store
}
```


### 3. Board Selector Component

**File:** `frontend/src/components/BoardSelector.tsx`

- Dropdown/select to switch between boards
- "Create New Board" option
- Display current board name

### 4. Update App.tsx

**File:** `frontend/src/App.tsx`

Changes:

- Remove `persistenceKey` (no longer using localStorage)
- Add board selection state
- Use `useBoardSync` hook to get store
- Pass store to `<Tldraw store={store} />` instead of using default store
- Remove `useDocumentLoader` (shapes come from sync)
- Keep `onMount` for any initialization that doesn't involve shape creation

### 5. Remove useDocumentLoader Logic

**File:** `frontend/src/hooks/useDocumentLoader.ts`

**Option A:** Remove entirely

**Option B:** Keep minimal version for migration (only runs if board is empty on first load)

### 6. Dependencies

**File:** `frontend/package.json`

Add:

- `@tldraw/sync` - Client-side sync hook

## Key Implementation Details

### TLSocketRoom Persistence

TLSocketRoom provides `onPersist` callback that fires when document changes. Use this to save snapshots:

```typescript
const room = new TLSocketRoom({
  schema,
  onPersist: async (room, snapshot) => {
    await databaseService.updateBoardSnapshot(boardId, snapshot)
  },
})
```

### Custom Shape Schema

Extract shape schema from DocumentShapeUtil for use in TLSocketRoom schema. Need to ensure server and client use same schema.

### WebSocket Authentication

- Pass JWT token in WebSocket connection (query param or header)
- Validate token in gateway before creating/connecting to room
- Ensure user has access to the board

### Backend Shape Addition

When document is created:

1. Get or create board for user
2. Get TLSocketRoom instance
3. Use `room.store.createShape()` to add document shape
4. TLSocketRoom automatically:

   - Syncs to all connected clients
   - Triggers persistence hook
   - Handles conflicts

### Migration Strategy

1. On first load, if user has no boards, create default board
2. If board exists but room has no shapes, could run migration logic once
3. After migration, all shape management goes through sync

### Room Lifecycle

- Create TLSocketRoom when first client connects
- Keep room in memory while clients are connected
- Optionally persist room state periodically
- Clean up room when no clients connected (or keep for faster reconnection)

## Benefits of Using tldraw Sync

1. **Production-tested** - Used on tldraw.com
2. **Automatic conflict resolution** - Handles concurrent edits
3. **Built-in persistence hooks** - Easy database integration
4. **Real-time sync** - Automatic WebSocket management
5. **Schema validation** - Ensures data integrity
6. **Migration support** - Handles version changes
7. **Less code** - No custom WebSocket logic needed