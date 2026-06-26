/**
 * src/ingest/run.ts — the `npm run ingest` CLI + the `runIngest()` orchestrator.
 *
 * Orchestrates the full DS-2/DS-3/DS-4/searchable_names build (design.md Phase 3
 * § Ingest pipeline):
 *
 *     build-pokedex  →  build-learnsets  →  build-names  →  (optional warm-cache)
 *
 * then writes `ingest_meta`.
 *
 * Crawl-then-write discipline (RISK DIRECTIVE — reuse-last-good):
 *   ALL PokeAPI crawling happens FIRST, into in-memory arrays. Only once every
 *   fetch has succeeded do we touch SQLite. Therefore any PokeAPI failure
 *   mid-build aborts before the first write — the previous `pokebot.sqlite`
 *   stays byte-for-byte intact, `runIngest` returns `reusedLastGood = true`, and
 *   the CLI exits non-zero (data-sources.md § Failure behavior; design.md
 *   § Ingest pipeline).
 *
 *   Each table is then (re)built inside its own synchronous better-sqlite3
 *   transaction (DELETE + chunked INSERT) so a rebuild is idempotent: re-running
 *   replaces the prior contents in place and yields identical row counts.
 *
 * Module-boundary rules (design.md Code Conventions):
 *   - PokeAPI is reached ONLY through the injected PokeApiClient singleton.
 *   - better-sqlite3 / Drizzle better-sqlite3 transactions are SYNCHRONOUS —
 *     nothing here awaits a write.
 *
 * Connection ownership: the ingest CLI runs under tsx as its OWN process, so it
 * does NOT import the `@/data/db` singleton — that module is `server-only`
 * (it throws outside the Next/react-server runtime). Instead this module opens
 * its own better-sqlite3 + Drizzle handle over the SAME absolute POKEBOT_DB_PATH
 * (resolved from import.meta.url, independent of cwd) with WAL enabled, and runs
 * the committed migrations before writing. The built `db` handle is injected
 * into warm-cache (which only ever takes `db` as a parameter).
 *
 * `@/` path aliases resolve under tsx (verified); the sibling build modules are
 * imported relatively.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import {
  ingest_meta,
  learnset,
  pokemon,
  searchable_names,
} from "@/data/schema";
import * as schema from "@/data/schema";
import { getPokeApiClient } from "@/data/pokeapi-client";
import { logger } from "@/server/logger";
import { env } from "@/env";

import {
  buildPokedex,
  describePokeApiError,
  isFatalPokeApiError,
} from "./build-pokedex";
import { buildLearnsetRows, type LearnsetRow } from "./build-learnsets";
import { buildNames } from "./build-names";
import { warmCache } from "./warm-cache";

// ---------------------------------------------------------------------------
// Connection (own handle — db.ts is server-only and unusable under tsx)
// ---------------------------------------------------------------------------

type IngestDb = BetterSQLite3Database<typeof schema>;

// This module lives at <root>/src/ingest/run.ts, so the project root is two
// directories up; the committed migrations live in <root>/drizzle.
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..", "..");
const MIGRATIONS_DIR = path.resolve(PROJECT_ROOT, "drizzle");

const DB_PATH: string = path.isAbsolute(env.POKEBOT_DB_PATH)
  ? env.POKEBOT_DB_PATH
  : path.resolve(PROJECT_ROOT, env.POKEBOT_DB_PATH);

/** Open the ingest connection (WAL), apply migrations, return the Drizzle handle. */
function openIngestDb(): IngestDb {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema });
  // Idempotent: a fresh file gets its tables; an already-built DB is a no-op.
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Summary returned by {@link runIngest} (design.md § Interface Definitions).
 * Counts are the rows actually written; on the reuse-last-good path they are 0
 * (nothing was written — the prior DB is untouched).
 */
export interface IngestReport {
  pokemon: number;
  learnsets: number;
  names: number;
  startedAt: number;
  finishedAt: number;
  reusedLastGood: boolean;
}

export interface RunIngestOptions {
  /**
   * Gen-9 version-group slugs that define learnset legality + Gen-9 nativeness.
   * Default: ["scarlet-violet"] (the sole Gen-9 version group in PokeAPI; DLC
   * moves are filed under it). Append DLC groups here if PokeAPI ever splits
   * them out.
   */
  versionGroups?: string[];
  /**
   * Eagerly populate reference_cache after the index build (BR-8). Default
   * false — reference detail is fetched lazily on first runtime miss instead.
   */
  warmCache?: boolean;
  /** Optional human-readable progress callback (CLI feedback / tests). */
  onProgress?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default Gen-9 version groups (see RunIngestOptions.versionGroups). */
export const DEFAULT_GEN9_VERSION_GROUPS: readonly string[] = [
  "scarlet-violet",
];

/**
 * Physical-schema version stamped into ingest_meta. Bump when the SQLite schema
 * changes so the app can detect a stale index and degrade to index_unavailable.
 */
const SCHEMA_VERSION = "1";

/**
 * Rows per INSERT. better-sqlite3 bundles SQLite with a 32 766 bound-parameter
 * limit; the widest table (pokemon, ~24 columns) stays well under it at 500
 * rows/insert, and learnset (4 columns) is trivially safe.
 */
const INSERT_CHUNK = 500;

// ---------------------------------------------------------------------------
// Write helpers (synchronous — better-sqlite3 transactions)
// ---------------------------------------------------------------------------

/**
 * Replace the entire contents of `table` with `rows`, inside ONE synchronous
 * transaction: DELETE everything, then chunked INSERT. Idempotent — re-running
 * yields identical contents. Throws (rolling back) on any write error.
 */
function replaceTable<TTable extends SQLiteTable>(
  db: IngestDb,
  table: TTable,
  rows: TTable["$inferInsert"][],
): void {
  db.transaction((tx) => {
    tx.delete(table).run();
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      if (chunk.length > 0) {
        tx.insert(table).values(chunk).run();
      }
    }
  });
}

/** Upsert the single ingest_meta bookkeeping row, in its own transaction. */
function writeIngestMeta(
  db: IngestDb,
  meta: {
    last_success_at: number;
    version_groups: string[];
    pokemon_count: number;
    learnset_count: number;
    names_count: number;
  },
): void {
  db.transaction((tx) => {
    tx.insert(ingest_meta)
      .values({
        id: "singleton",
        last_success_at: meta.last_success_at,
        version_groups: JSON.stringify(meta.version_groups),
        pokemon_count: meta.pokemon_count,
        learnset_count: meta.learnset_count,
        names_count: meta.names_count,
        schema_version: SCHEMA_VERSION,
      })
      .onConflictDoUpdate({
        target: ingest_meta.id,
        set: {
          last_success_at: meta.last_success_at,
          version_groups: JSON.stringify(meta.version_groups),
          pokemon_count: meta.pokemon_count,
          learnset_count: meta.learnset_count,
          names_count: meta.names_count,
          schema_version: SCHEMA_VERSION,
        },
      })
      .run();
  });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Build the full Pokebot index from PokeAPI and write it to `pokebot.sqlite`.
 *
 * On any PokeAPI failure during the crawl, NO write occurs — the prior DB is
 * left intact and the returned report has `reusedLastGood = true`. The CLI
 * wrapper turns that into a non-zero exit.
 */
export async function runIngest(
  opts: RunIngestOptions = {},
): Promise<IngestReport> {
  const startedAt = Date.now();
  const versionGroups = opts.versionGroups ?? [...DEFAULT_GEN9_VERSION_GROUPS];
  const wantWarmCache = opts.warmCache ?? false;
  const report = (msg: string): void => opts.onProgress?.(msg);

  const client = getPokeApiClient();

  // ----- Phase A/B/C: crawl EVERYTHING into memory before any write ---------
  let pokemonRows: Awaited<ReturnType<typeof buildPokedex>>;
  const learnsetRows: LearnsetRow[] = [];
  let nameRows: Awaited<ReturnType<typeof buildNames>>;

  try {
    // A — DS-2 Pokédex index (crawls species → forms; throws on list failure).
    report("build-pokedex: crawling species…");
    pokemonRows = await buildPokedex(
      client,
      { gen9VersionGroups: versionGroups },
      (done, total) => {
        if (done % 100 === 0 || done === total) {
          report(`build-pokedex: ${done}/${total} species`);
        }
      },
    );
    report(`build-pokedex: ${pokemonRows.length} forms`);

    // B — DS-3 learnsets. build-learnsets exposes a per-Pokémon transform, so
    // the crawl is orchestrated here: re-fetch each indexed form's /pokemon
    // resource and derive its Gen-9 learnset rows. Any fetch failure aborts the
    // whole run (reuse-last-good).
    const total = pokemonRows.length;
    for (let i = 0; i < total; i++) {
      const row = pokemonRows[i]!;
      const res = await client.get(`pokemon/${row.id}`);
      if (!res.ok) {
        // RISK DIRECTIVE — reuse-last-good: a fatal upstream error (network, or
        // a retryable 429/5xx that exhausted retries — i.e. a sustained PokeAPI
        // outage) MUST abort the crawl before any write so the last-good DB
        // stays intact. Re-throw here; the surrounding try/catch turns it into
        // reusedLastGood = true. Only a genuine 404 is skipped (rare forms that
        // were indexed from /pokemon-species but lack a /pokemon resource).
        if (isFatalPokeApiError(res.error)) {
          throw new Error(
            `build-learnsets: fatal PokeAPI error fetching pokemon/${row.id} — ${describePokeApiError(res.error)}`,
          );
        }
        logger.warn(
          { event: "ingest_learnset_skip", id: row.id, code: res.error.code },
          `build-learnsets: skipping pokemon/${row.id} (${res.error.code}) — no learnset data`,
        );
        continue;
      }
      const rows = buildLearnsetRows(res.value, {
        gen9VersionGroups: versionGroups,
      });
      for (const r of rows) learnsetRows.push(r);
      if ((i + 1) % 100 === 0 || i + 1 === total) {
        report(`build-learnsets: ${i + 1}/${total} forms`);
      }
    }
    report(`build-learnsets: ${learnsetRows.length} rows`);

    // C — searchable_names (Pokémon from DS-2 + move/ability/type/item lists).
    report("build-names: fetching name lists…");
    nameRows = await buildNames(pokemonRows, client);
    report(`build-names: ${nameRows.length} rows`);
  } catch (e) {
    // PokeAPI failure mid-build → keep the previous DB intact, write nothing.
    const detail = e instanceof Error ? e.message : String(e);
    logger.error(
      { event: "ingest_aborted", detail },
      "ingest aborted; reusing last-good index",
    );
    report(`aborted: ${detail}`);
    return {
      pokemon: 0,
      learnsets: 0,
      names: 0,
      startedAt,
      finishedAt: Date.now(),
      reusedLastGood: true,
    };
  }

  // ----- Write phase: every table replaced in its own transaction ----------
  const db = openIngestDb();
  report("writing pokemon…");
  replaceTable(db, pokemon, pokemonRows);
  report("writing learnset…");
  replaceTable(db, learnset, learnsetRows);
  report("writing searchable_names…");
  replaceTable(db, searchable_names, nameRows);

  const finishedAt = Date.now();
  writeIngestMeta(db, {
    last_success_at: finishedAt,
    version_groups: versionGroups,
    pokemon_count: pokemonRows.length,
    learnset_count: learnsetRows.length,
    names_count: nameRows.length,
  });

  // ----- Optional eager reference-cache warm (off by default) ---------------
  if (wantWarmCache) {
    report("warm-cache: populating reference_cache…");
    const warm = await warmCache({
      db,
      client,
      onProgress: (msg) => report(`warm-cache: ${msg}`),
    });
    report(
      `warm-cache: stored=${warm.stored} skipped=${warm.skipped} ` +
        `failed=${warm.failed}`,
    );
  }

  return {
    pokemon: pokemonRows.length,
    learnsets: learnsetRows.length,
    names: nameRows.length,
    startedAt,
    finishedAt,
    reusedLastGood: false,
  };
}

// ---------------------------------------------------------------------------
// CLI entrypoint (`npm run ingest` → tsx src/ingest/run.ts)
// ---------------------------------------------------------------------------

/** Parse the handful of supported CLI flags. */
function parseCliOptions(argv: string[]): RunIngestOptions {
  const warmCacheFlag =
    argv.includes("--warm-cache") || argv.includes("--warm");
  const vgArg = argv.find((a) => a.startsWith("--version-groups="));
  const versionGroups = vgArg
    ? vgArg
        .slice("--version-groups=".length)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : undefined;
  return {
    warmCache: warmCacheFlag,
    ...(versionGroups && versionGroups.length > 0 ? { versionGroups } : {}),
  };
}

async function main(): Promise<void> {
  const opts = parseCliOptions(process.argv.slice(2));
  logger.info(
    { event: "ingest_start", warmCache: opts.warmCache ?? false },
    "starting ingest",
  );

  const result = await runIngest({
    ...opts,
    onProgress: (msg) => logger.info({ event: "ingest_progress" }, msg),
  });

  if (result.reusedLastGood) {
    logger.error(
      { event: "ingest_done", ...result },
      "ingest failed mid-build; previous index reused, no changes written",
    );
    process.exit(1);
  }

  logger.info(
    {
      event: "ingest_done",
      ...result,
      durationMs: result.finishedAt - result.startedAt,
    },
    "ingest complete",
  );
  process.exit(0);
}

// Run only when executed directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((e: unknown) => {
    const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
    logger.fatal({ event: "ingest_crash", detail }, "ingest crashed");
    process.exit(1);
  });
}
