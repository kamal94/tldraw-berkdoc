import { Database } from 'bun:sqlite';
import weaviate, { Filters } from 'weaviate-client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const DB_PATH = './data/berkdoc.db';
const WEAVIATE_HOST = process.env.WEAVIATE_HOST || 'localhost';
const WEAVIATE_PORT = parseInt(process.env.WEAVIATE_PORT || '8080');
const CHUNK_COLLECTION_NAME = 'DocumentChunk';
const DOCUMENT_COLLECTION_NAME = 'Document';

interface DocumentRow {
  id: string;
  title: string;
  source: string;
  user_id: string;
}

/**
 * Compute average vector from multiple chunk vectors
 * Sums all vectors, divides by count, and normalizes
 */
function computeAverageVector(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error('Cannot compute average of empty vector array');
  }

  const dimension = vectors[0].length;
  const sum = new Array(dimension).fill(0);

  // Sum all vectors
  for (const vector of vectors) {
    if (vector.length !== dimension) {
      throw new Error(`Vector dimension mismatch: expected ${dimension}, got ${vector.length}`);
    }
    for (let i = 0; i < dimension; i++) {
      sum[i] += vector[i];
    }
  }

  // Compute average
  const avg = sum.map((val) => val / vectors.length);

  // L2 normalization
  const norm = Math.sqrt(avg.reduce((acc, val) => acc + val * val, 0));
  if (norm > 0) {
    return avg.map((val) => val / norm);
  }

  return avg;
}

/**
 * Extract vector from Weaviate object
 */
function extractVector(obj: any): number[] {
  let vector: number[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vecData = (obj as any).vector;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!vecData) {
    vecData = (obj as any).vectors;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!vecData && (obj as any).vectors) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vecData = (obj as any).vectors.default;
  }

  if (vecData) {
    if (Array.isArray(vecData)) {
      vector = vecData;
    } else if (vecData instanceof Float32Array) {
      vector = Array.from(vecData);
    } else if (typeof vecData === 'object' && 'default' in vecData) {
      const def = vecData.default;
      if (Array.isArray(def)) {
        vector = def;
      } else if (def instanceof Float32Array) {
        vector = Array.from(def);
      }
    } else if (typeof vecData === 'object') {
      const keys = Object.keys(vecData);
      if (keys.length > 0) {
        const firstKey = keys[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val = (vecData as any)[firstKey];
        if (Array.isArray(val)) {
          vector = val;
        } else if (val instanceof Float32Array) {
          vector = Array.from(val);
        }
      }
    }
  }

  return vector;
}

/**
 * Get document chunks with vectors from Weaviate
 */
async function getDocumentChunksWithVectors(
  client: any,
  documentId: string,
  userId: string,
): Promise<Array<{ vector: number[] }>> {
  const collection = client.collections.get(CHUNK_COLLECTION_NAME);
  const result = await collection.query.fetchObjects({
    filters: Filters.and(
      collection.filter.byProperty('documentId').equal(documentId),
      collection.filter.byProperty('userId').equal(userId),
    ),
    includeVector: true,
  });

  return result.objects
    .map((obj: any) => {
      const vector = extractVector(obj);
      return { vector };
    })
    .filter((chunk: { vector: number[] }) => chunk.vector.length > 0);
}

/**
 * Check if document embedding already exists and has a valid vector
 */
async function documentEmbeddingExists(
  client: any,
  documentId: string,
  userId: string,
): Promise<boolean> {
  const collection = client.collections.get(DOCUMENT_COLLECTION_NAME);
  const result = await collection.query.fetchObjects({
    filters: Filters.and(
      collection.filter.byProperty('documentId').equal(documentId),
      collection.filter.byProperty('userId').equal(userId),
    ),
    includeVector: true,
    limit: 1,
  });

  if (result.objects.length === 0) {
    return false;
  }

  // Check if vector is valid (not empty)
  const obj = result.objects[0];
  const vector = extractVector(obj);
  return vector.length > 0;
}

/**
 * Delete document embedding if it exists
 */
async function deleteDocumentEmbedding(
  client: any,
  documentId: string,
  userId: string,
): Promise<void> {
  const collection = client.collections.get(DOCUMENT_COLLECTION_NAME);
  await collection.data.deleteMany(
    Filters.and(
      collection.filter.byProperty('documentId').equal(documentId),
      collection.filter.byProperty('userId').equal(userId),
    ),
  );
}

/**
 * Store document embedding in Weaviate
 */
async function storeDocumentEmbedding(
  client: any,
  documentId: string,
  title: string,
  source: string,
  userId: string,
  vector: number[],
): Promise<void> {
  const collection = client.collections.get(DOCUMENT_COLLECTION_NAME);
  
  // Verify vector is valid
  if (!vector || vector.length === 0) {
    throw new Error(`Cannot store empty vector for document ${documentId}`);
  }

  // Use 'vectors' (plural) - Weaviate v3 client requires 'vectors' not 'vector'
  const result = await collection.data.insert({
    properties: {
      documentId,
      title,
      source,
      userId,
    },
    vectors: vector, // Use 'vectors' (plural) for Weaviate v3 client
  });

  // Verify the vector was stored by reading it back
  const verify = await collection.query.fetchObjects({
    filters: Filters.and(
      collection.filter.byProperty('documentId').equal(documentId),
      collection.filter.byProperty('userId').equal(userId),
    ),
    includeVector: true,
    limit: 1,
  });

  if (verify.objects.length > 0) {
    const storedVector = extractVector(verify.objects[0]);
    if (storedVector.length === 0) {
      throw new Error(`Vector was not stored correctly for document ${documentId} - stored vector is empty`);
    }
    if (storedVector.length !== vector.length) {
      throw new Error(`Vector dimension mismatch: stored ${storedVector.length}, expected ${vector.length}`);
    }
  }
}

/**
 * Backfill document embeddings for a specific user or all users
 */
async function backfillDocumentEmbeddings(userId?: string) {
  console.log('Connecting to database and Weaviate...');
  
  const db = new Database(DB_PATH);
  const client = await weaviate.connectToLocal({
    host: WEAVIATE_HOST,
    port: WEAVIATE_PORT,
    grpcPort: 50051,
  });

  try {
    // Get documents to process
    let documents: DocumentRow[];
    if (userId) {
      documents = db
        .query('SELECT id, title, source, user_id FROM documents WHERE user_id = ?')
        .all(userId) as DocumentRow[];
      console.log(`Found ${documents.length} documents for user ${userId}`);
    } else {
      documents = db
        .query('SELECT id, title, source, user_id FROM documents')
        .all() as DocumentRow[];
      console.log(`Found ${documents.length} documents total`);
    }

    if (documents.length === 0) {
      console.log('No documents found to process.');
      return;
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    console.log('\nStarting backfill process...\n');

    for (const doc of documents) {
      try {
        // Check if embedding already exists with valid vector
        const exists = await documentEmbeddingExists(client, doc.id, doc.user_id);
        if (exists) {
          console.log(`[SKIP] Document ${doc.id} (${doc.title}) - embedding already exists with valid vector`);
          skipped++;
          continue;
        }

        // Delete existing embedding if it exists but has empty vector
        if (!exists) {
          await deleteDocumentEmbedding(client, doc.id, doc.user_id);
        }

        // Get chunks with vectors
        const chunks = await getDocumentChunksWithVectors(client, doc.id, doc.user_id);

        if (chunks.length === 0) {
          console.log(
            `[SKIP] Document ${doc.id} (${doc.title}) - no chunks with vectors found`,
          );
          skipped++;
          continue;
        }

        // Compute average embedding
        const vectors = chunks.map((chunk) => chunk.vector);
        const avgVector = computeAverageVector(vectors);

        // Validate vector before storing
        if (avgVector.length === 0) {
          console.log(
            `[ERROR] Document ${doc.id} (${doc.title}) - computed vector is empty!`,
          );
          errors++;
          continue;
        }

        if (avgVector.length !== 384) {
          console.log(
            `[WARN] Document ${doc.id} (${doc.title}) - vector dimension is ${avgVector.length}, expected 384`,
          );
        }

        // Store document embedding
        await storeDocumentEmbedding(
          client,
          doc.id,
          doc.title,
          doc.source,
          doc.user_id,
          avgVector,
        );

        processed++;
        console.log(
          `[OK] Document ${doc.id} (${doc.title}) - computed from ${chunks.length} chunks`,
        );
      } catch (error) {
        errors++;
        console.error(
          `[ERROR] Document ${doc.id} (${doc.title}) - ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    console.log('\n--- Backfill Summary ---');
    console.log(`Total documents: ${documents.length}`);
    console.log(`Processed: ${processed}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    db.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const userId = args[0]; // Optional userId argument

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  bun run scripts/backfill-document-embeddings.ts [userId]

Description:
  Backfills document embeddings for existing documents by computing the average
  of their chunk embeddings and storing them in the Document collection.

Arguments:
  userId (optional)  - If provided, only backfill embeddings for this user's documents.
                      If omitted, backfill embeddings for all documents.

Examples:
  bun run scripts/backfill-document-embeddings.ts
  bun run scripts/backfill-document-embeddings.ts user123
    `);
    return;
  }

  try {
    await backfillDocumentEmbeddings(userId);
  } catch (error) {
    console.error('Script failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch(console.error);
