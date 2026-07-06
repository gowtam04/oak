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
 * first; only then does `writeIndex` apply them in ONE atomic transaction —
 * every table swap (pokemon/learnset/searchable_names/reference_cache) AND the
 * ingest_meta write commit or roll back together, so a crash or a concurrent
 * read never sees a cross-table-inconsistent index. Deletes are SCOPED to the
 * formats built this run (`WHERE format IN (...)`), not "delete everything" —
 * so `npm run ingest -- --formats=X` surgically swaps only X's rows and leaves
 * every other format's rows (and ingest_meta row) untouched. A rebuild is
 * idempotent. Accepted edge: if a format were ever removed from `FORMATS`, its
 * rows would become orphaned (never deleted, never re-read) — a non-issue
 * today with six fixed formats. @pkmn is local, so the old "reuse-last-good on
 * PokeAPI outage" path is gone — there is no upstream.
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
  classic_encounters,
  ingest_meta,
  learnset,
  natdex_machines,
  natdex_moves,
  natdex_species,
  pmd_recruits,
  pokemon,
  reference_cache,
  searchable_names,
  wiki_chunk,
  wiki_page,
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
import {
  buildNatdexSpeciesRows,
  buildNatdexMoveRows,
  type NatdexSpeciesRow,
  type NatdexMoveRow,
} from "./build-natdex";
import { buildMachineRows, type NatdexMachineRow } from "./build-machines";
import {
  buildClassicEncounterRows,
  type ClassicEncounterRow,
} from "./build-classic-encounters";
import { buildPmdRows, type PmdRecruitRow } from "./build-pmd";
import {
  buildWikiRows,
  type WikiChunkRow,
  type WikiPageRow,
} from "./build-wiki";

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
  /** Row counts for the global natdex warehouse tables (built once per run). */
  global: GlobalReport;
  startedAt: number;
  finishedAt: number;
}

export interface RunIngestOptions {
  /** Formats to build. Default: every format in DEFAULT_FORMATS (all eleven). */
  formats?: Format[];
  /** Optional human-readable progress callback. */
  onProgress?: (msg: string) => void;
}

/** The built rows for the GLOBAL natdex warehouse tables (built once per run). */
export interface GlobalRows {
  natdexSpecies: NatdexSpeciesRow[];
  natdexMoves: NatdexMoveRow[];
  machines: NatdexMachineRow[];
  classicEncounters: ClassicEncounterRow[];
  pmd: PmdRecruitRow[];
  /** Fandom wiki corpus (empty unless `.wiki-cache/` was fetched). */
  wikiPages: WikiPageRow[];
  wikiChunks: WikiChunkRow[];
}

/**
 * The built rows for every table `writeIndex` swaps in, one atomic call. The
 * `global` rows (natdex warehouse) are OPTIONAL: they are format-independent and
 * built ONCE per run, so a caller (e.g. the run.test.ts write-phase regression)
 * that only exercises the per-format tables omits them and leaves the global
 * tables untouched.
 */
export interface IndexRows {
  pokemon: PokemonRow[];
  learnsets: LearnsetRow[];
  names: NameRow[];
  references: ReferenceRow[];
  global?: GlobalRows;
}

/** Row counts for the global natdex warehouse tables (evidence / bookkeeping). */
export interface GlobalReport {
  natdexSpecies: number;
  natdexMoves: number;
  machines: number;
  classicEncounters: number;
  pmd: number;
  wikiPages: number;
  wikiChunks: number;
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

/**
 * Replace ALL rows in a GLOBAL (non-format-partitioned) table — delete
 * everything, then chunked insert. Runs inside writeIndex's transaction, so it
 * commits/rolls back atomically with the per-format swaps. Unlike replaceTable
 * the delete is unscoped: these tables have no `format` column (natdex
 * warehouse), so each ingest run rebuilds them wholesale.
 */
async function replaceGlobalTable<TTable extends PgTable>(
  tx: IngestTx,
  table: TTable,
  rows: TTable["$inferInsert"][],
): Promise<void> {
  await tx.delete(table);
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
 * call (DATA-02); a partial-format call (`formats` shorter than all eleven)
 * leaves every other format's rows untouched (DATA-01).
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

    // Global natdex warehouse tables — built once per run, replaced wholesale.
    if (rows.global) {
      report("writing natdex_species…");
      await replaceGlobalTable(tx, natdex_species, rows.global.natdexSpecies);
      report("writing natdex_moves…");
      await replaceGlobalTable(tx, natdex_moves, rows.global.natdexMoves);
      report("writing natdex_machines…");
      await replaceGlobalTable(tx, natdex_machines, rows.global.machines);
      report("writing classic_encounters…");
      await replaceGlobalTable(
        tx,
        classic_encounters,
        rows.global.classicEncounters,
      );
      report("writing pmd_recruits…");
      await replaceGlobalTable(tx, pmd_recruits, rows.global.pmd);
      // Fandom wiki corpus — pages before chunks (logical FK, no constraint).
      report("writing wiki_page…");
      await replaceGlobalTable(tx, wiki_page, rows.global.wikiPages);
      report("writing wiki_chunk…");
      await replaceGlobalTable(tx, wiki_chunk, rows.global.wikiChunks);
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

  // ----- Build the GLOBAL natdex warehouse tables ONCE (not per format) -----
  // These read the committed PokeAPI/PMD snapshots (src/ingest/data/*) via fs and
  // are format-independent, so they are built a single time per run and replaced
  // wholesale inside the same atomic transaction as the per-format tables.
  const wiki = buildWikiRows();
  const global: GlobalRows = {
    natdexSpecies: buildNatdexSpeciesRows(),
    natdexMoves: buildNatdexMoveRows(),
    machines: buildMachineRows(),
    classicEncounters: buildClassicEncounterRows(),
    pmd: buildPmdRows(),
    wikiPages: wiki.pages,
    wikiChunks: wiki.chunks,
  };
  const globalReport: GlobalReport = {
    natdexSpecies: global.natdexSpecies.length,
    natdexMoves: global.natdexMoves.length,
    machines: global.machines.length,
    classicEncounters: global.classicEncounters.length,
    pmd: global.pmd.length,
    wikiPages: global.wikiPages.length,
    wikiChunks: global.wikiChunks.length,
  };
  report(
    `[global] natdex_species: ${globalReport.natdexSpecies}, ` +
      `natdex_moves: ${globalReport.natdexMoves}, ` +
      `machines: ${globalReport.machines}, ` +
      `classic_encounters: ${globalReport.classicEncounters}, ` +
      `pmd_recruits: ${globalReport.pmd}, ` +
      `wiki_page: ${globalReport.wikiPages}, ` +
      `wiki_chunk: ${globalReport.wikiChunks}`,
  );

  // ----- Write phase (one atomic transaction — see writeIndex) -------------
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
        global,
      },
      formatReports,
      formats,
      finishedAt,
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
    global: globalReport,
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
