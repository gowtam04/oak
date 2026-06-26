/**
 * INDEPENDENT ORACLE TESTS — DS-3 Gen-9 learnset transform (Phase 3,
 * build-learnsets). Authored from the docs BEFORE judging the implementation;
 * expected values derived from data-sources.md (DS-3, D6, BR-2) + design.md,
 * NOT from impl code. Fully offline against ./__fixtures__ — no live crawl.
 *
 * ── CONTRACT under test (src/ingest/build-learnsets.ts) ────────────────────
 *   export interface LearnsetRow { …exactly the `learnset` table columns from
 *     src/data/schema.ts: pokemon_id, move_slug, version_group, method }
 *
 *   export function buildLearnsetRows(
 *     pokemon: Json,   // a /pokemon/{id} resource (carries moves[])
 *     opts: { gen9VersionGroups: string[] },
 *   ): LearnsetRow[];
 *
 * Rules the transform must satisfy (D6 / DS-3):
 *   - Emit one row per (move_slug, version_group) whose version_group ∈
 *     gen9VersionGroups AND whose move_learn_method is NOT "egg".
 *   - Egg moves are EXCLUDED (breeding out of scope). A move that is ONLY
 *     learnable via egg in Gen 9 is absent; a move learnable via egg AND a
 *     non-egg method survives via the non-egg method.
 *   - Moves only present in non-Gen-9 version groups are excluded.
 *   - pokemon_id = the pokemon slug; rows are unique per (move, version_group).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Json } from "@/data/pokeapi-client";
import { buildLearnsetRows } from "./build-learnsets";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
);
function load(name: string): Json {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as Json;
}

const GEN9 = { gen9VersionGroups: ["scarlet-violet"] };

describe("buildLearnsetRows — Ninetales (Gen-9 filtering + egg exclusion)", () => {
  const rows = buildLearnsetRows(load("ninetales-pokemon.json"), GEN9);
  const slugs = rows.map((r) => r.move_slug);

  it("attributes every row to the source pokemon", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.pokemon_id === "ninetales")).toBe(true);
  });

  it("includes the Gen-9 will-o-wisp learner row (learner set non-empty)", () => {
    const wow = rows.filter((r) => r.move_slug === "will-o-wisp");
    expect(wow).toHaveLength(1);
    expect(wow[0].version_group).toBe("scarlet-violet");
    expect(slugs).toContain("flamethrower");
  });

  it("excludes egg-only moves (hypnosis is egg-only in SV)", () => {
    expect(slugs).not.toContain("hypnosis");
  });

  it("never emits a row with method 'egg'", () => {
    expect(rows.every((r) => r.method !== "egg")).toBe(true);
  });

  it("keeps a move learnable via egg AND level-up, via the non-egg method", () => {
    const flameCharge = rows.filter((r) => r.move_slug === "flame-charge");
    expect(flameCharge).toHaveLength(1);
    expect(flameCharge[0].method).toBe("level-up");
  });

  it("excludes moves only present in non-Gen-9 version groups (fire-spin)", () => {
    expect(slugs).not.toContain("fire-spin");
  });

  it("only emits rows for Gen-9 version groups", () => {
    expect(
      rows.every((r) => GEN9.gen9VersionGroups.includes(r.version_group)),
    ).toBe(true);
  });

  it("emits unique (move_slug, version_group) rows (composite-PK safe)", () => {
    const keys = rows.map((r) => `${r.move_slug}|${r.version_group}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("buildLearnsetRows — Garchomp (multi-version-group collapse)", () => {
  const rows = buildLearnsetRows(load("garchomp-pokemon.json"), GEN9);
  const slugs = rows.map((r) => r.move_slug);

  it("produces a non-empty Gen-9 learnset", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(slugs).toContain("dragon-claw");
    expect(slugs).toContain("earthquake");
  });

  it("collapses a move present in both SV and SwSh to the SV row only", () => {
    const dragonRush = rows.filter((r) => r.move_slug === "dragon-rush");
    expect(dragonRush).toHaveLength(1);
    expect(dragonRush[0].version_group).toBe("scarlet-violet");
    expect(rows.every((r) => r.version_group !== "sword-shield")).toBe(true);
  });
});

describe("buildLearnsetRows — Dracovish (no Gen-9 presence)", () => {
  it("yields an empty Gen-9 learnset for a non-Gen-9 mon", () => {
    const rows = buildLearnsetRows(load("dracovish-pokemon.json"), GEN9);
    expect(rows).toEqual([]);
  });
});
