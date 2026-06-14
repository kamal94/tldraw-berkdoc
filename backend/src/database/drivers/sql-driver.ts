// Portable async SQL driver abstraction.
//
// Local development uses `BunSqliteDriver` (bun:sqlite, file-based) and the
// Cloudflare deployment uses `D1HttpDriver` (Cloudflare D1 over its REST API).
// Both expose the same async interface so the rest of the backend is unaware of
// which engine is active.

export type SqlPrimitive =
  | string
  | number
  | bigint
  | boolean
  | null
  | Uint8Array;

// Either positional params (matching `?` placeholders) or a named map (matching
// `$name` / `:name` / `@name` placeholders). The D1 driver transpiles named
// params to positional `?` since D1 only supports positional binding.
export type SqlParams = SqlPrimitive[] | Record<string, SqlPrimitive>;

export interface SqlRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqlDriver {
  all<T = Record<string, unknown>>(
    sql: string,
    params?: SqlParams,
  ): Promise<T[]>;
  get<T = Record<string, unknown>>(
    sql: string,
    params?: SqlParams,
  ): Promise<T | null>;
  run(sql: string, params?: SqlParams): Promise<SqlRunResult>;
  // Executes one or more statements with no bound params (DDL / migrations).
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}
