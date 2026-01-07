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
        dimensions TEXT,
        google_file_id TEXT UNIQUE,
        google_modified_time TEXT,
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

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id);
      CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_documents_google_file_id ON documents(google_file_id);
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
    dimensions: string[];
    googleFileId?: string;
    googleModifiedTime?: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO documents (
        id, title, content, url, source, user_id, dimensions,
        google_file_id, google_modified_time, created_at, updated_at
      )
      VALUES (
        $id, $title, $content, $url, $source, $userId, $dimensions,
        $googleFileId, $googleModifiedTime, $createdAt, $updatedAt
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
      $dimensions: JSON.stringify(doc.dimensions),
      $googleFileId: doc.googleFileId || null,
      $googleModifiedTime: doc.googleModifiedTime || null,
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
      dimensions?: string[];
      googleFileId?: string;
      googleModifiedTime?: string;
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
        dimensions = COALESCE($dimensions, dimensions),
        google_file_id = COALESCE($googleFileId, google_file_id),
        google_modified_time = COALESCE($googleModifiedTime, google_modified_time),
        updated_at = $updatedAt
      WHERE id = $id
    `);

    stmt.run({
      $id: id,
      $title: updates.title ?? null,
      $content: updates.content ?? null,
      $url: updates.url ?? null,
      $source: updates.source ?? null,
      $dimensions: updates.dimensions ? JSON.stringify(updates.dimensions) : null,
      $googleFileId: updates.googleFileId ?? null,
      $googleModifiedTime: updates.googleModifiedTime ?? null,
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
  dimensions: string;
  google_file_id: string | null;
  google_modified_time: string | null;
  created_at: string;
  updated_at: string;
}

