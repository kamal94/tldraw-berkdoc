# Duplicate Detection Testing Guide

This guide explains how to test the duplicate detection feature and troubleshoot issues.

## Test Files

1. **`duplicates.service.test.ts`** - Unit tests with mocked dependencies
2. **`duplicates.integration.test.ts`** - Integration test with real database and Weaviate

## Running Tests

### Unit Tests
```bash
bun test:duplicates
```

### Integration Test
```bash
bun test:duplicates:integration
```

Or with a specific user ID:
```bash
TEST_USER_ID=your_user_id bun test:duplicates:integration
```

## Test Scenarios

### Positive Tests (Should Detect Duplicates)

1. **Identical Chunks** - Two documents with identical or very similar chunks should be detected
2. **High Similarity** - Chunks with >90% similarity across different documents
3. **Multiple Matching Chunks** - Documents where multiple chunks match should be detected as document duplicates
4. **Partial Duplicates** - Documents with overlapping content should be detected

### Negative Tests (Should NOT Detect Duplicates)

1. **Different Content** - Completely different documents should not be flagged
2. **Same Document** - Chunks from the same document should not be flagged as duplicates
3. **Low Similarity** - Chunks with <90% similarity should not be flagged
4. **Empty/No Vectors** - Chunks without vectors should be skipped

## Troubleshooting: No Duplicates Detected

If you're getting no duplicates when you know there should be, check:

### 1. Check if Chunks Exist
```bash
# Run the integration test to see chunk counts
bun test:duplicates:integration
```

### 2. Check Similarity Scores
The integration test will show actual similarity scores. Look for:
- Scores close to but below 0.9 (threshold might be too high)
- Scores that exist but aren't being stored

### 3. Verify Vectors
Ensure chunks have valid vectors:
- Vector length should be 384 (for all-MiniLM-L6-v2)
- Vectors should not be empty arrays

### 4. Check Document Processing
Make sure documents have been processed:
- Documents need to be chunked and embedded
- Check Weaviate for stored chunks
- Verify embeddings were generated successfully

### 5. Adjust Threshold (if needed)
If duplicates exist but scores are just below 0.9, you can temporarily lower the threshold:

```typescript
// In duplicates.service.ts
private readonly similarityThreshold = 0.85; // Lower from 0.9
```

### 6. Check Logs
Enable debug logging to see similarity scores:
```typescript
// The service logs similarity scores in debug mode
// Check your logs for: "Document similarity between..."
```

## Common Issues

### Issue: "No chunks found in Weaviate"
**Solution**: Documents need to be processed first. Create/update documents to trigger embedding generation.

### Issue: "Similarity scores are 0"
**Possible causes**:
- Vectors are not normalized correctly
- Weaviate search is not finding matches
- Documents are truly different

**Debug**: Run integration test to see actual similarity scores.

### Issue: "Chunks found but no duplicates"
**Possible causes**:
- Similarity threshold too high (0.9)
- Chunks are similar but not identical enough
- Bug in similarity calculation

**Debug**: Check the integration test output for actual similarity scores.

## Manual Testing

### Test with Real Data

1. Create two documents with similar content:
```bash
# Use the API to create documents
curl -X POST "http://localhost:3000/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Doc 1",
    "content": "This is a test document with some content that will be duplicated.",
    "source": "manual"
  }'

curl -X POST "http://localhost:3000/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Doc 2",
    "content": "This is a test document with some content that will be duplicated.",
    "source": "manual"
  }'
```

2. Wait for embeddings to process (5-10 seconds)

3. Trigger duplicate detection:
```bash
curl -X POST "http://localhost:3000/duplicates/detect/$USER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

4. Check for duplicates:
```bash
curl -X GET "http://localhost:3000/duplicates/user/$USER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## Expected Behavior

- **Chunk duplicates**: Should be detected immediately if chunks are >90% similar
- **Document duplicates**: Should be detected if average chunk similarity is >90%
- **Automatic detection**: Runs 5 seconds after document create/update
- **Manual detection**: Can be triggered via API endpoint

## Performance Notes

- Chunk detection: O(n²) where n = number of chunks (uses similarity search)
- Document detection: O(n²) where n = number of documents
- For large document sets, consider batching or running during off-peak hours
