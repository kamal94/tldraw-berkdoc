import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import type {
  SqlDriver,
  SqlParams,
  SqlPrimitive,
  SqlRunResult,
} from './sql-driver';

type BunBindings = Parameters<ReturnType<Database['query']>['all']>;

/**
 * Local development driver backed by bun:sqlite (file-based SQLite).
 * bun:sqlite is synchronous; results are wrapped in resolved promises to match
 * the async {@link SqlDriver} contract.
 */
export class BunSqliteDriver implements SqlDriver {
  private readonly db: Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  private bind(params?: SqlParams): BunBindings {
    if (params === undefined) return [] as unknown as BunBindings;
    if (Array.isArray(params)) {
      return params as unknown as BunBindings;
    }
    return [params] as unknown as BunBindings;
  }

  all<T = Record<string, unknown>>(
    sql: string,
    params?: SqlParams,
  ): Promise<T[]> {
    const rows = this.db.query(sql).all(...this.bind(params)) as T[];
    return Promise.resolve(rows);
  }

  get<T = Record<string, unknown>>(
    sql: string,
    params?: SqlParams,
  ): Promise<T | null> {
    const row = this.db.query(sql).get(...this.bind(params)) as T | null;
    return Promise.resolve(row ?? null);
  }

  run(sql: string, params?: SqlParams): Promise<SqlRunResult> {
    const result = this.db.query(sql).run(...this.bind(params));
    return Promise.resolve({
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    });
  }

  exec(sql: string): Promise<void> {
    this.db.exec(sql);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.db.close();
    return Promise.resolve();
  }
}

// Re-exported for callers that need to construct byte params explicitly.
export type { SqlPrimitive };
