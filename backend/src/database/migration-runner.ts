import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { SqlDriver } from './drivers/sql-driver';

/**
 * Applies SQL migration files (in lexical order) that have not yet been
 * recorded in the `_migrations` table. Migration files are expected to be
 * idempotent (`IF NOT EXISTS`) so they are safe even if applied by another
 * mechanism (e.g. `wrangler d1 migrations apply`).
 *
 * Driver-agnostic: works against both bun:sqlite and Cloudflare D1.
 */
export async function runMigrations(
  driver: SqlDriver,
  migrationsDir: string,
  logger: Logger,
): Promise<void> {
  if (!fs.existsSync(migrationsDir)) {
    logger.warn(`Migrations directory not found: ${migrationsDir}`);
    return;
  }

  await driver.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );

  const applied = new Set(
    (await driver.all<{ name: string }>('SELECT name FROM _migrations')).map(
      (row) => row.name,
    ),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await driver.exec(sql);
    await driver.run(
      'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
      [file, new Date().toISOString()],
    );
    logger.log(`Applied migration: ${file}`);
  }
}

export function resolveMigrationsDir(): string {
  return (
    process.env.DB_MIGRATIONS_DIR ?? path.join(process.cwd(), 'migrations')
  );
}
