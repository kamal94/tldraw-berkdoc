import type { SqlParams, SqlPrimitive } from './sql-driver';

export interface PositionalQuery {
  sql: string;
  args: SqlPrimitive[];
}

const NAMED_TOKEN = /^[$:@]([A-Za-z_][A-Za-z0-9_]*)/;

/**
 * Converts a query that may use named parameters (`$name`, `:name`, `@name`)
 * into one using positional `?` placeholders plus an ordered args array.
 *
 * Positional params are returned unchanged. Named lookups accept keys with or
 * without the sigil (`$id` or `id`). String literals are skipped so tokens
 * inside quotes are never treated as params.
 */
export function toPositional(sql: string, params?: SqlParams): PositionalQuery {
  if (params === undefined) return { sql, args: [] };
  if (Array.isArray(params)) return { sql, args: params };

  const named = params;
  const args: SqlPrimitive[] = [];
  let out = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i++;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === '$' || ch === ':' || ch === '@') {
      const match = NAMED_TOKEN.exec(sql.slice(i));
      if (match) {
        const name = match[1];
        args.push(resolveNamed(named, name, match[0]));
        out += '?';
        i += match[0].length;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return { sql: out, args };
}

function resolveNamed(
  named: Record<string, SqlPrimitive>,
  name: string,
  raw: string,
): SqlPrimitive {
  for (const key of [raw, name, `$${name}`, `:${name}`, `@${name}`]) {
    if (Object.prototype.hasOwnProperty.call(named, key)) return named[key];
  }
  throw new Error(`Missing bind parameter for "${raw}"`);
}

/**
 * Splits a SQL script into individual statements on `;`, ignoring semicolons
 * inside string literals and `--` line comments. Used so the D1 driver (one
 * statement per request) can run multi-statement migration files.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch;
      i++;
      while (i < sql.length) {
        current += sql[i];
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            current += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        current += sql[i];
        i++;
      }
      continue;
    }

    if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}
