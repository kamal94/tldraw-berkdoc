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
    this.createUsersTable();
    this.createDocumentsTable();
    this.createBoardsTable();
    this.createDocumentDuplicatesTable();
    this.createCollaboratorsTable();
    this.createAvatarCacheTable();
    this.createIndexes();
    this.logger.log('Database tables initialized');
  }

  private createUsersTable() {
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

    this.migrateUsersTable();
  }

  private migrateUsersTable() {
    const userCols = this.db
      .query('PRAGMA table_info(users)')
      .all() as { name: string }[];

    const columnNames = userCols.map((c) => c.name);

    if (!columnNames.includes('google_access_token')) {
      this.db.exec('ALTER TABLE users ADD COLUMN google_access_token TEXT');
    }
    if (!columnNames.includes('google_refresh_token')) {
      this.db.exec('ALTER TABLE users ADD COLUMN google_refresh_token TEXT');
    }
    if (!columnNames.includes('google_token_expiry')) {
      this.db.exec('ALTER TABLE users ADD COLUMN google_token_expiry INTEGER');
    }
  }

  private createDocumentsTable() {
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

    this.migrateDocumentsTable();
  }

  private migrateDocumentsTable() {
    const docCols = this.db
      .query('PRAGMA table_info(documents)')
      .all() as { name: string }[];

    const columnNames = docCols.map((c) => c.name);

    if (!columnNames.includes('google_file_id')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN google_file_id TEXT');
    }
    if (!columnNames.includes('google_modified_time')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN google_modified_time TEXT');
    }
    if (!columnNames.includes('summary')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN summary TEXT');
    }
    if (!columnNames.includes('tags')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN tags TEXT');
    }

    // Migrate dimensions to tags if dimensions column exists
    if (columnNames.includes('dimensions')) {
      this.logger.log('Migrating dimensions to tags...');
      this.db.exec(
        'UPDATE documents SET tags = dimensions WHERE tags IS NULL AND dimensions IS NOT NULL',
      );
    }
  }

  private createBoardsTable() {
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

    this.migrateBoardsTable();
  }

  private migrateBoardsTable() {
    const boardCols = this.db
      .query('PRAGMA table_info(boards)')
      .all() as { name: string }[];

    const columnNames = boardCols.map((c) => c.name);

    if (!columnNames.includes('name')) {
      this.db.exec(
        "ALTER TABLE boards ADD COLUMN name TEXT NOT NULL DEFAULT 'My Board'",
      );
      this.logger.log('Added name column to boards table');
    }
  }

  private createDocumentDuplicatesTable() {
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
  }

  private createCollaboratorsTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collaborators (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        email TEXT,
        name TEXT NOT NULL,
        avatar_url TEXT,
        source TEXT NOT NULL,
        role TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE(document_id, email)
      )
    `);
  }

  private createAvatarCacheTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS avatar_cache (
        hash TEXT PRIMARY KEY,
        content_type TEXT NOT NULL,
        data BLOB NOT NULL,
        original_url TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  private createIndexes() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id);
      CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_documents_google_file_id ON documents(google_file_id);
      CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
      CREATE INDEX IF NOT EXISTS idx_duplicates_user_id ON document_duplicates(user_id);
      CREATE INDEX IF NOT EXISTS idx_duplicates_source_document_id ON document_duplicates(source_document_id);
      CREATE INDEX IF NOT EXISTS idx_duplicates_target_document_id ON document_duplicates(target_document_id);
      CREATE INDEX IF NOT EXISTS idx_collaborators_document_id ON collaborators(document_id);
    `);
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

  findDocumentWithCollaboratorsById(id: string): {
    document: DocumentRow | null;
    collaborators: CollaboratorRow[];
  } {
    // Fetch document and collaborators in a single efficient query using LEFT JOIN
    // This is performant because:
    // 1. We use the primary key index on documents.id
    // 2. We use the index on collaborators.document_id
    // 3. Single query reduces round trips
    const stmt = this.db.prepare(`
      SELECT 
        d.*,
        c.id as collaborator_id,
        c.email as collaborator_email,
        c.name as collaborator_name,
        c.avatar_url as collaborator_avatar_url,
        c.source as collaborator_source,
        c.role as collaborator_role,
        c.created_at as collaborator_created_at,
        c.updated_at as collaborator_updated_at
      FROM documents d
      LEFT JOIN collaborators c ON d.id = c.document_id
      WHERE d.id = ?
      ORDER BY c.name ASC
    `);
    
    const rows = stmt.all(id) as Array<
      DocumentRow & {
        collaborator_id: string | null;
        collaborator_email: string | null;
        collaborator_name: string | null;
        collaborator_avatar_url: string | null;
        collaborator_source: string | null;
        collaborator_role: string | null;
        collaborator_created_at: string | null;
        collaborator_updated_at: string | null;
      }
    >;

    if (rows.length === 0) {
      return { document: null, collaborators: [] };
    }

    // Extract document (same for all rows)
    const firstRow = rows[0];
    const document: DocumentRow = {
      id: firstRow.id,
      title: firstRow.title,
      content: firstRow.content,
      url: firstRow.url,
      source: firstRow.source,
      user_id: firstRow.user_id,
      tags: firstRow.tags,
      google_file_id: firstRow.google_file_id,
      google_modified_time: firstRow.google_modified_time,
      summary: firstRow.summary,
      created_at: firstRow.created_at,
      updated_at: firstRow.updated_at,
    };

    // Extract collaborators (filter out nulls)
    const collaborators: CollaboratorRow[] = rows
      .filter((row) => row.collaborator_id !== null)
      .map((row) => ({
        id: row.collaborator_id!,
        document_id: document.id,
        email: row.collaborator_email,
        name: row.collaborator_name!,
        avatar_url: row.collaborator_avatar_url,
        source: row.collaborator_source!,
        role: row.collaborator_role,
        created_at: row.collaborator_created_at!,
        updated_at: row.collaborator_updated_at!,
      }));

    return { document, collaborators };
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

  // Collaborator operations
  createCollaborator(collaborator: {
    id: string;
    documentId: string;
    email?: string;
    name: string;
    avatarUrl?: string;
    source: string;
    role?: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO collaborators (
        id, document_id, email, name, avatar_url, source, role,
        created_at, updated_at
      )
      VALUES (
        $id, $documentId, $email, $name, $avatarUrl, $source, $role,
        $createdAt, $updatedAt
      )
    `);

    const now = new Date().toISOString();
    stmt.run({
      $id: collaborator.id,
      $documentId: collaborator.documentId,
      $email: collaborator.email || null,
      $name: collaborator.name,
      $avatarUrl: collaborator.avatarUrl || null,
      $source: collaborator.source,
      $role: collaborator.role || null,
      $createdAt: now,
      $updatedAt: now,
    });
  }

  findCollaboratorsByDocumentId(documentId: string): CollaboratorRow[] {
    const stmt = this.db.prepare(
      'SELECT * FROM collaborators WHERE document_id = ? ORDER BY name ASC',
    );
    return stmt.all(documentId) as CollaboratorRow[];
  }

  deleteCollaboratorsByDocumentId(documentId: string) {
    const stmt = this.db.prepare('DELETE FROM collaborators WHERE document_id = ?');
    stmt.run(documentId);
  }

  upsertCollaboratorsForDocument(
    documentId: string,
    collaborators: Array<{
      email?: string;
      name: string;
      avatarUrl?: string;
      source: string;
      role?: string;
    }>,
  ) {
    // Delete existing collaborators for this document
    this.deleteCollaboratorsByDocumentId(documentId);

    // Insert new collaborators
    for (const collaborator of collaborators) {
      const id = `collab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      this.createCollaborator({
        id,
        documentId,
        email: collaborator.email,
        name: collaborator.name,
        avatarUrl: collaborator.avatarUrl,
        source: collaborator.source,
        role: collaborator.role,
      });
    }
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

export interface CollaboratorRow {
  id: string;
  document_id: string;
  email: string | null;
  name: string;
  avatar_url: string | null;
  source: string;
  role: string | null;
  created_at: string;
  updated_at: string;
}

