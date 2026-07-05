/**
 * Tests for the `npm run sync:meta` CLI (src/ingest/sync-meta.ts).
 *
 * Two layers:
 *   - Unit (fetch stubbed, `buildRows` injected): URL construction, latest-month
 *     discovery via the stats index, the walk-back probe fallback when the index
 *     can't be parsed, a 404 chaos file skipped mid-run, and the single retry on
 *     a 5xx. None of these touch the DB or depend on build-meta's transform math.
 *   - DB write (real Testcontainers schema, REAL build-meta, the committed chaos
 *     fixture as the fetch body): one month writes the expected rows; a re-run is
 *     an idempotent replace; a second month coexists.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { meta_snapshot, meta_usage } from "@/data/schema";
import type { BuildMetaOpts, BuildMetaResult, NameResolver } from "./build-meta";
import {
  parseArgs,
  monthsEndingAt,
  discoverTargetMonth,
  syncPairs,
  runSyncMeta,
  type SyncTiming,
  type IngestDb,
} from "./sync-meta";
import { metaFormatConfig } from "@/data/meta-formats";
import { createPgSchema, type PgFixture } from "../../test/support/pg";

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "test",
  "fixtures",
  "meta-chaos-sample.json",
);
const CHAOS_FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as unknown;
const FIXTURE_SPECIES_COUNT = Object.keys(
  (CHAOS_FIXTURE as { data: Record<string, unknown> }).data,
).length;

const NO_WAIT: SyncTiming = { retryBackoffMs: 0, spacingMs: 0 };
const GEN9OU_2026_06_URL =
  "https://www.smogon.com/stats/2026-06/chaos/gen9ou-1695.json";

function emptyResolver(): NameResolver {
  return {
    pokemon: new Map(),
    moves: new Map(),
    abilities: new Map(),
    items: new Map(),
  };
}

/** A `buildRows` seam that ignores the chaos body — unit tests don't exercise the transform. */
function fakeBuild(chaos: unknown, opts: BuildMetaOpts): BuildMetaResult {
  return {
    snapshot: {
      meta_format: opts.metaFormat,
      month: opts.month,
      smogon_format_id: opts.smogonFormatId,
      cutoff: opts.cutoff,
      total_battles: 1,
      species_count: 1,
      fetched_at: opts.fetchedAt,
      source_url: opts.sourceUrl,
    },
    usage: [
      {
        meta_format: opts.metaFormat,
        month: opts.month,
        species: "kingambit",
        display_name: "Kingambit",
        rank: 1,
        usage_pct: 42,
        raw_count: 10,
        moves: "[]",
        items: "[]",
        abilities: "[]",
        spreads: "[]",
        teammates: "[]",
        counters: "[]",
      },
    ],
    warnings: [],
  };
}

// --- Response mock factories -----------------------------------------------

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}
function okText(text: string): Response {
  return { ok: true, status: 200, text: async () => text } as unknown as Response;
}
function status(code: number): Response {
  return {
    ok: code >= 200 && code < 300,
    status: code,
    json: async () => ({}),
    text: async () => "",
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
function installFetch(handler: (url: string) => Response | Promise<Response>): void {
  fetchMock = vi.fn((url: unknown) => Promise.resolve(handler(String(url))));
  vi.stubGlobal("fetch", fetchMock);
}
function calledUrls(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// parseArgs / month arithmetic
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("defaults to every META_FORMATS id, backfill 1, undefined month", () => {
    const args = parseArgs([]);
    expect(args.formats).toEqual(["gen9ou"]);
    expect(args.backfill).toBe(1);
    expect(args.month).toBeUndefined();
  });

  it("parses an explicit --formats/--month/--backfill", () => {
    const args = parseArgs(["--formats=gen9ou", "--month=2026-06", "--backfill=6"]);
    expect(args.formats).toEqual(["gen9ou"]);
    expect(args.month).toBe("2026-06");
    expect(args.backfill).toBe(6);
  });

  it("throws on an unknown format", () => {
    expect(() => parseArgs(["--formats=gen9ou,gen9uber"])).toThrow(/unknown meta format/i);
  });

  it("throws on a malformed month", () => {
    expect(() => parseArgs(["--month=2026-13"])).toThrow(/YYYY-MM/);
    expect(() => parseArgs(["--month=june"])).toThrow(/YYYY-MM/);
  });

  it("throws on an out-of-range backfill", () => {
    expect(() => parseArgs(["--backfill=0"])).toThrow(/1.*24/);
    expect(() => parseArgs(["--backfill=25"])).toThrow(/1.*24/);
  });
});

describe("monthsEndingAt", () => {
  it("returns N consecutive months ending at the target, ascending", () => {
    expect(monthsEndingAt("2026-06", 1)).toEqual(["2026-06"]);
    expect(monthsEndingAt("2026-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

// ---------------------------------------------------------------------------
// syncPairs — URL construction, 404 skip, retry
// ---------------------------------------------------------------------------

describe("syncPairs", () => {
  it("builds the expected gen9ou-1695 chaos URL for an explicit month", async () => {
    installFetch(() => okJson(CHAOS_FIXTURE));
    const res = await syncPairs({
      formats: ["gen9ou"],
      months: ["2026-06"],
      resolver: emptyResolver(),
      now: 0,
      timing: NO_WAIT,
      buildRows: fakeBuild,
    });
    expect(calledUrls()).toEqual([GEN9OU_2026_06_URL]);
    expect(res.built).toHaveLength(1);
    expect(res.built[0]!.month).toBe("2026-06");
  });

  it("skips a 404 (unpublished) pair and continues", async () => {
    installFetch((url) =>
      url.includes("2026-06") ? okJson(CHAOS_FIXTURE) : status(404),
    );
    const res = await syncPairs({
      formats: ["gen9ou"],
      months: ["2026-05", "2026-06"],
      resolver: emptyResolver(),
      now: 0,
      timing: NO_WAIT,
      buildRows: fakeBuild,
    });
    expect(res.built.map((p) => p.month)).toEqual(["2026-06"]);
    expect(res.skipped).toEqual([
      { metaFormat: "gen9ou", month: "2026-05", reason: "not published (404)" },
    ]);
  });

  it("retries once on a 5xx then succeeds", async () => {
    let calls = 0;
    installFetch(() => {
      calls += 1;
      return calls === 1 ? status(500) : okJson(CHAOS_FIXTURE);
    });
    const res = await syncPairs({
      formats: ["gen9ou"],
      months: ["2026-06"],
      resolver: emptyResolver(),
      now: 0,
      timing: NO_WAIT,
      buildRows: fakeBuild,
    });
    expect(calls).toBe(2);
    expect(res.built).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// discoverTargetMonth — index parse + walk-back fallback
// ---------------------------------------------------------------------------

const GEN9OU = metaFormatConfig("gen9ou");

describe("discoverTargetMonth", () => {
  it("picks the newest month from the stats index HTML", async () => {
    const indexHtml = [
      '<a href="2026-04/">2026-04/</a>',
      '<a href="2026-05/">2026-05/</a>',
      '<a href="2026-06/">2026-06/</a>',
    ].join("\n");
    installFetch((url) =>
      url === "https://www.smogon.com/stats/" ? okText(indexHtml) : status(404),
    );
    const month = await discoverTargetMonth(GEN9OU, Date.UTC(2026, 6, 20), NO_WAIT);
    expect(month).toBe("2026-06");
    // Only the index was fetched — no chaos probe needed.
    expect(calledUrls()).toEqual(["https://www.smogon.com/stats/"]);
  });

  it("walks back from the current month when the index can't be parsed", async () => {
    installFetch((url) => {
      if (url === "https://www.smogon.com/stats/") return okText("<html>no links here</html>");
      // 2026-07 (current) unpublished, 2026-06 published.
      if (url.includes("2026-06")) return okJson(CHAOS_FIXTURE);
      return status(404);
    });
    const month = await discoverTargetMonth(GEN9OU, Date.UTC(2026, 6, 15), NO_WAIT);
    expect(month).toBe("2026-06");
    // Probed the current month (404) before finding 2026-06.
    expect(calledUrls()).toContain(
      "https://www.smogon.com/stats/2026-07/chaos/gen9ou-1695.json",
    );
    expect(calledUrls()).toContain(GEN9OU_2026_06_URL);
  });
});

// ---------------------------------------------------------------------------
// DB write path — real build-meta + fixture body against a real schema
// ---------------------------------------------------------------------------

describe("runSyncMeta — DB write", () => {
  let fix: PgFixture;
  let db: IngestDb;

  beforeAll(async () => {
    fix = await createPgSchema({ seed: "none" });
    db = fix.db as unknown as IngestDb;
  }, 120_000);

  afterAll(async () => {
    await fix.cleanup();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function snapshotRows(month: string) {
    return db
      .select()
      .from(meta_snapshot)
      .where(
        and(eq(meta_snapshot.meta_format, "gen9ou"), eq(meta_snapshot.month, month)),
      );
  }
  async function usageCount(month: string): Promise<number> {
    const rows = await db
      .select()
      .from(meta_usage)
      .where(and(eq(meta_usage.meta_format, "gen9ou"), eq(meta_usage.month, month)));
    return rows.length;
  }

  async function sync(month: string): Promise<void> {
    installFetch(() => okJson(CHAOS_FIXTURE));
    await runSyncMeta({
      formats: ["gen9ou"],
      month,
      db,
      now: 1_720_000_000_000,
      timing: NO_WAIT,
    });
    vi.unstubAllGlobals();
  }

  it("writes one month with the fixture's species count", async () => {
    await sync("2026-06");
    const snaps = await snapshotRows("2026-06");
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.species_count).toBe(FIXTURE_SPECIES_COUNT);
    expect(snaps[0]!.smogon_format_id).toBe("gen9ou");
    expect(snaps[0]!.source_url).toBe(GEN9OU_2026_06_URL);
    expect(await usageCount("2026-06")).toBe(FIXTURE_SPECIES_COUNT);
  });

  it("is an idempotent replace on a re-run", async () => {
    await sync("2026-06");
    await sync("2026-06");
    expect(await snapshotRows("2026-06")).toHaveLength(1);
    expect(await usageCount("2026-06")).toBe(FIXTURE_SPECIES_COUNT);
  });

  it("keeps a second month alongside the first", async () => {
    await sync("2026-06");
    await sync("2026-05");
    expect(await snapshotRows("2026-06")).toHaveLength(1);
    expect(await snapshotRows("2026-05")).toHaveLength(1);
    expect(await usageCount("2026-06")).toBe(FIXTURE_SPECIES_COUNT);
    expect(await usageCount("2026-05")).toBe(FIXTURE_SPECIES_COUNT);
  });
});
