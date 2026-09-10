/**
 * src/ingest/run.ts — the `npm run ingest` CLI + `runIngest()` orchestrator.
 *
 * Builds the Champions index (DS-2 pokemon, DS-3 learnset, searchable_names,
 * DS-4 reference_cache) from the @pkmn ecosystem (local packages — no network):
 *
 *     loadFormat(champions) → build-pokedex → build-learnsets
 *                           → build-names → build-reference
 *
 * then writes one ingest_meta row. Champions-first (ADR-4): default formats
 * are Champions only. Other-game warehouse pipelines (wiki / natdex /
 * encounters / PMD / Smogon meta) are gone.
 *
 * Build-then-write discipline: formats are built into in-memory arrays first;
 * only then does `writeIndex` apply them in ONE atomic transaction — every
 * table swap (pokemon/learnset/searchable_names/reference_cache) AND the
 * ingest_meta write commit or roll back together. Deletes are SCOPED to the
 * formats built this run (`WHERE format IN (...)`). A rebuild is idempotent.
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
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
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
  CHAMPIONS_FORMAT,
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

export type IngestDb = NodePgDatabase<typeof schema>;

/** The transaction handle `db.transaction(async (tx) => ...)` hands its callback. */
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
  /** Formats to build. Default: {@link DEFAULT_FORMATS} (Champions only). */
  formats?: Format[];
  /** Optional human-readable progress callback. */
  onProgress?: (msg: string) => void;
}

/**
 * The built rows for every table `writeIndex` swaps in, one atomic call.
 */
export interface IndexRows {
  pokemon: PokemonRow[];
  learnsets: LearnsetRow[];
  names: NameRow[];
  references: ReferenceRow[];
}

const SCHEMA_VERSION = "2";
const INSERT_CHUNK = 500;

// ---------------------------------------------------------------------------
// Write helpers — all run INSIDE writeIndex's single transaction (tx), and all
// delete ONLY the rows for the formats this call is writing (never "delete
// everything") so a partial-format run can't touch other formats' data.
// ---------------------------------------------------------------------------

/** Replace `formats`' rows in `table` with `rows` — scoped delete + chunked insert. */
async function replaceTable<TTable extends PgTable & { format: AnyPgColumn }>(
  tx: IngestTx,
  table: TTable,
  rows: TTable["$inferInsert"][],
  formats: Format[],
): Promise<void> {
  await tx.delete(table).where(inArray(table.format, formats));
  // Chunk inserts well under Postgres' 65535 bind-parameter limit (the widest
  // row, pokemon, has ~22 columns ⇒ ~11k params per 500-row chunk).
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    if (chunk.length > 0) await tx.insert(table).values(chunk);
  }
}

/** Replace `formats`' ingest_meta rows with one fresh row per report. */
async function writeIngestMeta(
  tx: IngestTx,
  reports: FormatReport[],
  formats: Format[],
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

/**
 * Apply a built index to Postgres in ONE atomic transaction: all four table
 * swaps plus the ingest_meta write commit or roll back together, and every
 * delete is scoped to `formats` — the formats actually built this run. A crash
 * or thrown error mid-write leaves the database exactly as it was before the
 * call (DATA-02).
 */
export async function writeIndex(
  db: IngestDb,
  rows: IndexRows,
  reports: FormatReport[],
  formats: Format[],
  finishedAt: number,
  report: (msg: string) => void = () => {},
): Promise<void> {
  await db.transaction(async (tx) => {
    report("writing pokemon…");
    await replaceTable(tx, pokemon, rows.pokemon, formats);
    report("writing learnset…");
    await replaceTable(tx, learnset, rows.learnsets, formats);
    report("writing searchable_names…");
    await replaceTable(tx, searchable_names, rows.names, formats);
    report("writing reference_cache…");
    await replaceTable(tx, reference_cache, rows.references, formats);
    await writeIngestMeta(tx, reports, formats, finishedAt);
  });
}

/** Champions index tables rebuilt by writeIndex (VACUUM cannot run in a txn). */
export const INDEX_VACUUM_TABLES = [
  "pokemon",
  "learnset",
  "searchable_names",
  "reference_cache",
] as const;

/**
 * Recover delete+insert bloat after a successful writeIndex. Must run outside
 * the swap transaction. Table names are a fixed allowlist.
 */
export async function vacuumIndexTables(pool: {
  query: (sql: string) => Promise<unknown>;
}): Promise<void> {
  for (const table of INDEX_VACUUM_TABLES) {
    await pool.query(`VACUUM ANALYZE ${table}`);
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/** Refuse any format other than Champions so gen-7 (etc.) is never written. */
function championsOnlyFormats(requested: Format[] | undefined, via: string): Format[] {
  const formats = requested ?? [...DEFAULT_FORMATS];
  const refused = formats.filter((f) => f !== CHAMPIONS_FORMAT);
  if (refused.length > 0) {
    throw new Error(
      `Champions-only ingest (${via}): refused format(s) ${refused.join(", ")}`,
    );
  }
  return formats.length > 0 ? formats : [...DEFAULT_FORMATS];
}

export async function runIngest(
  opts: RunIngestOptions = {},
): Promise<IngestReport> {
  const startedAt = Date.now();
  const formats = championsOnlyFormats(opts.formats, "runIngest");
  const report = (msg: string): void => opts.onProgress?.(msg);

  const pokemonRows: PokemonRow[] = [];
  const learnsetRows: LearnsetRow[] = [];
  const nameRows: NameRow[] = [];
  const referenceRows: ReferenceRow[] = [];
  const formatReports: FormatReport[] = [];

  for (const format of formats) {
    report(`[${format}] loading @pkmn data…`);
    const source = await loadFormat(format);
    // A mainline format keeps only its own generation's learnset sources; the
    // filter is the format's Dex gen. Champions uses the mod's already-scoped
    // learnset as-is → no gen filter.
    const isChampions = format === CHAMPIONS_FORMAT;
    const genFilter = isChampions ? undefined : source.genNumber;

    const formatPokemon = buildPokedex(source);
    report(`[${format}] pokedex: ${formatPokemon.length} forms`);

    const speciesBySlug = new Map(
      source.roster.map((s) => [slugFor(s.id, s.name), s]),
    );
    const moveSlugFor = (moveId: string): string | null => {
      const m = source.dex.moves.get(moveId);
      return m && m.exists ? slugFor(m.id, m.name) : null;
    };

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

  const { db, pool } = await openIngestDb();
  const finishedAt = Date.now();
  try {
    await writeIndex(
      db,
      {
        pokemon: pokemonRows,
        learnsets: learnsetRows,
        names: nameRows,
        references: referenceRows,
      },
      formatReports,
      formats,
      finishedAt,
      report,
    );
    report("vacuum analyze index tables…");
    await vacuumIndexTables(pool);
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
  if (!fmtArg) return {};
  const tokens = fmtArg
    .slice("--formats=".length)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (tokens.length === 0) return {};
  // isFormat still decodes archived stored rows; ingest itself is Champions-only.
  const refused = tokens.filter((t) => t !== CHAMPIONS_FORMAT);
  if (refused.length > 0) {
    throw new Error(
      `Champions-only ingest: refused --formats value(s) ${refused.join(", ")} (only champions is allowed)`,
    );
  }
  return { formats: tokens.map(() => CHAMPIONS_FORMAT) };
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
