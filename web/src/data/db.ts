/**
 * node-postgres connection pool + Drizzle ORM instance — the single Postgres
 * handle for the whole Next server process.
 *
 * Wiring rules (RISK DIRECTIVES + design.md):
 *   - `import "server-only"` so this can never be pulled into a client bundle.
 *   - One `pg.Pool` over DATABASE_URL, wrapped by Drizzle. `next.config.ts`
 *     lists `pg` under top-level serverExternalPackages so Next does not bundle
 *     its optional native bits.
 *   - The pool + Drizzle instance are memoized on `globalThis` so Next's dev
 *     hot-reload / route re-evaluation reuses ONE pool (no connection leak), and
 *     so tests can pre-install a fixture bundle on `globalThis.__oakDb`
 *     before this module is first imported.
 *
 * Unlike the old better-sqlite3 handle, node-postgres is ASYNC. Constructing the
 * pool is synchronous and lazy (it does not connect until the first query), so
 * the `db` export is still a plain synchronous binding — repos that
 * `import { db }` (e.g. resolve-index.ts) keep working. Migrations, however, are
 * async and are NO LONGER run implicitly at module load: apply them out-of-band
 * via `npm run db:migrate`, the ingest CLI, or `runMigrations()` below.
 *
 * Repos receive their Drizzle handle via the per-request DbCtx assembled in
 * src/agent/context.ts; they import `db` from here, never construct their own.
 */

import "server-only";

import path from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { env } from "@/env";
import * as schema from "@/data/schema";

/** Drizzle handle typed over the full Oak schema. */
export type OakDb = NodePgDatabase<typeof schema>;

/** The underlying node-postgres connection pool. */
export type OakPool = Pool;

export type DbBundle = {
  pool: OakPool;
  db: OakDb;
};

// --- Migrations folder (absolute, independent of process.cwd) --------------
// This module lives at <root>/src/data/db.ts, so the project root is two
// directories up. The committed migrations live in <root>/drizzle (the
// drizzle.config.ts `out` folder).
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..", "..");
const MIGRATIONS_DIR = path.resolve(PROJECT_ROOT, "drizzle");

// --- globalThis memoization ------------------------------------------------
const globalForDb = globalThis as typeof globalThis & {
  __oakDb?: DbBundle;
};

function createBundle(): DbBundle {
  // Lazy pool — no socket is opened until the first query. Nothing here is
  // awaited, so the synchronous `db` export below is safe.
  //
  // Explicit bounds (EDGE-02): the default `pg.Pool` has `max: 10` but NO
  // timeouts, so under load a slow/stuck query can hold a connection
  // indefinitely and a burst can pin all connections while callers wait forever.
  // We cap the pool, bound how long a caller waits for a connection, reap idle
  // connections, and cap any single query's server- and client-side duration —
  // so one misbehaving caller can't exhaust the pool for everyone. (The ingest
  // CLI opens its OWN pool in src/ingest/run.ts and is intentionally left
  // uncapped there — its bulk statements are legitimately long.)
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Server-side cap: Postgres aborts a statement running longer than this.
    statement_timeout: 15_000,
    // Client-side cap: node-postgres rejects the query if no result by then.
    query_timeout: 15_000,
  });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

function getBundle(): DbBundle {
  if (!globalForDb.__oakDb) {
    globalForDb.__oakDb = createBundle();
  }
  return globalForDb.__oakDb;
}

/**
 * The memoized Drizzle instance — the sole entry point for Postgres reads/writes
 * in the Next server. Created lazily on first access and cached on globalThis
 * for the process lifetime.
 */
export const db: OakDb = getBundle().db;

/** The underlying node-postgres pool (for direct/raw use, e.g. health checks). */
export const pool: OakPool = getBundle().pool;

/**
 * Apply pending Drizzle migrations against the singleton pool. Safe to call
 * repeatedly (idempotent — drizzle tracks applied hashes in
 * `__drizzle_migrations`). Async because node-postgres migrations are async;
 * unlike the old SQLite handle this is NOT run at module load. Prefer
 * `npm run db:migrate` for the standalone case (it avoids the server-only
 * boundary); this export exists for in-process callers.
 */
export async function runMigrations(): Promise<void> {
  await migrate(getBundle().db, { migrationsFolder: MIGRATIONS_DIR });
}
