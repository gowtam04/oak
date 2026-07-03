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
 * first; only then does `writeIngestData` (below) atomically SWAP the rows for
 * exactly the formats being built. Every delete is scoped to `data.formats`
 * (`WHERE format IN (...)`) so `--formats=champions` never touches the other
 * five formats' rows, and the four table replacements + the ingest_meta row
 * happen inside ONE Postgres transaction — a crash mid-write rolls back
 * everything, and a concurrent reader sees either the old index or the new
 * one, never a table-inconsistent mix. A rebuild is idempotent. @pkmn is
 * local, so the old "reuse-last-good on PokeAPI outage" path is gone — there
 * is no upstream.
 *
 * Connection ownership: the ingest CLI runs under tsx as its OWN process and
 * does NOT import the `@/data/db` singleton (that module is `server-only`).
 * It opens its own node-postgres pool + Drizzle handle over DATABASE_URL and
 * runs the committed migrations before writing.
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

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
  CHAMPIONS_FORMAT,
  isFormat,
} from "@/data/formats";
import { loadFormat, slugFor } from "@/data/pkmn/gen-provider";
import { logger } from "@/server/logger";
import { env } from "@/env";

import { buildPokedex, type PokemonRow } from "./build-pokedex";
import { buildLearnsetRows, type LearnsetRow } from "./build-learnsets";
import { buildNames, type NameRow } from "./build-names";
import { buildReferenceRows, type ReferenceRow } from "./build-reference";
import { buildEncounterRows } from "./build-encounters";

// ---------------------------------------------------------------------------
// Connection (own handle — db.ts is server-only and unusable under tsx)
// ---------------------------------------------------------------------------

type IngestDb = NodePgDatabase<typeof schema>;
/**
 * The transaction handle `db.transaction(async (tx) => …)` hands its callback.
 * Extracted structurally (rather than hand-naming `NodePgTransaction<...>`'s
 * generics) so it always matches whatever `IngestDb["transaction"]` actually
 * requires.
 */
type IngestTx = Parameters<Parameters<IngestDb["transaction"]>[0]>[0];

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..", "..");
const MIGRATIONS_DIR = path.resolve(PROJECT_ROOT, "drizzle");

async function openIngestDb(): Promise<{ db: IngestDb; pool: Pool }> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  // Apply the committed migrations before writing so a fresh database (or a
  // fresh docker volume) has its tables. Idempotent.
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, pool };
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
  /** Formats to build. Default: every format in DEFAULT_FORMATS (all six). */
  formats?: Format[];
  /** Optional human-readable progress callback. */
  onProgress?: (msg: string) => void;
}

const SCHEMA_VERSION = "2";
const INSERT_CHUNK = 500;

// ---------------------------------------------------------------------------
// Write helpers — each MUST run inside an already-open transaction (`tx`); the
// caller (writeIngestData, below) owns the one outer `db.transaction(...)`.
// ---------------------------------------------------------------------------

/**
 * Replace `table`'s rows for exactly `formats` with `rows`, inside `tx`.
 * `formatColumn` is that table's `format` column, passed explicitly because
 * `PgTable` doesn't statically expose it (all five index tables happen to
 * have one, but nothing in the `PgTable` type says so). Rows for any format
 * NOT in `formats` are left untouched — this is what makes
 * `--formats=champions` safe to run against a multi-format index.
 */
async function replaceTable<TTable extends PgTable>(
  tx: IngestTx,
  table: TTable,
  formatColumn: AnyPgColumn,
  formats: Format[],
  rows: TTable["$inferInsert"][],
): Promise<void> {
  await tx.delete(table).where(inArray(formatColumn, formats));
  // Chunk inserts well under Postgres' 65535 bind-parameter limit (the widest
  // row, pokemon, has ~22 columns ⇒ ~11k params per 500-row chunk).
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    if (chunk.length > 0) await tx.insert(table).values(chunk);
  }
}

/** Replace the ingest_meta rows for exactly `formats`, inside `tx`. */
async function writeIngestMeta(
  tx: IngestTx,
  formats: Format[],
  reports: FormatReport[],
  at: number,
): Promise<void> {
  await tx.delete(ingest_meta).where(inArray(ingest_meta.format, formats));
  for (const r of reports) {
    await tx.insert(ingest_meta).values({
      format: r.format,
      last_success_at: at,
      pokemon_count: r.pokemon,
      learnset_count: r.learnsets,
      names_count: r.names,
      schema_version: SCHEMA_VERSION,
    });
  }
}

/** Everything `writeIngestData` needs to atomically swap in one ingest run. */
export interface IngestWriteData {
  /** The formats being (re)written — every delete is scoped to exactly these. */
  formats: Format[];
  pokemon: PokemonRow[];
  learnset: LearnsetRow[];
  names: NameRow[];
  references: ReferenceRow[];
  /** One report per format in `formats`, feeding the ingest_meta rows. */
  formatReports: FormatReport[];
  /** Epoch ms recorded as each format's ingest_meta.last_success_at. */
  finishedAt: number;
}

/**
 * Atomically replace the format-scoped contents of pokemon, learnset,
 * searchable_names, reference_cache, AND ingest_meta for `data.formats`, in
 * ONE Postgres transaction. Exported standalone (rather than folded into
 * `runIngest`) so tests can drive the write path directly against a real
 * (Testcontainers) schema with tiny synthetic rows, without running the full
 * @pkmn build.
 */
export async function writeIngestData(
  db: IngestDb,
  data: IngestWriteData,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const report = (msg: string): void => onProgress?.(msg);
  await db.transaction(async (tx) => {
    report("writing pokemon…");
    await replaceTable(tx, pokemon, pokemon.format, data.formats, data.pokemon);
    report("writing learnset…");
    await replaceTable(tx, learnset, learnset.format, data.formats, data.learnset);
    report("writing searchable_names…");
    await replaceTable(
      tx,
      searchable_names,
      searchable_names.format,
      data.formats,
      data.names,
    );
    report("writing reference_cache…");
    await replaceTable(
      tx,
      reference_cache,
      reference_cache.format,
      data.formats,
      data.references,
    );
    report("writing ingest_meta…");
    await writeIngestMeta(tx, data.formats, data.formatReports, data.finishedAt);
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
    // A mainline format keeps only its own generation's learnset sources; the
    // filter is the format's Dex gen (9 for scarlet-violet, else 5–8). Champions
    // uses the mod's already-scoped learnset as-is → no gen filter.
    const isChampions = format === CHAMPIONS_FORMAT;
    const genFilter = isChampions ? undefined : source.genNumber;

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
      const rows = buildLearnsetRows(row.id, ls, moveSlugFor, { format, genFilter });
      for (const r of rows) learnsetRows.push(r);
      formatLearnsets += rows.length;
    }
    report(`[${format}] learnsets: ${formatLearnsets} rows`);

    // searchable_names + reference
    const formatNames = buildNames(source, formatPokemon);
    const formatRefs = buildReferenceRows(source, startedAt);
    // Catch-location / obtain-method data (PokeAPI snapshot) — scarlet-violet
    // ONLY (GS-D4). Appended into the reference rows so they ride the existing
    // reference_cache write. Champions and the mainline gen scopes (gen-5…gen-8)
    // ship no encounter rows: get_encounters reads STANDARD_FORMAT in every
    // mainline mode, and is mode-gated off in Champions.
    if (format === STANDARD_FORMAT) {
      formatRefs.push(...buildEncounterRows(source, startedAt));
    }
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

  // ----- Write phase (one atomic, format-scoped swap) -----------------------
  const { db, pool } = await openIngestDb();
  const finishedAt = Date.now();
  try {
    await writeIngestData(
      db,
      {
        formats,
        pokemon: pokemonRows,
        learnset: learnsetRows,
        names: nameRows,
        references: referenceRows,
        formatReports,
        finishedAt,
      },
      report,
    );
  } finally {
    await pool.end();
  }

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
