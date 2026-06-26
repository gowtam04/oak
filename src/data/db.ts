/**
 * better-sqlite3 connection + Drizzle ORM instance — the single SQLite handle
 * for the whole process (design.md § File Structure: src/data/db.ts).
 *
 * Wiring rules (RISK DIRECTIVES + design.md):
 *   - `import "server-only"` so this can never be pulled into a client bundle.
 *   - DEFAULT-import `Database` from better-sqlite3 (it is a CommonJS native
 *     module; `next.config.ts` lists it under top-level serverExternalPackages).
 *   - The connection + Drizzle instance are memoized on `globalThis` so Next's
 *     dev hot-reload / route re-evaluation reuses ONE handle (no fd leak, no
 *     "database is locked" from many WAL writers).
 *   - POKEBOT_DB_PATH is resolved to an ABSOLUTE path relative to this module
 *     (import.meta.url), so it does not depend on process.cwd() — the ingest
 *     CLI, the Next server, and vitest all hit the same file.
 *   - `PRAGMA journal_mode=WAL` for concurrent reader/writer access.
 *   - The drizzle-orm/better-sqlite3 migrator is wired here (idempotent) so the
 *     physical schema always exists before any read; the ingest pipeline writes
 *     rows in-place into these tables.
 *
 * better-sqlite3 is SYNCHRONOUS — nothing here is (or may be) awaited.
 *
 * Repos receive their Drizzle handle via the per-request DbCtx assembled in
 * src/agent/context.ts; they import `db` from here, never construct their own.
 */

import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { env } from "@/env";
import * as schema from "@/data/schema";

/** Drizzle handle typed over the full Pokebot schema. */
export type PokebotDb = BetterSQLite3Database<typeof schema>;

/** The raw synchronous better-sqlite3 connection. */
export type PokebotSqlite = Database.Database;

type DbBundle = {
  sqlite: PokebotSqlite;
  db: PokebotDb;
};

// --- Absolute path resolution (independent of process.cwd) -----------------
// This module lives at <root>/src/data/db.ts, so the project root is two
// directories up. The committed migrations live in <root>/drizzle (the
// drizzle.config.ts `out` folder).
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..", "..");
const MIGRATIONS_DIR = path.resolve(PROJECT_ROOT, "drizzle");

/** Absolute on-disk location of the SQLite index + reference cache. */
export const DB_PATH: string = path.isAbsolute(env.POKEBOT_DB_PATH)
  ? env.POKEBOT_DB_PATH
  : path.resolve(PROJECT_ROOT, env.POKEBOT_DB_PATH);

// --- globalThis memoization ------------------------------------------------
const globalForDb = globalThis as typeof globalThis & {
  __pokebotDb?: DbBundle;
};

function createBundle(): DbBundle {
  // Ensure the parent directory exists — better-sqlite3 creates the file but
  // not intermediate directories (e.g. the gitignored ./data folder).
  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const sqlite = new Database(DB_PATH);
  // WAL: concurrent reads while the ingest pipeline writes; NORMAL sync is the
  // standard safe pairing for WAL.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Apply any pending migrations once at connection time. migrate() is
  // idempotent (drizzle tracks applied hashes in __drizzle_migrations), so a
  // freshly-built DB gets its tables and an already-ingested DB is a no-op.
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  return { sqlite, db };
}

function getBundle(): DbBundle {
  if (!globalForDb.__pokebotDb) {
    globalForDb.__pokebotDb = createBundle();
  }
  return globalForDb.__pokebotDb;
}

/**
 * The memoized Drizzle instance — the sole entry point for SQLite reads/writes.
 * Created lazily on first access and cached on globalThis for the process
 * lifetime.
 */
export const db: PokebotDb = getBundle().db;

/** The underlying raw better-sqlite3 connection (for PRAGMA/transaction use). */
export const sqlite: PokebotSqlite = getBundle().sqlite;

/**
 * Run pending Drizzle migrations against the singleton connection. Safe to call
 * repeatedly (idempotent). Exposed for the ingest CLI to invoke explicitly
 * before building the index; it also runs implicitly when the connection is
 * first created.
 */
export function runMigrations(): void {
  migrate(getBundle().db, { migrationsFolder: MIGRATIONS_DIR });
}
