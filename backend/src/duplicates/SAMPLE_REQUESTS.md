# Duplicate Detection API - Sample Requests

This document contains sample curl requests for the Duplicate Detection API endpoints.

## Prerequisites

- Backend server running (default: `http://localhost:3000`)
- Valid JWT authentication token
- Valid user ID and document ID

## Base Configuration

```bash
export BASE_URL="http://localhost:3000"
export TOKEN="your_jwt_token_here"
export USER_ID="user_1234567890_abc"
export DOCUMENT_ID="doc_1234567890_xyz"
```

## Endpoints

### 1. Trigger Duplicate Detection

Manually trigger duplicate detection for a user's documents. This will detect both chunk-level and document-level duplicates.

**Endpoint:** `POST /duplicates/detect/:userId`

**Request:**
```bash
curl -X POST "${BASE_URL}/duplicates/detect/${USER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json"
```

**Response (202 Accepted):**
```json
{
  "chunkDuplicates": 0,
  "documentDuplicates": 0,
  "message": "Duplicate detection job queued successfully"
}
```

**Notes:**
- The detection runs asynchronously in the background
- The response immediately returns with placeholder values
- Detection is automatically triggered on document create/update events
- This endpoint requires the authenticated user to match the userId parameter

---

### 2. Get Duplicates for a Document

Retrieve all duplicate relationships for a specific document.

**Endpoint:** `GET /duplicates/document/:documentId`

**Request:**
```bash
curl -X GET "${BASE_URL}/duplicates/document/${DOCUMENT_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json"
```

**Response (200 OK):**
```json
[
  {
    "id": "dup_1234567890_abc",
    "userId": "user_1234567890_abc",
    "sourceDocumentId": "doc_1234567890_xyz",
    "targetDocumentId": "doc_9876543210_def",
    "sourceChunkIndex": 0,
    "targetChunkIndex": 2,
    "similarityScore": 0.95,
    "duplicateType": "chunk",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  {
    "id": "dup_1234567890_def",
    "userId": "user_1234567890_abc",
    "sourceDocumentId": "doc_1234567890_xyz",
    "targetDocumentId": "doc_9876543210_ghi",
    "similarityScore": 0.92,
    "duplicateType": "document",
    "createdAt": "2024-01-15T10:35:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
]
```

**Response Fields:**
- `id`: Unique identifier for the duplicate record
- `userId`: User who owns the documents
- `sourceDocumentId`: First document in the duplicate pair (lexicographically smaller)
- `targetDocumentId`: Second document in the duplicate pair
- `sourceChunkIndex`: Chunk index in source document (null for document-level duplicates)
- `targetChunkIndex`: Chunk index in target document (null for document-level duplicates)
- `similarityScore`: Similarity score between 0.0 and 1.0 (threshold: 0.9)
- `duplicateType`: Either "chunk" or "document"
- `createdAt`: Timestamp when duplicate was detected
- `updatedAt`: Timestamp when duplicate record was last updated

---

### 3. Get All Duplicates for a User

Retrieve all duplicate relationships for all documents owned by a user.

**Endpoint:** `GET /duplicates/user/:userId`

**Request:**
```bash
curl -X GET "${BASE_URL}/duplicates/user/${USER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json"
```

**Response (200 OK):**
```json
[
  {
    "id": "dup_1234567890_abc",
    "userId": "user_1234567890_abc",
    "sourceDocumentId": "doc_1234567890_xyz",
    "targetDocumentId": "doc_9876543210_def",
    "sourceChunkIndex": 0,
    "targetChunkIndex": 2,
    "similarityScore": 0.95,
    "duplicateType": "chunk",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

**Notes:**
- Returns all duplicates across all documents for the specified user
- Results are sorted by similarity score (descending)
- This endpoint requires the authenticated user to match the userId parameter

---

## Authentication

All endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

### Getting a JWT Token

There are two ways to obtain a JWT token:

#### Option 1: Register a New User

**Endpoint:** `POST /auth/register`

**Request:**
```bash
curl -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "yourpassword123",
    "name": "Your Name"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_1234567890_abc",
    "email": "user@example.com",
    "name": "Your Name"
  }
}
```

**Save the `access_token` value** - this is your JWT token.

#### Option 2: Login with Existing Credentials

**Endpoint:** `POST /auth/login`

**Request:**
```bash
curl -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "yourpassword123"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_1234567890_abc",
    "email": "user@example.com",
    "name": "Your Name",
    "avatarUrl": "https://..."
  }
}
```

**Save the `access_token` value** - this is your JWT token.

#### Option 3: Google OAuth (Browser-based)

1. Navigate to: `http://localhost:3000/auth/google`
2. Complete Google authentication
3. You'll be redirected to the frontend with the token in the URL query parameter
4. Extract the `token` parameter from the redirect URL

### Using the Token

Once you have the token, use it in all subsequent requests:

```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET "${BASE_URL}/duplicates/user/${USER_ID}" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Verify Your Token

You can verify your token is working by calling:

```bash
curl -X GET "${BASE_URL}/auth/me" \
  -H "Authorization: Bearer ${TOKEN}"
```

This will return your current user information if the token is valid.

## Error Responses

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 403 Forbidden (User ID mismatch)
```json
{
  "message": "Unauthorized: Can only detect duplicates for your own documents"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Document not found"
}
```

## Duplicate Detection Details

### Chunk-Level Duplicates
- Detects similar chunks (≥90% similarity) across different documents
- Uses vector similarity search via Weaviate
- Stores chunk indices for both source and target documents

### Document-Level Duplicates
- Aggregates chunk similarities to identify duplicate documents
- Calculates average similarity between matching chunks
- Documents with ≥90% average similarity are marked as duplicates

### Automatic Detection
Duplicate detection is automatically triggered:
- When a document is created (`document.created` event)
- When a document is updated (`document.updated` event)
- Detection runs after embeddings are processed (5-second delay)

### Manual Detection
Use the `POST /duplicates/detect/:userId` endpoint to manually trigger detection for all user documents.

## Example Workflow

1. **Create or update documents** - Duplicates are automatically detected
2. **Query duplicates for a document:**
   ```bash
   curl -X GET "${BASE_URL}/duplicates/document/${DOCUMENT_ID}" \
     -H "Authorization: Bearer ${TOKEN}"
   ```
3. **Manually trigger detection if needed:**
   ```bash
   curl -X POST "${BASE_URL}/duplicates/detect/${USER_ID}" \
     -H "Authorization: Bearer ${TOKEN}"
   ```
4. **View all duplicates for a user:**
   ```bash
   curl -X GET "${BASE_URL}/duplicates/user/${USER_ID}" \
     -H "Authorization: Bearer ${TOKEN}"
   ```
