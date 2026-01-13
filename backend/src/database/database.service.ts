import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db!: Database;
  private readonly logger = new Logger(DatabaseService.name);
  private readonly dbPath = './data/berkdoc.db';

  onModuleInit() {
    this.connect();
    this.createTables();
  }

  onModuleDestroy() {
    this.db?.close();
  }

  private connect() {
    // Ensure data directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.logger.log(`Connected to SQLite database: ${this.dbPath}`);
  }

  private createTables() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        avatar_url TEXT,
        provider TEXT NOT NULL DEFAULT 'local',
        provider_id TEXT,
        password_hash TEXT,
        google_access_token TEXT,
        google_refresh_token TEXT,
        google_token_expiry INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Ensure new user columns exist
    const userCols = this.db.query("PRAGMA table_info(users)").all() as { name: string }[];
    if (!userCols.find(c => c.name === 'google_access_token')) {
      this.db.exec("ALTER TABLE users ADD COLUMN google_access_token TEXT");
    }
    if (!userCols.find(c => c.name === 'google_refresh_token')) {
      this.db.exec("ALTER TABLE users ADD COLUMN google_refresh_token TEXT");
    }
    if (!userCols.find(c => c.name === 'google_token_expiry')) {
      this.db.exec("ALTER TABLE users ADD COLUMN google_token_expiry INTEGER");
    }

    // Documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        url TEXT,
        source TEXT NOT NULL,
        user_id TEXT NOT NULL,
        tags TEXT,
        google_file_id TEXT UNIQUE,
        google_modified_time TEXT,
        summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Ensure new document columns exist
    const docCols = this.db.query("PRAGMA table_info(documents)").all() as { name: string }[];
    if (!docCols.find(c => c.name === 'google_file_id')) {
      this.db.exec("ALTER TABLE documents ADD COLUMN google_file_id TEXT");
      // Need to add UNIQUE separately in SQLite if desired, but index can handle it
    }
    if (!docCols.find(c => c.name === 'google_modified_time')) {
      this.db.exec("ALTER TABLE documents ADD COLUMN google_modified_time TEXT");
    }
    if (!docCols.find(c => c.name === 'summary')) {
      this.db.exec("ALTER TABLE documents ADD COLUMN summary TEXT");
    }
    if (!docCols.find(c => c.name === 'tags')) {
      this.db.exec("ALTER TABLE documents ADD COLUMN tags TEXT");
    }
    
    // Migrate dimensions to tags if dimensions column exists
    if (docCols.find(c => c.name === 'dimensions')) {
      this.logger.log('Migrating dimensions to tags...');
      this.db.exec("UPDATE documents SET tags = dimensions WHERE tags IS NULL AND dimensions IS NOT NULL");
      // Note: We keep the dimensions column for backward compatibility but stop using it
    }

    // Boards table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        snapshot TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Ensure name column exists (migration for existing databases)
    const boardCols = this.db.query("PRAGMA table_info(boards)").all() as { name: string }[];
    if (!boardCols.find(c => c.name === 'name')) {
      this.db.exec("ALTER TABLE boards ADD COLUMN name TEXT NOT NULL DEFAULT 'My Board'");
      this.logger.log('Added name column to boards table');
    }

    // Document duplicates table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_duplicates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_document_id TEXT NOT NULL,
        target_document_id TEXT NOT NULL,
        source_chunk_index INTEGER,
        target_chunk_index INTEGER,
        similarity_score REAL NOT NULL,
        duplicate_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (source_document_id) REFERENCES documents(id),
        FOREIGN KEY (target_document_id) REFERENCES documents(id)
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id);
      CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_documents_google_file_id ON documents(google_file_id);
      CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
      CREATE INDEX IF NOT EXISTS idx_duplicates_user_id ON document_duplicates(user_id);
      CREATE INDEX IF NOT EXISTS idx_duplicates_source_document_id ON document_duplicates(source_document_id);
      CREATE INDEX IF NOT EXISTS idx_duplicates_target_document_id ON document_duplicates(target_document_id);
    `);

    this.logger.log('Database tables initialized');
  }

  getDatabase(): Database {
    return this.db;
  }

  // User operations
  createUser(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
    provider: string;
    providerId?: string;
    passwordHash?: string;
    googleAccessToken?: string;
    googleRefreshToken?: string;
    googleTokenExpiry?: number;
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, email, name, avatar_url, provider, provider_id, password_hash,
        google_access_token, google_refresh_token, google_token_expiry,
        created_at, updated_at
      )
      VALUES (
        $id, $email, $name, $avatarUrl, $provider, $providerId, $passwordHash,
        $googleAccessToken, $googleRefreshToken, $googleTokenExpiry,
        $createdAt, $updatedAt
      )
    `);

    const now = new Date().toISOString();
    stmt.run({
      $id: user.id,
      $email: user.email,
      $name: user.name,
      $avatarUrl: user.avatarUrl || null,
      $provider: user.provider,
      $providerId: user.providerId || null,
      $passwordHash: user.passwordHash || null,
      $googleAccessToken: user.googleAccessToken || null,
      $googleRefreshToken: user.googleRefreshToken || null,
      $googleTokenExpiry: user.googleTokenExpiry || null,
      $createdAt: now,
      $updatedAt: now,
    });
  }

  findUserById(id: string): UserRow | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as UserRow | null;
  }

  findUserByEmail(email: string): UserRow | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email) as UserRow | null;
  }

  findUserByProviderId(providerId: string): UserRow | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE provider_id = ?');
    return stmt.get(providerId) as UserRow | null;
  }

  updateUser(
    id: string,
    updates: {
      name?: string;
      avatarUrl?: string;
      provider?: string;
      providerId?: string;
      googleAccessToken?: string;
      googleRefreshToken?: string;
      googleTokenExpiry?: number;
    },
  ) {
    const now = new Date().toISOString();

    // Build update dynamically but execute with full parameter set
    const stmt = this.db.prepare(`
      UPDATE users SET
        name = COALESCE($name, name),
        avatar_url = COALESCE($avatarUrl, avatar_url),
        provider = COALESCE($provider, provider),
        provider_id = COALESCE($providerId, provider_id),
        google_access_token = COALESCE($googleAccessToken, google_access_token),
        google_refresh_token = COALESCE($googleRefreshToken, google_refresh_token),
        google_token_expiry = COALESCE($googleTokenExpiry, google_token_expiry),
        updated_at = $updatedAt
      WHERE id = $id
    `);

    stmt.run({
      $id: id,
      $name: updates.name ?? null,
      $avatarUrl: updates.avatarUrl ?? null,
      $provider: updates.provider ?? null,
      $providerId: updates.providerId ?? null,
      $googleAccessToken: updates.googleAccessToken ?? null,
      $googleRefreshToken: updates.googleRefreshToken ?? null,
      $googleTokenExpiry: updates.googleTokenExpiry ?? null,
      $updatedAt: now,
    });
  }

  // Document operations
  createDocument(doc: {
    id: string;
    title: string;
    content: string;
    url?: string;
    source: string;
    userId: string;
    tags?: string[];
    googleFileId?: string;
    googleModifiedTime?: string;
    summary?: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO documents (
        id, title, content, url, source, user_id, tags,
        google_file_id, google_modified_time, summary, created_at, updated_at
      )
      VALUES (
        $id, $title, $content, $url, $source, $userId, $tags,
        $googleFileId, $googleModifiedTime, $summary, $createdAt, $updatedAt
      )
    `);

    const now = new Date().toISOString();
    stmt.run({
      $id: doc.id,
      $title: doc.title,
      $content: doc.content,
      $url: doc.url || null,
      $source: doc.source,
      $userId: doc.userId,
      $tags: doc.tags ? JSON.stringify(doc.tags) : null,
      $googleFileId: doc.googleFileId || null,
      $googleModifiedTime: doc.googleModifiedTime || null,
      $summary: doc.summary || null,
      $createdAt: now,
      $updatedAt: now,
    });
  }

  findDocumentById(id: string): DocumentRow | null {
    const stmt = this.db.prepare('SELECT * FROM documents WHERE id = ?');
    return stmt.get(id) as DocumentRow | null;
  }

  findDocumentsByUserId(userId: string): DocumentRow[] {
    const stmt = this.db.prepare(
      'SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC',
    );
    return stmt.all(userId) as DocumentRow[];
  }

  findDocumentByGoogleFileId(googleFileId: string): DocumentRow | null {
    const stmt = this.db.prepare('SELECT * FROM documents WHERE google_file_id = ?');
    return stmt.get(googleFileId) as DocumentRow | null;
  }

  updateDocument(
    id: string,
    updates: {
      title?: string;
      content?: string;
      url?: string;
      source?: string;
      tags?: string[];
      googleFileId?: string;
      googleModifiedTime?: string;
      summary?: string;
    },
  ) {
    const now = new Date().toISOString();

    // Build update dynamically but execute with full parameter set
    const stmt = this.db.prepare(`
      UPDATE documents SET
        title = COALESCE($title, title),
        content = COALESCE($content, content),
        url = COALESCE($url, url),
        source = COALESCE($source, source),
        tags = COALESCE($tags, tags),
        google_file_id = COALESCE($googleFileId, google_file_id),
        google_modified_time = COALESCE($googleModifiedTime, google_modified_time),
        summary = COALESCE($summary, summary),
        updated_at = $updatedAt
      WHERE id = $id
    `);

    stmt.run({
      $id: id,
      $title: updates.title ?? null,
      $content: updates.content ?? null,
      $url: updates.url ?? null,
      $source: updates.source ?? null,
      $tags: updates.tags ? JSON.stringify(updates.tags) : null,
      $googleFileId: updates.googleFileId ?? null,
      $googleModifiedTime: updates.googleModifiedTime ?? null,
      $summary: updates.summary ?? null,
      $updatedAt: now,
    });
  }

  deleteDocument(id: string) {
    const stmt = this.db.prepare('DELETE FROM documents WHERE id = ?');
    stmt.run(id);
  }

  deleteDocumentsByUserId(userId: string) {
    const stmt = this.db.prepare('DELETE FROM documents WHERE user_id = ?');
    stmt.run(userId);
  }

  clearAllDocuments() {
    this.db.exec('DELETE FROM documents');
  }

  // Board operations
  createBoard(board: { id: string; userId: string; name?: string; snapshot?: string }) {
    const stmt = this.db.prepare(`
      INSERT INTO boards (id, user_id, name, snapshot, created_at, updated_at)
      VALUES ($id, $userId, $name, $snapshot, $createdAt, $updatedAt)
    `);

    const now = new Date().toISOString();
    stmt.run({
      $id: board.id,
      $userId: board.userId,
      $name: board.name || 'My Board',
      $snapshot: board.snapshot || null,
      $createdAt: now,
      $updatedAt: now,
    });
  }

  findBoardById(id: string): BoardRow | null {
    const stmt = this.db.prepare('SELECT * FROM boards WHERE id = ?');
    return stmt.get(id) as BoardRow | null;
  }

  findBoardByUserId(userId: string): BoardRow | null {
    const stmt = this.db.prepare('SELECT * FROM boards WHERE user_id = ?');
    return stmt.get(userId) as BoardRow | null;
  }

  updateBoardSnapshot(userId: string, snapshot: string) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE boards SET snapshot = $snapshot, updated_at = $updatedAt
      WHERE user_id = $userId
    `);

    stmt.run({
      $userId: userId,
      $snapshot: snapshot,
      $updatedAt: now,
    });
  }

  deleteBoard(id: string) {
    const stmt = this.db.prepare('DELETE FROM boards WHERE id = ?');
    stmt.run(id);
  }

  deleteBoardByUserId(userId: string) {
    const stmt = this.db.prepare('DELETE FROM boards WHERE user_id = ?');
    stmt.run(userId);
  }

  // Document duplicate operations
  createDocumentDuplicate(duplicate: {
    id: string;
    userId: string;
    sourceDocumentId: string;
    targetDocumentId: string;
    sourceChunkIndex?: number;
    targetChunkIndex?: number;
    similarityScore: number;
    duplicateType: 'chunk' | 'document';
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO document_duplicates (
        id, user_id, source_document_id, target_document_id,
        source_chunk_index, target_chunk_index, similarity_score,
        duplicate_type, created_at, updated_at
      )
      VALUES (
        $id, $userId, $sourceDocumentId, $targetDocumentId,
        $sourceChunkIndex, $targetChunkIndex, $similarityScore,
        $duplicateType, $createdAt, $updatedAt
      )
    `);

    const now = new Date().toISOString();
    stmt.run({
      $id: duplicate.id,
      $userId: duplicate.userId,
      $sourceDocumentId: duplicate.sourceDocumentId,
      $targetDocumentId: duplicate.targetDocumentId,
      $sourceChunkIndex: duplicate.sourceChunkIndex ?? null,
      $targetChunkIndex: duplicate.targetChunkIndex ?? null,
      $similarityScore: duplicate.similarityScore,
      $duplicateType: duplicate.duplicateType,
      $createdAt: now,
      $updatedAt: now,
    });
  }

  findDuplicatesByDocumentId(documentId: string): DuplicateRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM document_duplicates
      WHERE source_document_id = ? OR target_document_id = ?
      ORDER BY similarity_score DESC
    `);
    return stmt.all(documentId, documentId) as DuplicateRow[];
  }

  findDuplicatesByUserId(userId: string): DuplicateRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM document_duplicates
      WHERE user_id = ?
      ORDER BY similarity_score DESC
    `);
    return stmt.all(userId) as DuplicateRow[];
  }

  findDuplicateById(id: string): DuplicateRow | null {
    const stmt = this.db.prepare('SELECT * FROM document_duplicates WHERE id = ?');
    return stmt.get(id) as DuplicateRow | null;
  }

  deleteDuplicatesByDocumentId(documentId: string) {
    const stmt = this.db.prepare(`
      DELETE FROM document_duplicates
      WHERE source_document_id = ? OR target_document_id = ?
    `);
    stmt.run(documentId, documentId);
  }

  deleteDuplicatesByUserId(userId: string) {
    const stmt = this.db.prepare('DELETE FROM document_duplicates WHERE user_id = ?');
    stmt.run(userId);
  }

  clearAllDuplicates() {
    this.db.exec('DELETE FROM document_duplicates');
  }
}

// Row types for SQLite results
export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  provider: string;
  provider_id: string | null;
  password_hash: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: number | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  content: string;
  url: string | null;
  source: string;
  user_id: string;
  tags: string | null;
  google_file_id: string | null;
  google_modified_time: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardRow {
  id: string;
  user_id: string;
  name: string;
  snapshot: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuplicateRow {
  id: string;
  user_id: string;
  source_document_id: string;
  target_document_id: string;
  source_chunk_index: number | null;
  target_chunk_index: number | null;
  similarity_score: number;
  duplicate_type: string;
  created_at: string;
  updated_at: string;
}

