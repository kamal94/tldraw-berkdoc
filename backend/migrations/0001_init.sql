-- Consolidated initial schema for BerkDoc.
-- Captures the full schema previously built incrementally by in-code
-- CREATE TABLE / ALTER TABLE logic. Idempotent so it is safe to re-run and
-- portable across bun:sqlite (local) and Cloudflare D1.

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
);

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
  mime_type TEXT,
  mime_type_classification TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Board',
  snapshot TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

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
);

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
);

CREATE TABLE IF NOT EXISTS avatar_cache (
  hash TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  original_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS onboarding (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  drive_connected_at TEXT,
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
  processing_confirmed_at TEXT,
  processing_options TEXT,
  processing_started_at TEXT,
  processing_completed_at TEXT,
  files_processed INTEGER DEFAULT 0,
  files_total INTEGER DEFAULT 0,
  estimated_cost_usd REAL,
  actual_cost_usd REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

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
