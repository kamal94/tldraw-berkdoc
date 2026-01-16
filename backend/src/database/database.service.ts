import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { getMimeTypeDisplayName, classifyMimeType } from '../onboarding/mime-types';

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
    this.createOnboardingTable();
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
        metadata_last_extracted TEXT,
        content_last_analyzed TEXT,
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
    if (!columnNames.includes('metadata_last_extracted')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN metadata_last_extracted TEXT');
      this.logger.log('Added metadata_last_extracted column to documents table');
    }
    if (!columnNames.includes('content_last_analyzed')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN content_last_analyzed TEXT');
      this.logger.log('Added content_last_analyzed column to documents table');
    }
    if (!columnNames.includes('mime_type')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN mime_type TEXT');
      this.logger.log('Added mime_type column to documents table');
    }
    if (!columnNames.includes('mime_type_classification')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN mime_type_classification TEXT');
      this.logger.log('Added mime_type_classification column to documents table');
    }
    if (!columnNames.includes('size_bytes')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN size_bytes INTEGER');
      this.logger.log('Added size_bytes column to documents table');
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

  private createOnboardingTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS onboarding (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        
        -- Step 1: OAuth connection
        drive_connected_at TEXT,
        
        -- Step 2: Metadata snapshot
        metadata_scan_started_at TEXT,
        metadata_scan_completed_at TEXT,
        metadata_files_scanned INTEGER DEFAULT 0,
        total_file_count INTEGER,
        total_size_bytes INTEGER,
        folder_count INTEGER,
        supported_file_count INTEGER,
        supported_size_bytes INTEGER,
        unsupported_file_count INTEGER,
        shared_doc_count INTEGER,
        unique_collaborator_count INTEGER,
        review_completed_at TEXT,
        
        -- Step 3: Processing confirmation
        processing_confirmed_at TEXT,
        processing_options TEXT,
        
        -- Step 4: Processing progress
        processing_started_at TEXT,
        processing_completed_at TEXT,
        files_processed INTEGER DEFAULT 0,
        files_total INTEGER DEFAULT 0,
        
        -- Telemetry
        estimated_cost_usd REAL,
        actual_cost_usd REAL,
        
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    this.migrateOnboardingTable();
  }

  private migrateOnboardingTable() {
    const onboardingCols = this.db
      .query('PRAGMA table_info(onboarding)')
      .all() as { name: string }[];

    const columnNames = onboardingCols.map((c) => c.name);

    if (!columnNames.includes('metadata_files_scanned')) {
      this.db.exec('ALTER TABLE onboarding ADD COLUMN metadata_files_scanned INTEGER DEFAULT 0');
      this.logger.log('Added metadata_files_scanned column to onboarding table');
    }
    if (!columnNames.includes('review_completed_at')) {
      this.db.exec('ALTER TABLE onboarding ADD COLUMN review_completed_at TEXT');
      this.logger.log('Added review_completed_at column to onboarding table');
    }
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
      CREATE INDEX IF NOT EXISTS idx_onboarding_user_id ON onboarding(user_id);
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
    const now = new Date().toISOString();
    // Set content_last_analyzed if content is provided (not empty)
    const contentAnalyzed = doc.content && doc.content.trim().length > 0 ? now : null;

    const stmt = this.db.prepare(`
      INSERT INTO documents (
        id, title, content, url, source, user_id, tags,
        google_file_id, google_modified_time, summary,
        content_last_analyzed, created_at, updated_at
      )
      VALUES (
        $id, $title, $content, $url, $source, $userId, $tags,
        $googleFileId, $googleModifiedTime, $summary,
        $contentAnalyzed, $createdAt, $updatedAt
      )
    `);

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
      $contentAnalyzed: contentAnalyzed,
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
      metadata_last_extracted: firstRow.metadata_last_extracted,
      content_last_analyzed: firstRow.content_last_analyzed,
      mime_type: firstRow.mime_type ?? null,
      mime_type_classification: firstRow.mime_type_classification ?? null,
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
    
    // Set content_last_analyzed if content is being updated and is not empty
    const contentAnalyzed = updates.content && updates.content.trim().length > 0 ? now : null;

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
        content_last_analyzed = COALESCE($contentAnalyzed, content_last_analyzed),
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
      $contentAnalyzed: contentAnalyzed,
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

  // Onboarding operations
  createOnboarding(onboarding: { id: string; userId: string; driveConnectedAt?: string }) {
    const stmt = this.db.prepare(`
      INSERT INTO onboarding (id, user_id, drive_connected_at, created_at, updated_at)
      VALUES ($id, $userId, $driveConnectedAt, $createdAt, $updatedAt)
    `);

    const now = new Date().toISOString();
    stmt.run({
      $id: onboarding.id,
      $userId: onboarding.userId,
      $driveConnectedAt: onboarding.driveConnectedAt || now,
      $createdAt: now,
      $updatedAt: now,
    });
  }

  findOnboardingByUserId(userId: string): OnboardingRow | null {
    const stmt = this.db.prepare('SELECT * FROM onboarding WHERE user_id = ?');
    return stmt.get(userId) as OnboardingRow | null;
  }

  findOnboardingById(id: string): OnboardingRow | null {
    const stmt = this.db.prepare('SELECT * FROM onboarding WHERE id = ?');
    return stmt.get(id) as OnboardingRow | null;
  }

  updateOnboarding(
    userId: string,
    updates: {
      driveConnectedAt?: string;
      metadataScanStartedAt?: string;
      metadataScanCompletedAt?: string;
      totalFileCount?: number;
      totalSizeBytes?: number;
      folderCount?: number;
      supportedFileCount?: number;
      supportedSizeBytes?: number;
      unsupportedFileCount?: number;
      sharedDocCount?: number;
      uniqueCollaboratorCount?: number;
      reviewCompletedAt?: string;
      processingConfirmedAt?: string;
      processingOptions?: { prioritizeShared?: boolean; prioritizeRecent?: boolean; skipDrafts?: boolean };
      processingStartedAt?: string;
      processingCompletedAt?: string;
      filesProcessed?: number;
      filesTotal?: number;
      estimatedCostUsd?: number;
      actualCostUsd?: number;
    },
  ) {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE onboarding SET
        drive_connected_at = COALESCE($driveConnectedAt, drive_connected_at),
        metadata_scan_started_at = COALESCE($metadataScanStartedAt, metadata_scan_started_at),
        metadata_scan_completed_at = COALESCE($metadataScanCompletedAt, metadata_scan_completed_at),
        total_file_count = COALESCE($totalFileCount, total_file_count),
        total_size_bytes = COALESCE($totalSizeBytes, total_size_bytes),
        folder_count = COALESCE($folderCount, folder_count),
        supported_file_count = COALESCE($supportedFileCount, supported_file_count),
        supported_size_bytes = COALESCE($supportedSizeBytes, supported_size_bytes),
        unsupported_file_count = COALESCE($unsupportedFileCount, unsupported_file_count),
        shared_doc_count = COALESCE($sharedDocCount, shared_doc_count),
        unique_collaborator_count = COALESCE($uniqueCollaboratorCount, unique_collaborator_count),
        review_completed_at = COALESCE($reviewCompletedAt, review_completed_at),
        processing_confirmed_at = COALESCE($processingConfirmedAt, processing_confirmed_at),
        processing_options = COALESCE($processingOptions, processing_options),
        processing_started_at = COALESCE($processingStartedAt, processing_started_at),
        processing_completed_at = COALESCE($processingCompletedAt, processing_completed_at),
        files_processed = COALESCE($filesProcessed, files_processed),
        files_total = COALESCE($filesTotal, files_total),
        estimated_cost_usd = COALESCE($estimatedCostUsd, estimated_cost_usd),
        actual_cost_usd = COALESCE($actualCostUsd, actual_cost_usd),
        updated_at = $updatedAt
      WHERE user_id = $userId
    `);

    stmt.run({
      $userId: userId,
      $driveConnectedAt: updates.driveConnectedAt ?? null,
      $metadataScanStartedAt: updates.metadataScanStartedAt ?? null,
      $metadataScanCompletedAt: updates.metadataScanCompletedAt ?? null,
      $totalFileCount: updates.totalFileCount ?? null,
      $totalSizeBytes: updates.totalSizeBytes ?? null,
      $folderCount: updates.folderCount ?? null,
      $supportedFileCount: updates.supportedFileCount ?? null,
      $supportedSizeBytes: updates.supportedSizeBytes ?? null,
      $unsupportedFileCount: updates.unsupportedFileCount ?? null,
      $sharedDocCount: updates.sharedDocCount ?? null,
      $uniqueCollaboratorCount: updates.uniqueCollaboratorCount ?? null,
      $reviewCompletedAt: updates.reviewCompletedAt ?? null,
      $processingConfirmedAt: updates.processingConfirmedAt ?? null,
      $processingOptions: updates.processingOptions ? JSON.stringify(updates.processingOptions) : null,
      $processingStartedAt: updates.processingStartedAt ?? null,
      $processingCompletedAt: updates.processingCompletedAt ?? null,
      $filesProcessed: updates.filesProcessed ?? null,
      $filesTotal: updates.filesTotal ?? null,
      $estimatedCostUsd: updates.estimatedCostUsd ?? null,
      $actualCostUsd: updates.actualCostUsd ?? null,
      $updatedAt: now,
    });
  }

  incrementFilesProcessed(userId: string) {
    const now = new Date().toISOString();
    const SMALL_BATCH_THRESHOLD = 10;
    const COMPLETION_PROXIMITY_THRESHOLD = 5;
    const COMPLETION_PERCENT_THRESHOLD = 0.9;
    const AUTO_COMPLETE_PERCENT_THRESHOLD = 0.99;

    const stmt = this.db.prepare(`
      UPDATE onboarding SET
        files_processed = COALESCE(files_processed, 0) + 1,
        processing_completed_at = CASE
          WHEN processing_completed_at IS NULL 
            AND files_total IS NOT NULL
            AND (
              files_total <= ${SMALL_BATCH_THRESHOLD}
              OR COALESCE(files_processed, 0) + 1 >= files_total - ${COMPLETION_PROXIMITY_THRESHOLD}
              OR (COALESCE(files_processed, 0) + 1.0) / NULLIF(files_total, 0) >= ${COMPLETION_PERCENT_THRESHOLD}
            )
            AND (
              COALESCE(files_processed, 0) + 1 >= files_total
              OR (COALESCE(files_processed, 0) + 1.0) / NULLIF(files_total, 0) >= ${AUTO_COMPLETE_PERCENT_THRESHOLD}
            )
          THEN $now
          ELSE processing_completed_at
        END,
        updated_at = $updatedAt
      WHERE user_id = $userId
    `);
    stmt.run({ $userId: userId, $updatedAt: now, $now: now });
  }

  deleteOnboardingByUserId(userId: string) {
    const stmt = this.db.prepare('DELETE FROM onboarding WHERE user_id = ?');
    stmt.run(userId);
  }

  // Document metadata operations (for incremental scan progress)
  upsertDocumentMetadata(file: {
    userId: string;
    googleFileId: string;
    name: string;
    mimeType: string;
    classification?: 'supported' | 'future' | 'ignored';
    sizeBytes?: number;
    modifiedTime?: string;
    shared?: boolean;
    url?: string;
  }) {
    const existing = this.findDocumentByGoogleFileId(file.googleFileId);
    const now = new Date().toISOString();

    if (existing) {
      this.updateDocumentMetadata(file, now);
      return;
    }

    this.createDocumentMetadata(file, now);
  }

  private updateDocumentMetadata(
    file: {
      googleFileId: string;
      name: string;
      mimeType: string;
      classification?: 'supported' | 'future' | 'ignored';
      sizeBytes?: number;
      modifiedTime?: string;
      url?: string;
    },
    timestamp: string,
  ) {
    const stmt = this.db.prepare(`
      UPDATE documents SET
        title = $title,
        url = COALESCE($url, url),
        mime_type = COALESCE($mimeType, mime_type),
        mime_type_classification = COALESCE($classification, mime_type_classification),
        size_bytes = COALESCE($sizeBytes, size_bytes),
        google_modified_time = $modifiedTime,
        metadata_last_extracted = $timestamp,
        updated_at = $updatedAt
      WHERE google_file_id = $googleFileId
    `);
    stmt.run({
      $title: file.name,
      $url: file.url || null,
      $mimeType: file.mimeType || null,
      $classification: file.classification || null,
      $sizeBytes: file.sizeBytes ?? null,
      $modifiedTime: file.modifiedTime || null,
      $timestamp: timestamp,
      $updatedAt: timestamp,
      $googleFileId: file.googleFileId,
    });
  }

  private createDocumentMetadata(
    file: {
      userId: string;
      googleFileId: string;
      name: string;
      mimeType: string;
      classification?: 'supported' | 'future' | 'ignored';
      sizeBytes?: number;
      modifiedTime?: string;
      url?: string;
    },
    timestamp: string,
  ) {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const stmt = this.db.prepare(`
      INSERT INTO documents (
        id, title, content, url, source, user_id, google_file_id, google_modified_time,
        mime_type, mime_type_classification, size_bytes, metadata_last_extracted, created_at, updated_at
      )
      VALUES ($id, $title, $content, $url, $source, $userId, $googleFileId, $modifiedTime, $mimeType, $classification, $sizeBytes, $timestamp, $createdAt, $updatedAt)
    `);

    stmt.run({
      $id: id,
      $title: file.name,
      $content: '',
      $url: file.url || null,
      $source: 'google-drive',
      $userId: file.userId,
      $googleFileId: file.googleFileId,
      $modifiedTime: file.modifiedTime || null,
      $mimeType: file.mimeType || null,
      $classification: file.classification || null,
      $sizeBytes: file.sizeBytes ?? null,
      $timestamp: timestamp,
      $createdAt: timestamp,
      $updatedAt: timestamp,
    });
  }

  countDocumentsWithMetadata(userId: string): number {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND metadata_last_extracted IS NOT NULL',
    );
    const result = stmt.get(userId) as { count: number };
    return result.count;
  }

  /**
   * Compute file type breakdown from documents table for a user
   * Aggregates counts in SQL for efficiency, then merges by display name in JavaScript
   * This ensures that different image formats (image/jpeg, image/png, etc.) are merged into a single "Image" entry
   */
  computeFileTypeBreakdown(userId: string): Record<string, { count: number; sizeBytes: number; displayName: string; classification: 'supported' | 'future' | 'ignored' }> {
    const mimeTypeCounts = this.aggregateMimeTypeCounts(userId);
    const breakdownMap = this.buildBreakdownMap(mimeTypeCounts);
    return this.mapToRecord(breakdownMap);
  }

  private aggregateMimeTypeCounts(userId: string) {
    return this.db
      .prepare(`
        SELECT 
          mime_type,
          mime_type_classification,
          COUNT(*) as count,
          COALESCE(SUM(size_bytes), 0) as total_size_bytes
        FROM documents
        WHERE user_id = ? AND metadata_last_extracted IS NOT NULL AND mime_type IS NOT NULL
        GROUP BY mime_type, mime_type_classification
      `)
      .all(userId) as Array<{
        mime_type: string;
        mime_type_classification: string | null;
        count: number;
        total_size_bytes: number;
      }>;
  }

  private buildBreakdownMap(
    mimeTypeCounts: Array<{
      mime_type: string;
      mime_type_classification: string | null;
      count: number;
      total_size_bytes: number;
    }>,
  ): Map<string, { count: number; sizeBytes: number; displayName: string; classification: 'supported' | 'future' | 'ignored' }> {
    const breakdownMap = new Map<string, { count: number; sizeBytes: number; displayName: string; classification: 'supported' | 'future' | 'ignored' }>();

    for (const row of mimeTypeCounts) {
      const classification = (row.mime_type_classification || classifyMimeType(row.mime_type)) as 'supported' | 'future' | 'ignored';
      const displayName = getMimeTypeDisplayName(row.mime_type);
      const key = `${displayName}|${classification}`;

      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          count: 0,
          sizeBytes: 0,
          displayName,
          classification,
        });
      }

      const entry = breakdownMap.get(key)!;
      entry.count += row.count;
      entry.sizeBytes += row.total_size_bytes;
    }

    return breakdownMap;
  }

  private mapToRecord(
    breakdownMap: Map<string, { count: number; sizeBytes: number; displayName: string; classification: 'supported' | 'future' | 'ignored' }>,
  ): Record<string, { count: number; sizeBytes: number; displayName: string; classification: 'supported' | 'future' | 'ignored' }> {
    const breakdown: Record<string, { count: number; sizeBytes: number; displayName: string; classification: 'supported' | 'future' | 'ignored' }> = {};
    for (const [key, value] of breakdownMap.entries()) {
      breakdown[key] = value;
    }
    return breakdown;
  }

  deleteDocumentsMetadataByUserId(userId: string) {
    // Delete only documents that have metadata but no content analyzed
    const stmt = this.db.prepare(
      'DELETE FROM documents WHERE user_id = ? AND metadata_last_extracted IS NOT NULL AND (content_last_analyzed IS NULL OR content_last_analyzed = "")',
    );
    stmt.run(userId);
  }

  incrementMetadataFilesScanned(userId: string) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE onboarding SET
        metadata_files_scanned = COALESCE(metadata_files_scanned, 0) + 1,
        updated_at = $updatedAt
      WHERE user_id = $userId
    `);
    stmt.run({ $userId: userId, $updatedAt: now });
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
  metadata_last_extracted: string | null;
  content_last_analyzed: string | null;
  mime_type: string | null;
  mime_type_classification: string | null;
  size_bytes: number | null;
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

export interface OnboardingRow {
  id: string;
  user_id: string;
  drive_connected_at: string | null;
  metadata_scan_started_at: string | null;
  metadata_scan_completed_at: string | null;
  metadata_files_scanned: number | null;
  total_file_count: number | null;
  total_size_bytes: number | null;
  folder_count: number | null;
  supported_file_count: number | null;
  supported_size_bytes: number | null;
  unsupported_file_count: number | null;
  shared_doc_count: number | null;
  unique_collaborator_count: number | null;
  review_completed_at: string | null;
  processing_confirmed_at: string | null;
  processing_options: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  files_processed: number | null;
  files_total: number | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  created_at: string;
  updated_at: string;
}

export interface DriveMetadataFileRow {
  id: string;
  user_id: string;
  google_file_id: string;
  name: string;
  mime_type: string;
  size_bytes: number | null;
  modified_time: string | null;
  shared: number;
  created_at: string;
}

