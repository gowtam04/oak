/**
 * Regression test for the write phase of `runIngest` (DATA-01/DATA-02).
 *
 * `writeIndex` is exercised directly against a real, migrated-but-empty
 * Postgres schema (`createPgSchema({ seed: "none" })`) with tiny synthetic
 * rows — no @pkmn build involved. Two real formats ("gen-5" / "gen-6") stand
 * in for "the format being (re)built" and "an unrelated format that must
 * survive a partial ingest".
 *
 *   1. A partial call (`formats: ["gen-6"]`) must leave every "gen-5" row —
 *      across all four index tables plus its ingest_meta row — byte-identical
 *      (DATA-01: `replaceTable`'s delete is scoped to the formats being built,
 *      never "delete everything").
 *   2. A full call (`formats: ["gen-5", "gen-6"]`) must still replace both
 *      formats wholesale, matching pre-fix end-state behavior.
 *   3. A batch that fails mid-write (a duplicate composite-PK row) must reject
 *      AND leave every table's pre-call rows untouched — nothing partially
 *      committed (DATA-02: one atomic transaction).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  ingest_meta,
  learnset,
  pokemon,
  reference_cache,
  searchable_names,
} from "@/data/schema";
import type { Format } from "@/data/formats";

import { createPgSchema, type PgFixture } from "../../test/support/pg";
import {
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

/** Merge one or more built formats into a single writeIndex call's inputs. */
function combine(...builts: ReturnType<typeof buildFormat>[]): {
  rows: IndexRows;
  reports: FormatReport[];
} {
  return {
    rows: {
      pokemon: builts.flatMap((b) => b.pokemonRows),
      learnsets: builts.flatMap((b) => b.learnsetRows),
      names: builts.flatMap((b) => b.nameRows),
      references: builts.flatMap((b) => b.referenceRows),
    },
    reports: builts.map((b) => b.report),
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

const GEN5: Format = "gen-5";
const GEN6: Format = "gen-6";

describe("writeIndex — partial swap preserves other formats (DATA-01)", () => {
  it("a gen-6-only call leaves gen-5's rows and ingest_meta row untouched", async () => {
    const gen5v1 = buildFormat(GEN5, "v1");
    const gen6v1 = buildFormat(GEN6, "v1");
    const seed = combine(gen5v1, gen6v1);
    await writeIndex(db, seed.rows, seed.reports, [GEN5, GEN6], 1000);

    const gen6v2 = buildFormat(GEN6, "v2", 3);
    const partial = combine(gen6v2);
    await writeIndex(db, partial.rows, partial.reports, [GEN6], 2000);

    const gen5After = await tableCounts(GEN5);
    expect(gen5After.p).toHaveLength(2);
    expect(gen5After.p.map((r) => r.display_name).sort()).toEqual(
      gen5v1.pokemonRows.map((r) => r.display_name).sort(),
    );
    expect(gen5After.l).toHaveLength(2);
    expect(gen5After.l.map((r) => r.move_slug).sort()).toEqual(
      gen5v1.learnsetRows.map((r) => r.move_slug).sort(),
    );
    expect(gen5After.n).toHaveLength(2);
    expect(gen5After.r).toHaveLength(1);
    expect(gen5After.r[0]!.payload).toBe(gen5v1.referenceRows[0]!.payload);
    expect(gen5After.m).toHaveLength(1);
    expect(gen5After.m[0]).toMatchObject({
      format: GEN5,
      last_success_at: 1000,
      pokemon_count: 2,
    });

    const gen6After = await tableCounts(GEN6);
    expect(gen6After.p).toHaveLength(3);
    expect(gen6After.p.map((r) => r.display_name).sort()).toEqual(
      gen6v2.pokemonRows.map((r) => r.display_name).sort(),
    );
    expect(gen6After.m).toHaveLength(1);
    expect(gen6After.m[0]).toMatchObject({ last_success_at: 2000, pokemon_count: 3 });
  });
});

describe("writeIndex — a full-format call still replaces everything", () => {
  it("wipes and rewrites both formats when both are named", async () => {
    const seedA = combine(buildFormat(GEN5, "a1"), buildFormat(GEN6, "a1"));
    await writeIndex(db, seedA.rows, seedA.reports, [GEN5, GEN6], 3000);

    const seedB = combine(buildFormat(GEN5, "a2", 3), buildFormat(GEN6, "a2", 3));
    await writeIndex(db, seedB.rows, seedB.reports, [GEN5, GEN6], 4000);

    for (const format of [GEN5, GEN6]) {
      const after = await tableCounts(format);
      expect(after.p).toHaveLength(3);
      expect(after.p.every((r) => r.display_name.startsWith("a2-"))).toBe(true);
      expect(after.m[0]).toMatchObject({ last_success_at: 4000, pokemon_count: 3 });
    }
  });
});

describe("writeIndex — atomic rollback on a mid-write failure (DATA-02)", () => {
  it("rejects and leaves every pre-call row (all tables + ingest_meta) unchanged", async () => {
    const seed = combine(buildFormat(GEN5, "r1"), buildFormat(GEN6, "r1"));
    await writeIndex(db, seed.rows, seed.reports, [GEN5, GEN6], 5000);

    const before = { gen5: await tableCounts(GEN5), gen6: await tableCounts(GEN6) };

    // A batch for gen-6 whose learnset rows contain a duplicate composite PK
    // (pokemon_id, move_slug, format) — the second table writeIndex touches,
    // so the pokemon table's delete+insert for gen-6 will already have run
    // inside the same transaction before this insert fails.
    const bad = buildFormat(GEN6, "bad", 2);
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
      writeIndex(db, badRows, badReports, [GEN6], 6000),
    ).rejects.toThrow();

    const after = { gen5: await tableCounts(GEN5), gen6: await tableCounts(GEN6) };
    expect(after.gen5).toEqual(before.gen5);
    expect(after.gen6.p.map((r) => r.display_name).sort()).toEqual(
      before.gen6.p.map((r) => r.display_name).sort(),
    );
    expect(after.gen6.l.map((r) => r.move_slug).sort()).toEqual(
      before.gen6.l.map((r) => r.move_slug).sort(),
    );
    expect(after.gen6.n).toHaveLength(before.gen6.n.length);
    expect(after.gen6.r).toHaveLength(before.gen6.r.length);
    expect(after.gen6.m).toEqual(before.gen6.m);
  });
});
