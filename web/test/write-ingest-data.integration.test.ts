/**
 * INTEGRATION — `writeIngestData` (src/ingest/run.ts), the atomic, format-scoped
 * write phase behind `npm run ingest`. Exercised directly against a migrated
 * Testcontainers Postgres schema with tiny synthetic rows — NOT via a full
 * @pkmn build (that's what the build-*.test.ts unit tests already cover).
 *
 * Regressions under test (DATA-01 Critical, DATA-02 High from the Fable audit):
 *   - `--formats=X` must only ever touch format X's rows. A write for one
 *     format must leave every OTHER format's pokemon/learnset/searchable_names/
 *     reference_cache/ingest_meta rows byte-for-byte untouched.
 *   - The four table replacements + the ingest_meta row happen in ONE
 *     transaction: a failure partway through (e.g. a duplicate-PK insert) rolls
 *     back everything written earlier in the same call, leaving the prior
 *     contents of ALL formats fully intact.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { ingest_meta, learnset, pokemon, reference_cache, searchable_names } from "@/data/schema";
import type { Format } from "@/data/formats";
import {
  writeIngestData,
  type FormatReport,
  type IngestWriteData,
} from "@/ingest/run";
import type { PokemonRow } from "@/ingest/build-pokedex";
import type { LearnsetRow } from "@/ingest/build-learnsets";
import type { NameRow } from "@/ingest/build-names";
import type { ReferenceRow } from "@/ingest/build-reference";

import { createPgSchema, type PgFixture } from "./support/pg";

let fix: PgFixture;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

// ---------------------------------------------------------------------------
// Tiny synthetic row builders — just enough to satisfy NOT NULL columns.
// ---------------------------------------------------------------------------

function makePokemon(format: Format, id: string, hp: number): PokemonRow {
  return {
    format,
    id,
    species_name: id,
    form_name: null,
    display_name: id,
    national_dex_number: 1,
    type1: "normal",
    type2: null,
    ability_slot1: "run-away",
    ability_slot2: null,
    ability_hidden: null,
    stat_hp: hp,
    stat_attack: 50,
    stat_defense: 50,
    stat_special_attack: 50,
    stat_special_defense: 50,
    stat_speed: 50,
    base_stat_total: hp + 250,
    sprite_url: "https://example.test/sprite.png",
    artwork_url: "https://example.test/art.png",
    required_item: null,
    generation: "gen-9",
    is_gen9_native: 1,
    source_generation: null,
  };
}

function makeLearnset(format: Format, pokemonId: string, moveSlug: string): LearnsetRow {
  return { pokemon_id: pokemonId, move_slug: moveSlug, format, method: "level-up" };
}

function makeName(format: Format, slug: string): NameRow {
  return { format, kind: "pokemon", slug, display_name: slug };
}

function makeReference(format: Format, key: string): ReferenceRow {
  return {
    format,
    resource_key: key,
    resource_kind: "move",
    payload: JSON.stringify({ note: key }),
    endpoint_url: "https://example.test/ref",
    fetched_at: 1,
  };
}

function makeReport(format: Format, n: number): FormatReport {
  return { format, pokemon: n, learnsets: n, names: n, references: n };
}

/** Build a full IngestWriteData for one format, all rows tagged by `tag`. */
function dataFor(format: Format, tag: string, finishedAt: number): IngestWriteData {
  return {
    formats: [format],
    pokemon: [makePokemon(format, `${tag}-mon`, 10)],
    learnset: [makeLearnset(format, `${tag}-mon`, `${tag}-move`)],
    names: [makeName(format, `${tag}-mon`)],
    references: [makeReference(format, `move/${tag}`)],
    formatReports: [makeReport(format, 1)],
    finishedAt,
  };
}

describe("writeIngestData — format-scoped atomic swap", () => {
  it("replaces only the targeted format, leaving the other format's rows and ingest_meta untouched", async () => {
    const champA = dataFor("champions", "champ-a", 1000);
    const svA = dataFor("scarlet-violet", "sv-a", 1000);

    await writeIngestData(fix.db, champA);
    await writeIngestData(fix.db, svA);

    // Re-run for champions only, with entirely different content.
    const champB = dataFor("champions", "champ-b", 2000);
    await writeIngestData(fix.db, champB);

    // scarlet-violet's rows across all four tables must be byte-identical to svA.
    const svPokemon = await fix.db
      .select()
      .from(pokemon)
      .where(eq(pokemon.format, "scarlet-violet"));
    expect(svPokemon.map((r) => r.id)).toEqual(["sv-a-mon"]);

    const svLearnset = await fix.db
      .select()
      .from(learnset)
      .where(eq(learnset.format, "scarlet-violet"));
    expect(svLearnset.map((r) => r.move_slug)).toEqual(["sv-a-move"]);

    const svNames = await fix.db
      .select()
      .from(searchable_names)
      .where(eq(searchable_names.format, "scarlet-violet"));
    expect(svNames.map((r) => r.slug)).toEqual(["sv-a-mon"]);

    const svRefs = await fix.db
      .select()
      .from(reference_cache)
      .where(eq(reference_cache.format, "scarlet-violet"));
    expect(svRefs.map((r) => r.resource_key)).toEqual(["move/sv-a"]);

    const svMeta = await fix.db
      .select()
      .from(ingest_meta)
      .where(eq(ingest_meta.format, "scarlet-violet"));
    expect(svMeta).toHaveLength(1);
    expect(svMeta[0]!.last_success_at).toBe(1000);

    // champions must reflect the NEW content (champB), not champA.
    const champPokemon = await fix.db
      .select()
      .from(pokemon)
      .where(eq(pokemon.format, "champions"));
    expect(champPokemon.map((r) => r.id)).toEqual(["champ-b-mon"]);

    const champMeta = await fix.db
      .select()
      .from(ingest_meta)
      .where(eq(ingest_meta.format, "champions"));
    expect(champMeta).toHaveLength(1);
    expect(champMeta[0]!.last_success_at).toBe(2000);
  });

  it("rolls back the ENTIRE write when a later table's insert fails, leaving prior contents of every format intact", async () => {
    // Baseline for both formats, distinct from the previous test's schema state
    // (each `it` shares the same fixture/schema, so re-seed explicit tags here).
    const champBaseline = dataFor("champions", "champ-base", 5000);
    const svBaseline = dataFor("scarlet-violet", "sv-base", 5000);
    await writeIngestData(fix.db, champBaseline);
    await writeIngestData(fix.db, svBaseline);

    // A write for champions whose `names` rows contain a duplicate PK
    // (format, kind, slug) — a real Postgres unique-violation, not a type hack.
    // pokemon + learnset (written before names in writeIngestData) would
    // otherwise succeed, so this proves the WHOLE write rolls back, not just
    // the failing table.
    const poisoned: IngestWriteData = {
      formats: ["champions"],
      pokemon: [makePokemon("champions", "champ-poison-mon", 20)],
      learnset: [makeLearnset("champions", "champ-poison-mon", "champ-poison-move")],
      names: [
        makeName("champions", "dup-slug"),
        makeName("champions", "dup-slug"), // duplicate PK -> unique violation
      ],
      references: [makeReference("champions", "move/champ-poison")],
      formatReports: [makeReport("champions", 1)],
      finishedAt: 9999,
    };

    await expect(writeIngestData(fix.db, poisoned)).rejects.toThrow();

    // champions must still be exactly the baseline (poisoned pokemon/learnset
    // rows, inserted before the failing statement, must NOT have stuck).
    const champPokemon = await fix.db
      .select()
      .from(pokemon)
      .where(eq(pokemon.format, "champions"));
    expect(champPokemon.map((r) => r.id)).toEqual(["champ-base-mon"]);

    const champLearnset = await fix.db
      .select()
      .from(learnset)
      .where(eq(learnset.format, "champions"));
    expect(champLearnset.map((r) => r.move_slug)).toEqual(["champ-base-move"]);

    const champNames = await fix.db
      .select()
      .from(searchable_names)
      .where(eq(searchable_names.format, "champions"));
    expect(champNames.map((r) => r.slug)).toEqual(["champ-base-mon"]);

    const champMeta = await fix.db
      .select()
      .from(ingest_meta)
      .where(eq(ingest_meta.format, "champions"));
    expect(champMeta).toHaveLength(1);
    expect(champMeta[0]!.last_success_at).toBe(5000);

    // And scarlet-violet — never targeted by the poisoned write — is untouched.
    const svPokemon = await fix.db
      .select()
      .from(pokemon)
      .where(eq(pokemon.format, "scarlet-violet"));
    expect(svPokemon.map((r) => r.id)).toEqual(["sv-base-mon"]);
  });
});
