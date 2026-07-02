/**
 * Unit tests for the DS-3 learnset transform (build-learnsets), @pkmn-backed.
 *
 * `buildLearnsetRows(pokemonId, learnset, moveSlugFor, { format, genFilter })`
 * consumes an @pkmn learnset record — `{ moveId: sourceString[] }` where each
 * source encodes gen+method at indexes 0/1 ("9M" = Gen-9 machine, "9L42" =
 * Gen-9 level-up @42, "9E" = egg, "8M" = Gen-8 machine, "7L" = Gen-7 level-up,
 * "9T" = tutor). The inputs here are small synthetic records so the filtering +
 * method-priority rules are asserted directly.
 *
 * Rules (D6 / BR-2):
 *   - Keep level-up / machine / tutor; drop egg (and event/virtual/other).
 *   - genFilter (a mainline gen number) keeps only that gen's sources — 9 → '9…'
 *     for scarlet-violet, 7 → '7…' for gen-7; omit it (Champions) to keep all.
 *   - One row per (pokemon_id, move_slug, format); highest-priority method wins
 *     (level-up > machine > tutor).
 *   - moveSlugFor → null skips the move.
 */

import { describe, expect, it } from "vitest";

import type { Format } from "@/data/formats";
import { buildLearnsetRows } from "./build-learnsets";

const SV: Format = "scarlet-violet";
const CH: Format = "champions";
const G7: Format = "gen-7";

// @pkmn moveId → canonical slug. An id absent here resolves to null (skipped).
const SLUGS: Record<string, string> = {
  earthquake: "earthquake",
  dragonclaw: "dragon-claw",
  dragonrush: "dragon-rush",
  dig: "dig",
  firespin: "fire-spin",
  willowisp: "will-o-wisp",
};
const moveSlugFor = (id: string): string | null => SLUGS[id] ?? null;

describe("buildLearnsetRows — standard (genFilter: 9)", () => {
  const learnset = {
    earthquake: ["9M"], // Gen-9 machine
    dragonclaw: ["9L1"], // Gen-9 level-up
    dragonrush: ["9L5", "8M"], // Gen-9 level-up wins over the Gen-8 machine
    dig: ["9E"], // egg-only → dropped
    firespin: ["8M"], // Gen-8 only → dropped under genFilter: 9
    unknownmove: ["9M"], // moveSlugFor → null → skipped
  };
  const rows = buildLearnsetRows("garchomp", learnset, moveSlugFor, {
    format: SV,
    genFilter: 9,
  });
  const bySlug = new Map(rows.map((r) => [r.move_slug, r]));

  it("attributes every row to the source pokemon and stamps the format", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.pokemon_id === "garchomp")).toBe(true);
    expect(rows.every((r) => r.format === SV)).toBe(true);
  });

  it("keeps Gen-9 machine / level-up moves with the right method", () => {
    expect(bySlug.get("earthquake")?.method).toBe("machine");
    expect(bySlug.get("dragon-claw")?.method).toBe("level-up");
  });

  it("collapses multiple sources to the highest-priority non-egg method", () => {
    // 9L5 (level-up) beats 8M (machine) — and 8M is filtered by genFilter: 9 anyway.
    expect(bySlug.get("dragon-rush")?.method).toBe("level-up");
  });

  it("never emits an egg row (egg-only moves are dropped)", () => {
    expect(rows.every((r) => r.method !== "egg")).toBe(true);
    expect(bySlug.has("dig")).toBe(false);
  });

  it("excludes moves present only in non-Gen-9 sources", () => {
    expect(bySlug.has("fire-spin")).toBe(false);
  });

  it("skips a move whose slug does not resolve (moveSlugFor → null)", () => {
    // 'unknownmove' has a valid Gen-9 machine source but no canonical slug.
    expect(rows.some((r) => r.move_slug === "unknownmove")).toBe(false);
  });

  it("emits unique move_slug rows (composite-PK safe)", () => {
    const slugs = rows.map((r) => r.move_slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("buildLearnsetRows — mainline gen scope (genFilter: 7)", () => {
  const learnset = {
    earthquake: ["7M"], // Gen-7 machine → kept
    dragonclaw: ["7L1"], // Gen-7 level-up → kept
    firespin: ["7L20", "9M"], // Gen-7 level-up kept; the Gen-9 machine is filtered
    willowisp: ["9M"], // Gen-9 only → dropped under genFilter: 7
    dig: ["7E"], // egg-only → dropped
  };
  const rows = buildLearnsetRows("raichu-alola", learnset, moveSlugFor, {
    format: G7,
    genFilter: 7,
  });
  const bySlug = new Map(rows.map((r) => [r.move_slug, r]));

  it("stamps the gen-7 format on every row", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.format === G7)).toBe(true);
  });

  it("keeps Gen-7 machine / level-up moves with the right method", () => {
    expect(bySlug.get("earthquake")?.method).toBe("machine");
    expect(bySlug.get("dragon-claw")?.method).toBe("level-up");
  });

  it("ignores an out-of-gen source when collapsing (9M dropped for gen-7)", () => {
    // 7L20 is the only in-gen source; the 9M machine is filtered before priority.
    expect(bySlug.get("fire-spin")?.method).toBe("level-up");
  });

  it("drops a move present only in the wrong generation", () => {
    // will-o-wisp has only a Gen-9 source → not part of the gen-7 learnset.
    expect(bySlug.has("will-o-wisp")).toBe(false);
  });

  it("still drops egg moves", () => {
    expect(bySlug.has("dig")).toBe(false);
  });
});

describe("buildLearnsetRows — method priority", () => {
  it("level-up beats machine", () => {
    const rows = buildLearnsetRows(
      "x",
      { tackle: ["9M", "9L20"] },
      (id) => id,
      { format: SV, genFilter: 9 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].method).toBe("level-up");
  });

  it("machine beats tutor", () => {
    const rows = buildLearnsetRows(
      "x",
      { tackle: ["9T", "9M"] },
      (id) => id,
      { format: SV, genFilter: 9 },
    );
    expect(rows[0].method).toBe("machine");
  });
});

describe("buildLearnsetRows — champions (no genFilter)", () => {
  it("keeps non-'9' sources from the already-scoped mod learnset", () => {
    const rows = buildLearnsetRows(
      "y",
      { firespin: ["8M"], willowisp: ["9M"] },
      moveSlugFor,
      { format: CH },
    );
    const bySlug = new Map(rows.map((r) => [r.move_slug, r]));
    expect(bySlug.get("fire-spin")?.method).toBe("machine");
    expect(bySlug.get("fire-spin")?.format).toBe(CH);
    expect(bySlug.get("will-o-wisp")?.method).toBe("machine");
  });

  it("still drops egg moves when genFilter is omitted", () => {
    const rows = buildLearnsetRows("y", { dig: ["9E"] }, moveSlugFor, {
      format: CH,
    });
    expect(rows).toEqual([]);
  });
});

describe("buildLearnsetRows — edge cases", () => {
  it("returns [] for an empty learnset", () => {
    expect(
      buildLearnsetRows("z", {}, moveSlugFor, { format: SV, genFilter: 9 }),
    ).toEqual([]);
  });

  it("ignores malformed source strings", () => {
    const rows = buildLearnsetRows(
      "z",
      { earthquake: ["", "9"] }, // too short / no method letter
      moveSlugFor,
      { format: SV, genFilter: 9 },
    );
    expect(rows).toEqual([]);
  });
});
