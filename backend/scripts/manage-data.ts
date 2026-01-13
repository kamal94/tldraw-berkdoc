import { Database } from 'bun:sqlite';
import weaviate, { Filters } from 'weaviate-client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const DB_PATH = './data/berkdoc.db';
const WEAVIATE_HOST = process.env.WEAVIATE_HOST || 'localhost';
const WEAVIATE_PORT = parseInt(process.env.WEAVIATE_PORT || '8080');
const COLLECTION_NAME = 'DocumentChunk';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Usage:
  bun run scripts/manage-data.ts <command> [args]

Commands:
  list-users            List all users
  list-docs [userId]    List all documents (optionally filtered by userId)
  list-boards [userId]  List all boards (optionally filtered by userId)
  stats                 Show stats for database and Weaviate
  ingest-test <userId>  Ingest some dummy test data
  clear-user <userId>   Delete all documents and chunks for a user
  clear-doc <docId>     Delete a specific document and its chunks
  clear-board <userId>  Delete a board for a specific user
  clear-all             Clear all documents and all chunks from Weaviate
  clear-all-boards      Clear all boards from database
    `);
    return;
  }

  const db = new Database(DB_PATH);
  
  const client = await weaviate.connectToLocal({
    host: WEAVIATE_HOST,
    port: WEAVIATE_PORT,
    grpcPort: 50051,
  });

  try {
    switch (command) {
      case 'list-users':
        listUsers(db);
        break;
      case 'list-docs':
        listDocs(db, args[1]);
        break;
      case 'list-boards':
        listBoards(db, args[1]);
        break;
      case 'stats':
        await showStats(db, client);
        break;
      case 'ingest-test':
        if (!args[1]) throw new Error('userId is required');
        await ingestTestData(db, client, args[1]);
        break;
      case 'clear-user':
        if (!args[1]) throw new Error('userId is required');
        await clearUser(db, client, args[1]);
        break;
      case 'clear-doc':
        if (!args[1]) throw new Error('docId is required');
        await clearDoc(db, client, args[1]);
        break;
      case 'clear-board':
        if (!args[1]) throw new Error('userId is required');
        await clearBoard(db, args[1]);
        break;
      case 'clear-all':
        await clearAll(db, client);
        break;
      case 'clear-all-boards':
        await clearAllBoards(db);
        break;
      default:
        console.error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  } finally {
    db.close();
  }
}

async function showStats(db: Database, client: any) {
  const userCount = db.query('SELECT COUNT(*) as count FROM users').get() as any;
  const docCount = db.query('SELECT COUNT(*) as count FROM documents').get() as any;
  const boardCount = db.query('SELECT COUNT(*) as count FROM boards').get() as any;
  
  console.log('\n--- Database Stats ---');
  console.log(`Users: ${userCount.count}`);
  console.log(`Documents: ${docCount.count}`);
  console.log(`Boards: ${boardCount.count}`);

  console.log('\n--- Weaviate Stats ---');
  try {
    const collections = await client.collections.listAll();
    console.log('Collections:', collections.map((c: any) => c.name).join(', '));

    const collection = client.collections.get(COLLECTION_NAME);
    const result = await collection.aggregate.overAll();
    console.log(`Collection: ${COLLECTION_NAME}`);
    console.log(`Total Objects: ${result.totalCount}`);

    // Let's sample a few objects to see what's in there
    const samples = await collection.query.fetchObjects({ 
      limit: 10,
      returnProperties: ['userId', 'documentId', 'title', 'chunkIndex']
    });
    if (samples.objects.length > 0) {
      console.log('\nSample Objects (first 10):');
      samples.objects.forEach((obj: any, i: number) => {
        console.log(`${i+1}: ID=${obj.uuid}, userId=${obj.properties.userId}, docId=${obj.properties.documentId}, title=${obj.properties.title}`);
      });
    } else {
      console.log('No objects found in Weaviate.');
    }
  } catch (error) {
    console.error('Failed to get Weaviate stats:', error);
  }
}

async function ingestTestData(db: Database, client: any, userId: string) {
  console.log(`Ingesting test data for user ${userId}...`);
  const collection = client.collections.get(COLLECTION_NAME);
  
  for (let i = 0; i < 3; i++) {
    const docId = `test_doc_${i}`;
    const result = await collection.data.insert({
      properties: {
        documentId: docId,
        chunkIndex: 0,
        content: `Test content for ${docId}`,
        title: `Test Doc ${i}`,
        source: 'test',
        userId: userId,
      },
      vectors: Array(384).fill(0).map(() => Math.random()), // Dummy vector
    });
    console.log(`Inserted test chunk for ${docId}: ${result}`);
  }
}

function listUsers(db: Database) {
  const users = db.query('SELECT id, email, name FROM users').all() as any[];
  console.table(users);
}

function listDocs(db: Database, userId?: string) {
  const query = userId 
    ? db.query('SELECT id, title, source, user_id FROM documents WHERE user_id = ?').all(userId)
    : db.query('SELECT id, title, source, user_id FROM documents').all();
  
  console.table(query);
}

function listBoards(db: Database, userId?: string) {
  const query = userId 
    ? db.query('SELECT id, user_id, created_at, updated_at FROM boards WHERE user_id = ?').all(userId)
    : db.query('SELECT id, user_id, created_at, updated_at FROM boards').all();
  
  console.table(query);
}

async function clearUser(db: Database, client: any, userId: string) {
  const docs = db.query('SELECT id FROM documents WHERE user_id = ?').all(userId) as any[];
  
  console.log(`Deleting ${docs.length} documents for user ${userId}...`);
  
  const collection = client.collections.get(COLLECTION_NAME);
  
  // Delete chunks from Weaviate
  const result = await collection.data.deleteMany(
    collection.filter.byProperty('userId').equal(userId)
  );
  console.log("result:", result)
  console.log("result.errors:", result.errors)
  console.log('Cleared chunks from Weaviate.');

  // Delete from DB
  const stmt = db.prepare('DELETE FROM documents WHERE user_id = ?');
  stmt.run(userId);
  console.log('Cleared documents from database.');
}

async function clearDoc(db: Database, client: any, docId: string) {
  const doc = db.query('SELECT user_id FROM documents WHERE id = ?').get(docId) as any;
  if (!doc) {
    console.error(`Document ${docId} not found`);
    return;
  }

  console.log(`Deleting document ${docId}...`);

  const collection = client.collections.get(COLLECTION_NAME);
  
  // Delete chunks from Weaviate
  const result = await collection.data.deleteMany(
    Filters.and(
      collection.filter.byProperty('documentId').equal(docId),
      collection.filter.byProperty('userId').equal(doc.user_id)
    )
  );
  console.log('Weaviate clear-doc result:', result);
  console.log('Cleared chunks from Weaviate.');

  // Delete from DB
  const stmt = db.prepare('DELETE FROM documents WHERE id = ?');
  stmt.run(docId);
  console.log('Cleared document from database.');
}

async function clearBoard(db: Database, userId: string) {
  const board = db.query('SELECT id FROM boards WHERE user_id = ?').get(userId) as any;
  if (!board) {
    console.error(`Board for user ${userId} not found`);
    return;
  }

  console.log(`Deleting board ${board.id} for user ${userId}...`);

  // Delete from DB
  const stmt = db.prepare('DELETE FROM boards WHERE user_id = ?');
  stmt.run(userId);
  console.log('Cleared board from database.');
}

async function clearAllBoards(db: Database) {
  console.log('Clearing ALL boards...');
  
  // Delete all boards from DB
  db.exec('DELETE FROM boards');
  console.log('Cleared all boards from database.');
}

async function clearAll(db: Database, client: any) {
  console.log('Clearing ALL documents and chunks...');
  
  const collection = client.collections.get(COLLECTION_NAME);
  
  // Delete all chunks from Weaviate
  // Using a broad filter that should match everything with a documentId (all our chunks)
  const result = await collection.data.deleteMany(
    collection.filter.byProperty('chunkIndex').greaterThan(-1)
  );
  console.log('Weaviate clear-all result:', result);
  console.log('Cleared all chunks from Weaviate.');

  // Delete all documents from DB
  db.exec('DELETE FROM documents');
  console.log('Cleared all documents from database.');
}

main().catch(console.error);

