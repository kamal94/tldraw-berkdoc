import type {
  BatchQuery,
  SqlDriver,
  SqlParams,
  SqlPrimitive,
  SqlRunResult,
} from './sql-driver';
import { splitSqlStatements, toPositional } from './sql-utils';

export interface D1HttpDriverOptions {
  accountId: string;
  databaseId: string;
  apiToken: string;
  // Override for testing; defaults to the Cloudflare API.
  baseUrl?: string;
}

interface D1QueryResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta: {
    changes?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
  };
}

interface D1ApiResponse {
  result: D1QueryResult[];
  success: boolean;
  errors: { code: number; message: string }[];
}

interface D1BatchApiResponse {
  result: D1QueryResult[];
  success: boolean;
  errors: { code: number; message: string }[];
}

/**
 * Cloudflare D1 driver that talks to the D1 REST API over HTTPS. Used when the
 * NestJS API runs in Cloudflare Containers (which cannot bind D1 natively).
 * Named params are transpiled to positional `?` since D1 only supports
 * positional binding.
 */
export class D1HttpDriver implements SqlDriver {
  private readonly endpoint: string;
  private readonly batchEndpoint: string;

  constructor(private readonly options: D1HttpDriverOptions) {
    const base = options.baseUrl ?? 'https://api.cloudflare.com/client/v4';
    this.endpoint = `${base}/accounts/${options.accountId}/d1/database/${options.databaseId}/query`;
    this.batchEndpoint = `${base}/accounts/${options.accountId}/d1/database/${options.databaseId}/batch`;
  }

  private serializeParam(value: SqlPrimitive): unknown {
    if (value instanceof Uint8Array) return Array.from(value);
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  }

  private async query(sql: string, params?: SqlParams): Promise<D1QueryResult> {
    const { sql: positionalSql, args } = toPositional(sql, params);
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: positionalSql,
        params: args.map((arg) => this.serializeParam(arg)),
      }),
    });

    const body = (await response.json()) as D1ApiResponse;
    if (!response.ok || !body.success) {
      const message =
        body.errors?.map((e) => `${e.code}: ${e.message}`).join('; ') ||
        `HTTP ${response.status}`;
      throw new Error(`D1 query failed: ${message}`);
    }
    return body.result[0];
  }

  async all<T = Record<string, unknown>>(
    sql: string,
    params?: SqlParams,
  ): Promise<T[]> {
    const result = await this.query(sql, params);
    return result.results as T[];
  }

  async get<T = Record<string, unknown>>(
    sql: string,
    params?: SqlParams,
  ): Promise<T | null> {
    const result = await this.query(sql, params);
    return (result.results[0] as T) ?? null;
  }

  async run(sql: string, params?: SqlParams): Promise<SqlRunResult> {
    const result = await this.query(sql, params);
    return {
      changes: result.meta.changes ?? 0,
      lastInsertRowid: result.meta.last_row_id ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    for (const statement of splitSqlStatements(sql)) {
      await this.query(statement);
    }
  }

  async batchRun(queries: BatchQuery[]): Promise<void> {
    if (queries.length === 0) return;
    const requests = queries.map((q) => ({
      sql: q.sql,
      params: q.params.map((p) => this.serializeParam(p)),
    }));
    const response = await fetch(this.batchEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
    const body = (await response.json()) as D1BatchApiResponse;
    if (!response.ok || !body.success) {
      const message =
        body.errors?.map((e) => `${e.code}: ${e.message}`).join('; ') ||
        `HTTP ${response.status}`;
      throw new Error(`D1 batch query failed: ${message}`);
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
