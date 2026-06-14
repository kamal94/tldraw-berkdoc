import { Logger } from '@nestjs/common';
import type { SqlDriver } from './sql-driver';
import { BunSqliteDriver } from './bun-sqlite.driver';
import { D1HttpDriver } from './d1-http.driver';

export type { SqlDriver, SqlParams, SqlPrimitive, SqlRunResult } from './sql-driver';
export { BunSqliteDriver } from './bun-sqlite.driver';
export { D1HttpDriver } from './d1-http.driver';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Selects the SQL driver from the environment:
 * - `DB_DRIVER=d1` (or all `CLOUDFLARE_*` vars present) → Cloudflare D1 over HTTP.
 * - otherwise → local bun:sqlite at `DATABASE_PATH` (default ./data/berkdoc.db).
 *
 * Local development needs no Cloudflare account.
 */
export function createSqlDriver(logger?: Logger): SqlDriver {
  const explicit = (process.env.DB_DRIVER ?? '').toLowerCase();
  const hasD1Env =
    !!process.env.CLOUDFLARE_ACCOUNT_ID &&
    !!process.env.CLOUDFLARE_D1_DATABASE_ID &&
    !!process.env.CLOUDFLARE_API_TOKEN;

  const useD1 = explicit === 'd1' || (explicit === '' && hasD1Env);

  if (useD1) {
    logger?.log('Using Cloudflare D1 (HTTP) database driver');
    return new D1HttpDriver({
      accountId: requireEnv('CLOUDFLARE_ACCOUNT_ID'),
      databaseId: requireEnv('CLOUDFLARE_D1_DATABASE_ID'),
      apiToken: requireEnv('CLOUDFLARE_API_TOKEN'),
    });
  }

  const dbPath = process.env.DATABASE_PATH ?? './data/berkdoc.db';
  logger?.log(`Using bun:sqlite database driver (${dbPath})`);
  return new BunSqliteDriver(dbPath);
}
