/**
 * src/ingest/sync-meta.ts — the `npm run sync:meta` CLI (backlog B-5).
 *
 * The ONE network-fetching DB writer in the codebase: it downloads Smogon's
 * published monthly "chaos" usage stats, transforms them via the pure
 * `build-meta.ts` module, and replaces the `meta_snapshot` + `meta_usage`
 * warehouse tables for each successfully-fetched (meta_format, month) pair. Every
 * other ingest path (`npm run ingest`) stays fully offline — this is the sole
 * exception (see "Data layer — built from @pkmn" in CLAUDE.md).
 *
 * Structural sibling of `run.ts`: it runs under tsx as its OWN process and does
 * NOT import the `server-only` `@/data/db` singleton — it opens its own
 * node-postgres pool + Drizzle handle over DATABASE_URL and applies the committed
 * migrations before writing. The MetaFormat axis (`@/data/meta-formats`) is
 * deliberately separate from the six-scope data Format/AgentMode; each ladder's
 * `smogonFormatId` + `defaultCutoff` builds its chaos URL via `Statistics.url`.
 *
 * Build-then-write discipline (mirrors run.ts): ALL requested pairs are fetched
 * and built into memory first; only then does ONE atomic transaction replace each
 * pair's rows (scoped DELETE by (meta_format, month) + chunked INSERT). A pair
 * that 404s (month not published) is skipped, not fatal; zero successfully-built
 * pairs exits non-zero.
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq } from "drizzle-orm";
import { Statistics } from "smogon";

import * as schema from "@/data/schema";
import { meta_snapshot, meta_usage, searchable_names } from "@/data/schema";
import { STANDARD_FORMAT } from "@/data/formats";
import {
  META_FORMATS,
  META_FORMAT_IDS,
  DEFAULT_META_FORMAT,
  isMetaFormat,
  metaFormatConfig,
  type MetaFormat,
  type MetaFormatConfig,
} from "@/data/meta-formats";
import { logger } from "@/server/logger";
import { env } from "@/env";

import {
  buildMetaRows,
  normalizeName,
  type NameResolver,
  type NameResolverEntry,
  type BuildMetaResult,
  type BuildMetaOpts,
} from "./build-meta";

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
  // Apply the committed migrations before writing so a fresh database has its
  // tables (idempotent) — same discipline as run.ts.
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, pool };
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Polite identifier for Smogon's static file host. */
const SYNC_USER_AGENT = "oak (Pokémon games assistant; github.com/gowtam04)";
/** Per-file network timeout — Smogon chaos files can be several MB. */
const FETCH_TIMEOUT_MS = 30_000;
/** Rows per INSERT chunk (well under Postgres' 65535 bind-param cap). */
const INSERT_CHUNK = 500;
/** Backfill bounds. */
const MIN_BACKFILL = 1;
const MAX_BACKFILL = 24;
/** How far back the index-parse-failed fallback probes for a published month. */
const WALK_BACK_MONTHS = 2;

/** Injectable pacing (real defaults; tests pass 0 to avoid waiting). */
export interface SyncTiming {
  /** Backoff before the single retry on a transport error / 5xx. */
  retryBackoffMs: number;
  /** Minimum spacing between consecutive file fetches (be a good citizen). */
  spacingMs: number;
}

const DEFAULT_TIMING: SyncTiming = { retryBackoffMs: 750, spacingMs: 1000 };

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

export interface CliArgs {
  /** Ladders to sync. Default: every META_FORMATS id. */
  formats: MetaFormat[];
  /** Explicit target month "YYYY-MM"; undefined ⇒ discover the latest published. */
  month?: string;
  /** Sync `backfill` consecutive months ending at the target month. Default 1. */
  backfill: number;
}

/** "YYYY-MM" with a real 01–12 month. */
function isValidMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

function argValue(argv: string[], flag: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1).trim() : undefined;
}

/** Parse `--formats=`, `--month=`, `--backfill=`. Throws on any invalid value. */
export function parseArgs(argv: string[]): CliArgs {
  // --formats=a,b (validated via isMetaFormat; default all)
  const fmtRaw = argValue(argv, "--formats");
  let formats: MetaFormat[];
  if (fmtRaw !== undefined) {
    const parsed = fmtRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const invalid = parsed.filter((s) => !isMetaFormat(s));
    if (invalid.length > 0) {
      throw new Error(
        `--formats: unknown meta format(s) ${invalid.join(", ")}. ` +
          `Known: ${META_FORMAT_IDS.join(", ")}.`,
      );
    }
    formats = parsed.filter(isMetaFormat);
    if (formats.length === 0) {
      throw new Error("--formats listed no known meta formats.");
    }
  } else {
    formats = META_FORMATS.map((f) => f.id);
  }

  // --month=YYYY-MM (validated; default discovered at run time)
  const monthRaw = argValue(argv, "--month");
  let month: string | undefined;
  if (monthRaw !== undefined) {
    if (!isValidMonth(monthRaw)) {
      throw new Error(`--month must be YYYY-MM, got "${monthRaw}".`);
    }
    month = monthRaw;
  }

  // --backfill=N (1–24)
  const backfillRaw = argValue(argv, "--backfill");
  let backfill = 1;
  if (backfillRaw !== undefined) {
    const n = Number(backfillRaw);
    if (!Number.isInteger(n) || n < MIN_BACKFILL || n > MAX_BACKFILL) {
      throw new Error(
        `--backfill must be an integer ${MIN_BACKFILL}–${MAX_BACKFILL}, got "${backfillRaw}".`,
      );
    }
    backfill = n;
  }

  return { formats, month, backfill };
}

// ---------------------------------------------------------------------------
// Month arithmetic
// ---------------------------------------------------------------------------

/** The calendar month (UTC) of `now`, as "YYYY-MM". */
function currentMonth(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Shift a "YYYY-MM" by `delta` months (delta may be negative). */
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map((s) => Number(s));
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The `backfill` consecutive months ending at (and including) `target`, ascending. */
export function monthsEndingAt(target: string, backfill: number): string[] {
  const out: string[] = [];
  for (let i = backfill - 1; i >= 0; i--) out.push(addMonths(target, -i));
  return out;
}

// ---------------------------------------------------------------------------
// Fetch wrapper (User-Agent, 30s timeout, one retry on transport/5xx, 404-aware)
// ---------------------------------------------------------------------------

/** A fetched chaos file: `notFound` ⇒ month unpublished (skip); else the JSON body. */
export type ChaosFetch =
  | { notFound: true }
  | { notFound: false; json: unknown };

/**
 * GET a chaos JSON file. A 404 is returned as `{notFound:true}` (month not
 * published — the caller skips it). A transport error or a 5xx is retried ONCE
 * after a short backoff; a second failure throws. Any other non-2xx throws
 * immediately (a misconfiguration, not worth retrying).
 */
export async function fetchChaos(
  url: string,
  timing: SyncTiming = DEFAULT_TIMING,
): Promise<ChaosFetch> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(timing.retryBackoffMs);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "user-agent": SYNC_USER_AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (e) {
      lastErr = e; // transport error / timeout — retry once
      continue;
    }
    if (res.status === 404) return { notFound: true };
    if (res.status >= 500) {
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
      continue; // server error — retry once
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return { notFound: false, json: (await res.json()) as unknown };
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------------------------------------------------------------------------
// Target-month discovery (index parse → walk-back probe fallback)
// ---------------------------------------------------------------------------

/**
 * Determine the newest published month. First tries Smogon's stats index HTML
 * (`Statistics.latest`); if that fetch fails or the page can't be parsed, walks
 * back from the current calendar month up to {@link WALK_BACK_MONTHS} months,
 * probing each pair's chaos URL and returning the first that isn't a 404.
 */
export async function discoverTargetMonth(
  probeConfig: MetaFormatConfig,
  now: number,
  timing: SyncTiming = DEFAULT_TIMING,
  report: (msg: string) => void = () => {},
): Promise<string> {
  // 1. Parse the published-stats index for the newest YYYY-MM.
  try {
    const res = await fetch(Statistics.URL, {
      headers: { "user-agent": SYNC_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const html = await res.text();
      const latest = Statistics.latest(html); // throws on an unparseable index
      if (isValidMonth(latest)) {
        report(`discovered latest published month from index: ${latest}`);
        return latest;
      }
    }
  } catch {
    // fall through to the walk-back probe
  }

  // 2. Walk back from the current calendar month, probing the chaos file.
  report("stats index unavailable — probing recent months for a published file");
  const base = currentMonth(now);
  for (let back = 0; back <= WALK_BACK_MONTHS; back++) {
    if (back > 0) await sleep(timing.spacingMs);
    const month = addMonths(base, -back);
    const url = Statistics.url(
      month,
      probeConfig.smogonFormatId,
      probeConfig.defaultCutoff,
      "chaos",
    );
    const probe = await fetchChaos(url, timing);
    if (!probe.notFound) {
      report(`probe found a published file for ${month}`);
      return month;
    }
    report(`probe: ${month} not published (404)`);
  }
  throw new Error(
    "could not determine a published month: the stats index was unparseable and " +
      `no chaos file was found for the last ${WALK_BACK_MONTHS + 1} months. ` +
      "Pass --month=YYYY-MM explicitly.",
  );
}

// ---------------------------------------------------------------------------
// Resolver (built ONCE per run from Oak's searchable_names)
// ---------------------------------------------------------------------------

/** searchable_names.kind → the NameResolver bucket it populates ("type" unused). */
const KIND_TO_BUCKET: Record<string, keyof NameResolver> = {
  pokemon: "pokemon",
  move: "moves",
  ability: "abilities",
  item: "items",
};

/**
 * Build the {@link NameResolver} from Oak's `searchable_names` (STANDARD_FORMAT /
 * scarlet-violet). Each entry is keyed by BOTH `normalizeName(display_name)` and
 * `normalizeName(slug)` so a Smogon key matches whether it's a display name or a
 * bare Showdown id.
 */
export async function buildResolver(db: IngestDb): Promise<NameResolver> {
  const rows = await db
    .select({
      kind: searchable_names.kind,
      slug: searchable_names.slug,
      display_name: searchable_names.display_name,
    })
    .from(searchable_names)
    .where(eq(searchable_names.format, STANDARD_FORMAT));

  const resolver: NameResolver = {
    pokemon: new Map<string, NameResolverEntry>(),
    moves: new Map<string, NameResolverEntry>(),
    abilities: new Map<string, NameResolverEntry>(),
    items: new Map<string, NameResolverEntry>(),
  };
  for (const r of rows) {
    const bucket = KIND_TO_BUCKET[r.kind];
    if (!bucket) continue;
    const entry: NameResolverEntry = { slug: r.slug, name: r.display_name };
    resolver[bucket].set(normalizeName(r.display_name), entry);
    resolver[bucket].set(normalizeName(r.slug), entry);
  }
  return resolver;
}

// ---------------------------------------------------------------------------
// Fetch + build every requested (format, month) pair into memory
// ---------------------------------------------------------------------------

/** One successfully fetched-and-built pair, ready to write. */
export interface BuiltPair {
  metaFormat: MetaFormat;
  month: string;
  snapshot: typeof meta_snapshot.$inferInsert;
  usage: Array<typeof meta_usage.$inferInsert>;
}

export interface SyncPairsResult {
  built: BuiltPair[];
  skipped: Array<{ metaFormat: MetaFormat; month: string; reason: string }>;
  /** Raw (deduped-per-pair) build warnings across all pairs. */
  warnings: string[];
}

/** Injectable transform seam (defaults to the real build-meta). */
type BuildRows = (chaos: unknown, opts: BuildMetaOpts) => BuildMetaResult;

interface SyncPairsOpts {
  formats: MetaFormat[];
  months: string[];
  resolver: NameResolver;
  now: number;
  timing?: SyncTiming;
  buildRows?: BuildRows;
  report?: (msg: string) => void;
}

/**
 * Fetch each (format, month) pair's chaos file and transform it. Pairs that 404
 * are skipped (recorded in `skipped`); a build throw propagates (malformed data
 * is a real failure). Spaces consecutive fetches by `timing.spacingMs`.
 */
export async function syncPairs(opts: SyncPairsOpts): Promise<SyncPairsResult> {
  const timing = opts.timing ?? DEFAULT_TIMING;
  const buildRows = opts.buildRows ?? buildMetaRows;
  const report = opts.report ?? (() => {});

  const built: BuiltPair[] = [];
  const skipped: SyncPairsResult["skipped"] = [];
  const warnings: string[] = [];
  let first = true;

  for (const metaFormat of opts.formats) {
    const config = metaFormatConfig(metaFormat);
    for (const month of opts.months) {
      if (!first) await sleep(timing.spacingMs);
      first = false;

      const url = Statistics.url(
        month,
        config.smogonFormatId,
        config.defaultCutoff,
        "chaos",
      );
      report(`[${metaFormat} ${month}] fetching ${url}`);
      const res = await fetchChaos(url, timing);
      if (res.notFound) {
        skipped.push({ metaFormat, month, reason: "not published (404)" });
        report(`[${metaFormat} ${month}] not published — skipping`);
        continue;
      }

      const result = buildRows(res.json, {
        metaFormat,
        month,
        smogonFormatId: config.smogonFormatId,
        cutoff: config.defaultCutoff,
        sourceUrl: url,
        fetchedAt: opts.now,
        resolver: opts.resolver,
      });
      built.push({
        metaFormat,
        month,
        snapshot: result.snapshot,
        usage: result.usage,
      });
      for (const w of result.warnings) warnings.push(w);
      report(
        `[${metaFormat} ${month}] built ${result.usage.length} usage rows, ` +
          `${result.warnings.length} warnings`,
      );
    }
  }

  return { built, skipped, warnings };
}

// ---------------------------------------------------------------------------
// Write phase (ONE atomic transaction — per-pair scoped delete + chunked insert)
// ---------------------------------------------------------------------------

/**
 * Replace each built pair's rows in one atomic transaction: for every
 * (meta_format, month) pair, DELETE its existing snapshot + usage rows, then
 * chunked-INSERT the freshly built ones. A crash mid-write rolls back wholesale;
 * every un-synced pair's rows are untouched.
 */
export async function writeMeta(db: IngestDb, built: BuiltPair[]): Promise<void> {
  if (built.length === 0) return;
  await db.transaction(async (tx: IngestTx) => {
    // Scoped deletes — one per pair (composite (meta_format, month) key).
    for (const pair of built) {
      await tx
        .delete(meta_usage)
        .where(
          and(
            eq(meta_usage.meta_format, pair.metaFormat),
            eq(meta_usage.month, pair.month),
          ),
        );
      await tx
        .delete(meta_snapshot)
        .where(
          and(
            eq(meta_snapshot.meta_format, pair.metaFormat),
            eq(meta_snapshot.month, pair.month),
          ),
        );
    }
    // Inserts — snapshots first, then usage (no physical FK, order is cosmetic).
    // Chunk well under Postgres' 65535 bind-param cap.
    const snapshots = built.map((p) => p.snapshot);
    for (let i = 0; i < snapshots.length; i += INSERT_CHUNK) {
      const chunk = snapshots.slice(i, i + INSERT_CHUNK);
      if (chunk.length > 0) await tx.insert(meta_snapshot).values(chunk);
    }
    const usageRows = built.flatMap((p) => p.usage);
    for (let i = 0; i < usageRows.length; i += INSERT_CHUNK) {
      const chunk = usageRows.slice(i, i + INSERT_CHUNK);
      if (chunk.length > 0) await tx.insert(meta_usage).values(chunk);
    }
  });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface WrittenPair {
  metaFormat: MetaFormat;
  month: string;
  rows: number;
  speciesCount: number;
}

export interface SyncReport {
  target: string;
  months: string[];
  written: WrittenPair[];
  skipped: SyncPairsResult["skipped"];
  /** Deduped build-warning message → occurrence count. */
  warningCounts: Record<string, number>;
}

export interface RunSyncMetaOptions {
  formats: MetaFormat[];
  month?: string;
  backfill?: number;
  /** Injected DB (tests). When absent, opens+migrates its own pool over DATABASE_URL. */
  db?: IngestDb;
  /** Injectable clock for month discovery/arithmetic; defaults to Date.now(). */
  now?: number;
  /** Injectable pacing (tests pass 0s). */
  timing?: SyncTiming;
  /** Injectable transform seam (defaults to the real build-meta). */
  buildRows?: BuildRows;
  onProgress?: (msg: string) => void;
}

/**
 * Full sync: resolve names, determine the month window, fetch+build every
 * requested pair into memory, then write the successfully-built pairs in one
 * atomic transaction. Returns a report; deciding the process exit code (zero
 * built ⇒ non-zero) is the caller's (main's) job.
 */
export async function runSyncMeta(opts: RunSyncMetaOptions): Promise<SyncReport> {
  const now = opts.now ?? Date.now();
  const timing = opts.timing ?? DEFAULT_TIMING;
  const backfill = opts.backfill ?? 1;
  const report = (msg: string): void => opts.onProgress?.(msg);

  let db: IngestDb;
  let ownPool: Pool | null = null;
  if (opts.db) {
    db = opts.db;
  } else {
    const opened = await openIngestDb();
    db = opened.db;
    ownPool = opened.pool;
  }

  try {
    const resolver = await buildResolver(db);

    const probeConfig = metaFormatConfig(opts.formats[0] ?? DEFAULT_META_FORMAT);
    const target =
      opts.month ?? (await discoverTargetMonth(probeConfig, now, timing, report));
    const months = monthsEndingAt(target, backfill);
    report(`target month ${target}; syncing ${months.join(", ")}`);

    const { built, skipped, warnings } = await syncPairs({
      formats: opts.formats,
      months,
      resolver,
      now,
      timing,
      buildRows: opts.buildRows,
      report,
    });

    // Dedup warnings into a message → count summary.
    const warningCounts: Record<string, number> = {};
    for (const w of warnings) warningCounts[w] = (warningCounts[w] ?? 0) + 1;

    if (built.length > 0) await writeMeta(db, built);

    return {
      target,
      months,
      written: built.map((p) => ({
        metaFormat: p.metaFormat,
        month: p.month,
        rows: p.usage.length,
        speciesCount: p.snapshot.species_count,
      })),
      skipped,
      warningCounts,
    };
  } finally {
    if (ownPool) await ownPool.end();
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint (`npm run sync:meta` → tsx src/ingest/sync-meta.ts)
// ---------------------------------------------------------------------------

function formatSummaryTable(report: SyncReport): string {
  const lines = report.written.map(
    (w) =>
      `  ${w.metaFormat.padEnd(10)} ${w.month}  ${String(w.rows).padStart(5)} rows` +
      `  (${w.speciesCount} species)`,
  );
  const skippedLines = report.skipped.map(
    (s) => `  ${s.metaFormat.padEnd(10)} ${s.month}  skipped — ${s.reason}`,
  );
  return [
    "sync:meta summary",
    "  format     month    rows",
    ...lines,
    ...(skippedLines.length ? ["  --- skipped ---", ...skippedLines] : []),
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  logger.info(
    { event: "sync_meta_start", formats: args.formats, month: args.month, backfill: args.backfill },
    "starting meta sync",
  );

  const report = await runSyncMeta({
    ...args,
    onProgress: (msg) => logger.info({ event: "sync_meta_progress" }, msg),
  });

  const warningSummary = Object.entries(report.warningCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([msg, count]) => `${msg} (×${count})`);
  if (warningSummary.length > 0) {
    logger.warn(
      { event: "sync_meta_warnings", count: warningSummary.length },
      `build warnings (deduped): ${warningSummary.join("; ")}`,
    );
  }

  logger.info({ event: "sync_meta_summary" }, formatSummaryTable(report));

  if (report.written.length === 0) {
    logger.error(
      { event: "sync_meta_empty", months: report.months, skipped: report.skipped },
      "no (meta_format, month) pairs were successfully built — nothing written",
    );
    process.exit(1);
  }

  const totalRows = report.written.reduce((n, w) => n + w.rows, 0);
  logger.info(
    {
      event: "sync_meta_done",
      pairs: report.written.length,
      totalRows,
      skipped: report.skipped.length,
    },
    "meta sync complete",
  );
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((e: unknown) => {
    const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
    logger.fatal({ event: "sync_meta_crash", detail }, "sync:meta crashed");
    process.exit(1);
  });
}
