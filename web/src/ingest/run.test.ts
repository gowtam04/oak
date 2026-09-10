/**
 * Regression test for the write phase of `runIngest` after champions-first
 * cutover (ADR-4, CF-DATA-BR-3, CF-INT-BR-3).
 *
 * `writeIndex` is exercised against a real, migrated-but-empty Postgres schema
 * (`createPgSchema({ seed: "none" })`) with tiny synthetic Champions rows —
 * no @pkmn build involved. Default ingest is champions-only; wiki/natdex/meta/
 * encounter/pmd write paths are gone.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  ingest_meta,
  learnset,
  pokemon,
  reference_cache,
  searchable_names,
} from "@/data/schema";
import { CHAMPIONS_FORMAT, DEFAULT_FORMATS, type Format } from "@/data/formats";

import { createPgSchema, type PgFixture } from "../../test/support/pg";
import {
  INDEX_VACUUM_TABLES,
  vacuumIndexTables,
  writeIndex,
  type FormatReport,
  type IndexRows,
  type IngestDb,
} from "./run";
import type { PokemonRow } from "./build-pokedex";
import type { LearnsetRow } from "./build-learnsets";
import type { NameRow } from "./build-names";
import type { ReferenceRow } from "./build-reference";

let fix: PgFixture;
let db: IngestDb;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  db = fix.db;
});

afterAll(async () => {
  await fix.cleanup();
});

// ---------------------------------------------------------------------------
// Tiny synthetic row builders — only the NOT NULL columns matter.
// ---------------------------------------------------------------------------

function makePokemonRows(format: Format, version: string, n = 2): PokemonRow[] {
  return Array.from({ length: n }, (_, i) => ({
    format,
    id: `${format}-mon-${i}`,
    species_name: `species-${i}`,
    form_name: null,
    display_name: `${version}-Species-${i}`,
    national_dex_number: i + 1,
    type1: "normal",
    type2: null,
    ability_slot1: "run-away",
    ability_slot2: null,
    ability_hidden: null,
    stat_hp: 50,
    stat_attack: 50,
    stat_defense: 50,
    stat_special_attack: 50,
    stat_special_defense: 50,
    stat_speed: 50,
    base_stat_total: 300,
    sprite_url: "https://example.test/sprite.png",
    artwork_url: "https://example.test/art.png",
    required_item: null,
    generation: format,
    is_gen9_native: 1,
    source_generation: null,
  }));
}

function makeLearnsetRows(
  format: Format,
  pokemonIds: string[],
  version: string,
): LearnsetRow[] {
  return pokemonIds.map((pokemon_id, i) => ({
    pokemon_id,
    move_slug: `${version}-move-${i}`,
    format,
    method: "level-up",
  }));
}

function makeNameRows(format: Format, n: number, version: string): NameRow[] {
  return Array.from({ length: n }, (_, i) => ({
    format,
    kind: "pokemon" as const,
    slug: `${format}-mon-${i}`,
    display_name: `${version}-Species-${i}`,
  }));
}

function makeReferenceRows(format: Format, version: string): ReferenceRow[] {
  return [
    {
      format,
      resource_key: `move/${version}-tackle`,
      resource_kind: "move",
      payload: JSON.stringify({ version }),
      endpoint_url: "https://example.test",
      fetched_at: 1,
    },
  ];
}

/** One format's full row set + its FormatReport, tagged with `version`. */
function buildFormat(format: Format, version: string, n = 2) {
  const pokemonRows = makePokemonRows(format, version, n);
  const learnsetRows = makeLearnsetRows(
    format,
    pokemonRows.map((p) => p.id),
    version,
  );
  const nameRows = makeNameRows(format, n, version);
  const referenceRows = makeReferenceRows(format, version);
  const report: FormatReport = {
    format,
    pokemon: pokemonRows.length,
    learnsets: learnsetRows.length,
    names: nameRows.length,
    references: referenceRows.length,
  };
  return { pokemonRows, learnsetRows, nameRows, referenceRows, report };
}

function toIndexRows(built: ReturnType<typeof buildFormat>): {
  rows: IndexRows;
  reports: FormatReport[];
} {
  return {
    rows: {
      pokemon: built.pokemonRows,
      learnsets: built.learnsetRows,
      names: built.nameRows,
      references: built.referenceRows,
    },
    reports: [built.report],
  };
}

async function tableCounts(format: Format) {
  const [p, l, n, r, m] = await Promise.all([
    db.select().from(pokemon).where(eq(pokemon.format, format)),
    db.select().from(learnset).where(eq(learnset.format, format)),
    db.select().from(searchable_names).where(eq(searchable_names.format, format)),
    db.select().from(reference_cache).where(eq(reference_cache.format, format)),
    db.select().from(ingest_meta).where(eq(ingest_meta.format, format)),
  ]);
  return { p, l, n, r, m };
}

describe("DEFAULT ingest formats (CF-DATA-BR-3, ADR-4)", () => {
  it("is exactly [\"champions\"] — gen-7 is not part of default ingest", () => {
    expect([...DEFAULT_FORMATS]).toEqual(["champions"]);
    expect(DEFAULT_FORMATS).not.toContain("gen-7");
  });
});

describe("writeIndex — champions replace (DATA-01, champions-only)", () => {
  it("a champions rewrite replaces the prior champions rows", async () => {
    const v1 = toIndexRows(buildFormat(CHAMPIONS_FORMAT, "v1"));
    await writeIndex(db, v1.rows, v1.reports, [CHAMPIONS_FORMAT], 1000);

    const v2 = toIndexRows(buildFormat(CHAMPIONS_FORMAT, "v2", 3));
    await writeIndex(db, v2.rows, v2.reports, [CHAMPIONS_FORMAT], 2000);

    const after = await tableCounts(CHAMPIONS_FORMAT);
    expect(after.p).toHaveLength(3);
    expect(after.p.map((r) => r.display_name).sort()).toEqual(
      v2.rows.pokemon.map((r) => r.display_name).sort(),
    );
    expect(after.l).toHaveLength(3);
    expect(after.n).toHaveLength(3);
    expect(after.r).toHaveLength(1);
    expect(after.r[0]!.payload).toBe(v2.rows.references[0]!.payload);
    expect(after.m).toHaveLength(1);
    expect(after.m[0]).toMatchObject({
      format: CHAMPIONS_FORMAT,
      last_success_at: 2000,
      pokemon_count: 3,
    });
  });
});

describe("vacuumIndexTables (B-26)", () => {
  it("issues VACUUM ANALYZE on the four index tables, outside any write txn", async () => {
    const queries: string[] = [];
    await vacuumIndexTables({
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [] };
      },
    });
    expect(queries).toEqual(
      INDEX_VACUUM_TABLES.map((table) => `VACUUM ANALYZE ${table}`),
    );
  });
});

describe("writeIndex — atomic rollback on a mid-write failure (DATA-02)", () => {
  it("rejects and leaves every pre-call champions row unchanged", async () => {
    const seed = toIndexRows(buildFormat(CHAMPIONS_FORMAT, "r1"));
    await writeIndex(db, seed.rows, seed.reports, [CHAMPIONS_FORMAT], 5000);

    const before = await tableCounts(CHAMPIONS_FORMAT);

    const bad = buildFormat(CHAMPIONS_FORMAT, "bad", 2);
    const dupedLearnsets: LearnsetRow[] = [
      ...bad.learnsetRows,
      { ...bad.learnsetRows[0]! },
    ];
    const badRows: IndexRows = {
      pokemon: bad.pokemonRows,
      learnsets: dupedLearnsets,
      names: bad.nameRows,
      references: bad.referenceRows,
    };
    const badReports: FormatReport[] = [
      { ...bad.report, learnsets: dupedLearnsets.length },
    ];

    await expect(
      writeIndex(db, badRows, badReports, [CHAMPIONS_FORMAT], 6000),
    ).rejects.toThrow();

    const after = await tableCounts(CHAMPIONS_FORMAT);
    expect(after.p.map((r) => r.display_name).sort()).toEqual(
      before.p.map((r) => r.display_name).sort(),
    );
    expect(after.l.map((r) => r.move_slug).sort()).toEqual(
      before.l.map((r) => r.move_slug).sort(),
    );
    expect(after.n).toHaveLength(before.n.length);
    expect(after.r).toHaveLength(before.r.length);
    expect(after.m).toEqual(before.m);
  });
});

describe("runIngest does not write dropped other-game pipelines (CF-INT-BR-3, CF-OPS-AC-1.2)", () => {
  it("run.ts does not import wiki/natdex/encounter/pmd/meta builders", () => {
    const src = readFileSync(fileURLToPath(new URL("./run.ts", import.meta.url)), "utf8");
    const bannedImports = [
      "./build-wiki",
      "./build-natdex",
      "./build-encounters",
      "./build-classic-encounters",
      "./build-pmd",
      "./build-meta",
      "./sync-meta",
    ];
    for (const spec of bannedImports) {
      expect(src, `run.ts must not import ${spec}`).not.toContain(`from "${spec}"`);
      expect(src, `run.ts must not import ${spec}`).not.toContain(`from '${spec}'`);
    }
    for (const ident of [
      "buildWikiRows",
      "buildNatdexSpeciesRows",
      "buildEncounterRows",
      "buildClassicEncounterRows",
      "buildPmdRows",
      "buildMetaRows",
      "wiki_page",
      "wiki_chunk",
      "natdex_species",
      "natdex_machines",
      "natdex_moves",
      "classic_encounters",
      "pmd_recruits",
      "meta_snapshot",
      "meta_usage",
    ]) {
      expect(src, `run.ts must not mention ${ident}`).not.toMatch(
        new RegExp(`\\b${ident}\\b`),
      );
    }
  });
});

describe("dropped ingest builders are gone (CF-INT-BR-3, CF-OPS-AC-1.2)", () => {
  const dropped = [
    "./build-wiki.ts",
    "./build-natdex.ts",
    "./build-encounters.ts",
    "./build-classic-encounters.ts",
    "./build-pmd.ts",
    "./build-meta.ts",
    "./sync-meta.ts",
  ] as const;

  it.each(dropped)("%s is not on disk (module cannot be imported)", (rel) => {
    const path = fileURLToPath(new URL(rel, import.meta.url));
    expect(existsSync(path), `${rel} must be deleted`).toBe(false);
  });
});
