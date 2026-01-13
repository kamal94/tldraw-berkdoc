#!/bin/bash

# Sample curl requests for Duplicate Detection API
# 
# Prerequisites:
# - Backend server running on http://localhost:3000 (or set BASE_URL)
# - Valid JWT token (replace YOUR_JWT_TOKEN with actual token)
# - Valid user ID and document ID

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:-YOUR_JWT_TOKEN}"
USER_ID="${USER_ID:-user_1234567890_abc}"
DOCUMENT_ID="${DOCUMENT_ID:-doc_1234567890_xyz}"

echo "=== Duplicate Detection API Sample Requests ==="
echo ""

# 1. Manually trigger duplicate detection for a user
echo "1. Trigger duplicate detection for a user:"
echo "POST ${BASE_URL}/duplicates/detect/${USER_ID}"
echo ""
curl -X POST "${BASE_URL}/duplicates/detect/${USER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  -v
echo ""
echo ""

# 2. Get all duplicates for a specific document
echo "2. Get duplicates for a specific document:"
echo "GET ${BASE_URL}/duplicates/document/${DOCUMENT_ID}"
echo ""
curl -X GET "${BASE_URL}/duplicates/document/${DOCUMENT_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  -v
echo ""
echo ""

# 3. Get all duplicates for a user
echo "3. Get all duplicates for a user:"
echo "GET ${BASE_URL}/duplicates/user/${USER_ID}"
echo ""
curl -X GET "${BASE_URL}/duplicates/user/${USER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  -v
echo ""
echo ""

echo "=== Sample Response Formats ==="
echo ""
echo "POST /duplicates/detect/:userId response:"
cat << 'EOF'
{
  "chunkDuplicates": 0,
  "documentDuplicates": 0,
  "message": "Duplicate detection job queued successfully"
}
EOF
echo ""
echo ""

echo "GET /duplicates/document/:documentId or /duplicates/user/:userId response:"
cat << 'EOF'
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
EOF
echo ""
