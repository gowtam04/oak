/**
 * src/ingest/run.ts — the `npm run ingest` CLI + `runIngest()` orchestrator.
 *
 * Builds the per-format index (DS-2 pokemon, DS-3 learnset, searchable_names,
 * DS-4 reference_cache) from the @pkmn ecosystem (local packages — no network):
 *
 *     for each format:  loadFormat → build-pokedex → build-learnsets
 *                       → build-names → build-reference
 *
 * then writes one ingest_meta row per format.
 *
 * Build-then-write discipline: ALL formats are built into in-memory arrays
 * first; only then is each table replaced in a single synchronous transaction
 * (DELETE all + chunked INSERT). A rebuild is idempotent. @pkmn is local, so the
 * old "reuse-last-good on PokeAPI outage" path is gone — there is no upstream.
 *
 * Connection ownership: the ingest CLI runs under tsx as its OWN process and
 * does NOT import the `@/data/db` singleton (that module is `server-only`).
 * It opens its own better-sqlite3 + Drizzle handle over the same absolute
 * POKEBOT_DB_PATH and runs the committed migrations before writing.
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
  reference_cache,
  searchable_names,
} from "@/data/schema";
import * as schema from "@/data/schema";
import {
  type Format,
  DEFAULT_FORMATS,
  STANDARD_FORMAT,
  isFormat,
} from "@/data/formats";
import { loadFormat, slugFor } from "@/data/pkmn/gen-provider";
import { logger } from "@/server/logger";
import { env } from "@/env";

import { buildPokedex, type PokemonRow } from "./build-pokedex";
import { buildLearnsetRows, type LearnsetRow } from "./build-learnsets";
import { buildNames, type NameRow } from "./build-names";
import { buildReferenceRows, type ReferenceRow } from "./build-reference";

// ---------------------------------------------------------------------------
// Connection (own handle — db.ts is server-only and unusable under tsx)
// ---------------------------------------------------------------------------

type IngestDb = BetterSQLite3Database<typeof schema>;

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..", "..");
const MIGRATIONS_DIR = path.resolve(PROJECT_ROOT, "drizzle");

const DB_PATH: string = path.isAbsolute(env.POKEBOT_DB_PATH)
  ? env.POKEBOT_DB_PATH
  : path.resolve(PROJECT_ROOT, env.POKEBOT_DB_PATH);

function openIngestDb(): IngestDb {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FormatReport {
  format: Format;
  pokemon: number;
  learnsets: number;
  names: number;
  references: number;
}

export interface IngestReport {
  formats: FormatReport[];
  pokemon: number;
  learnsets: number;
  names: number;
  references: number;
  startedAt: number;
  finishedAt: number;
}

export interface RunIngestOptions {
  /** Formats to build. Default: both ("scarlet-violet", "champions"). */
  formats?: Format[];
  /** Optional human-readable progress callback. */
  onProgress?: (msg: string) => void;
}

const SCHEMA_VERSION = "2";
const INSERT_CHUNK = 500;

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

/** Replace the entire contents of `table` with `rows` in one transaction. */
function replaceTable<TTable extends SQLiteTable>(
  db: IngestDb,
  table: TTable,
  rows: TTable["$inferInsert"][],
): void {
  db.transaction((tx) => {
    tx.delete(table).run();
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      if (chunk.length > 0) tx.insert(table).values(chunk).run();
    }
  });
}

/** Replace all ingest_meta rows with one row per built format. */
function writeIngestMeta(db: IngestDb, reports: FormatReport[], at: number): void {
  db.transaction((tx) => {
    tx.delete(ingest_meta).run();
    for (const r of reports) {
      tx.insert(ingest_meta)
        .values({
          format: r.format,
          last_success_at: at,
          pokemon_count: r.pokemon,
          learnset_count: r.learnsets,
          names_count: r.names,
          schema_version: SCHEMA_VERSION,
        })
        .run();
    }
  });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runIngest(
  opts: RunIngestOptions = {},
): Promise<IngestReport> {
  const startedAt = Date.now();
  const formats = opts.formats ?? [...DEFAULT_FORMATS];
  const report = (msg: string): void => opts.onProgress?.(msg);

  const pokemonRows: PokemonRow[] = [];
  const learnsetRows: LearnsetRow[] = [];
  const nameRows: NameRow[] = [];
  const referenceRows: ReferenceRow[] = [];
  const formatReports: FormatReport[] = [];

  // ----- Build every format into memory ------------------------------------
  for (const format of formats) {
    report(`[${format}] loading @pkmn data…`);
    const source = await loadFormat(format);
    const gen9Only = format === STANDARD_FORMAT;

    // DS-2 Pokédex
    const formatPokemon = buildPokedex(source);
    report(`[${format}] pokedex: ${formatPokemon.length} forms`);

    // Map slug → @pkmn species for learnset lookups.
    const speciesBySlug = new Map(
      source.roster.map((s) => [slugFor(s.id, s.name), s]),
    );
    const moveSlugFor = (moveId: string): string | null => {
      const m = source.dex.moves.get(moveId);
      return m && m.exists ? slugFor(m.id, m.name) : null;
    };

    // DS-3 learnsets (per kept form; fall back to base species for formes).
    let formatLearnsets = 0;
    for (const row of formatPokemon) {
      const s = speciesBySlug.get(row.id);
      if (!s) continue;
      let ls = await source.getLearnset(s.id);
      if (Object.keys(ls).length === 0 && s.baseSpecies && s.baseSpecies !== s.name) {
        const base = source.dex.species.get(s.baseSpecies);
        if (base) ls = await source.getLearnset(base.id);
      }
      const rows = buildLearnsetRows(row.id, ls, moveSlugFor, { format, gen9Only });
      for (const r of rows) learnsetRows.push(r);
      formatLearnsets += rows.length;
    }
    report(`[${format}] learnsets: ${formatLearnsets} rows`);

    // searchable_names + reference
    const formatNames = buildNames(source, formatPokemon);
    const formatRefs = buildReferenceRows(source, startedAt);
    report(`[${format}] names: ${formatNames.length}, references: ${formatRefs.length}`);

    pokemonRows.push(...formatPokemon);
    nameRows.push(...formatNames);
    referenceRows.push(...formatRefs);
    formatReports.push({
      format,
      pokemon: formatPokemon.length,
      learnsets: formatLearnsets,
      names: formatNames.length,
      references: formatRefs.length,
    });
  }

  // ----- Write phase -------------------------------------------------------
  const db = openIngestDb();
  report("writing pokemon…");
  replaceTable(db, pokemon, pokemonRows);
  report("writing learnset…");
  replaceTable(db, learnset, learnsetRows);
  report("writing searchable_names…");
  replaceTable(db, searchable_names, nameRows);
  report("writing reference_cache…");
  replaceTable(db, reference_cache, referenceRows);

  const finishedAt = Date.now();
  writeIngestMeta(db, formatReports, finishedAt);

  return {
    formats: formatReports,
    pokemon: pokemonRows.length,
    learnsets: learnsetRows.length,
    names: nameRows.length,
    references: referenceRows.length,
    startedAt,
    finishedAt,
  };
}

// ---------------------------------------------------------------------------
// CLI entrypoint (`npm run ingest` → tsx src/ingest/run.ts)
// ---------------------------------------------------------------------------

function parseCliOptions(argv: string[]): RunIngestOptions {
  const fmtArg = argv.find((a) => a.startsWith("--formats="));
  const formats = fmtArg
    ? fmtArg
        .slice("--formats=".length)
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is Format => isFormat(s))
    : undefined;
  return formats && formats.length > 0 ? { formats } : {};
}

async function main(): Promise<void> {
  const opts = parseCliOptions(process.argv.slice(2));
  logger.info({ event: "ingest_start", formats: opts.formats }, "starting ingest");

  const result = await runIngest({
    ...opts,
    onProgress: (msg) => logger.info({ event: "ingest_progress" }, msg),
  });

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
