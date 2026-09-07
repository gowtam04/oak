/**
 * Pure unit tests for `compactMoves` (T22 lookup_box helper).
 *
 * Compact is the box-build movepool subset (BOX-AC-3.4, BOX-BR-5): at most 16
 * moves, STAB damaging then other damaging then preferred status. Not a DB
 * test and not the full-movepool `get_learnset` API (BOX-BR-7).
 *
 * Until compact-learnset.ts exists, beforeAll records the load error so vitest
 * can still collect the file (red gate, not a collection crash).
 */

import { beforeAll, describe, expect, it } from "vitest";

type CompactMove = {
  slug: string;
  method: string | null;
  type: string | null;
  category: string | null;
  power: number | null;
};

type CompactMoves = (
  moves: CompactMove[],
  speciesTypes: string[],
) => CompactMove[];

let compactMoves: CompactMoves;
let loadError: unknown = null;

beforeAll(async () => {
  try {
    const mod = (await import("@/agent/tools/compact-learnset")) as Record<
      string,
      unknown
    >;
    compactMoves = (mod.compactMoves ?? mod.default) as CompactMoves;
    if (typeof compactMoves !== "function") {
      throw new Error(
        "Expected compactMoves export from src/agent/tools/compact-learnset.ts",
      );
    }
  } catch (e) {
    loadError = e;
  }
});

function ensureLoaded(): void {
  if (loadError) {
    throw new Error(
      `compact-learnset module not loadable yet: ${String(loadError)}`,
    );
  }
}

function move(
  slug: string,
  fields: Partial<Omit<CompactMove, "slug">> = {},
): CompactMove {
  return {
    slug,
    method: fields.method ?? "level-up",
    type: fields.type ?? null,
    category: fields.category ?? null,
    power: fields.power ?? null,
  };
}

function slugs(out: CompactMove[]): string[] {
  return out.map((m) => m.slug);
}

describe("compactMoves (BOX-AC-3.4, BOX-BR-5)", () => {
  it("returns [] for an empty learnset", () => {
    ensureLoaded();
    expect(compactMoves([], ["dragon", "ground"])).toEqual([]);
  });

  it("places STAB damaging ahead of stronger non-STAB damaging", () => {
    ensureLoaded();
    const out = compactMoves(
      [
        move("hyper-beam", {
          type: "normal",
          category: "special",
          power: 150,
        }),
        move("ember", { type: "fire", category: "special", power: 40 }),
        move("protect", { type: "normal", category: "status", power: null }),
      ],
      ["fire"],
    );
    expect(slugs(out)).toEqual(["ember", "hyper-beam", "protect"]);
  });

  it("takes at most 6 STAB damaging, highest power first", () => {
    ensureLoaded();
    const out = compactMoves(
      [
        move("ember", { type: "fire", category: "special", power: 40 }),
        move("fire-punch", { type: "fire", category: "physical", power: 75 }),
        move("lava-plume", { type: "fire", category: "special", power: 80 }),
        move("flamethrower", { type: "fire", category: "special", power: 90 }),
        move("fire-blast", { type: "fire", category: "special", power: 110 }),
        move("flare-blitz", { type: "fire", category: "physical", power: 120 }),
        move("overheat", { type: "fire", category: "special", power: 130 }),
      ],
      ["fire"],
    );
    expect(slugs(out)).toEqual([
      "overheat",
      "flare-blitz",
      "fire-blast",
      "flamethrower",
      "lava-plume",
      "fire-punch",
    ]);
    expect(out).toHaveLength(6);
    expect(slugs(out)).not.toContain("ember");
  });

  it("takes at most 6 non-STAB damaging after STAB, highest power first", () => {
    ensureLoaded();
    const out = compactMoves(
      [
        move("flamethrower", { type: "fire", category: "special", power: 90 }),
        move("mega-kick", { type: "normal", category: "physical", power: 120 }),
        move("hyper-beam", { type: "normal", category: "special", power: 150 }),
        move("giga-impact", { type: "normal", category: "physical", power: 140 }),
        move("earthquake", { type: "ground", category: "physical", power: 100 }),
        move("stone-edge", { type: "rock", category: "physical", power: 95 }),
        move("iron-tail", { type: "steel", category: "physical", power: 85 }),
        move("aqua-tail", { type: "water", category: "physical", power: 70 }),
        move("crunch", { type: "dark", category: "physical", power: 60 }),
      ],
      ["fire"],
    );
    expect(slugs(out)).toEqual([
      "flamethrower",
      "hyper-beam",
      "giga-impact",
      "mega-kick",
      "earthquake",
      "stone-edge",
      "iron-tail",
    ]);
    expect(slugs(out)).not.toContain("aqua-tail");
    expect(slugs(out)).not.toContain("crunch");
  });

  it("prefers the listed status slugs, in list order, capped at 4", () => {
    ensureLoaded();
    const out = compactMoves(
      [
        move("toxic", { type: "poison", category: "status" }),
        move("volt-switch", { type: "electric", category: "status" }),
        move("u-turn", { type: "bug", category: "status" }),
        move("defog", { type: "flying", category: "status" }),
        move("spikes", { type: "ground", category: "status" }),
        move("stealth-rock", { type: "rock", category: "status" }),
        move("wish", { type: "normal", category: "status" }),
        move("recover", { type: "normal", category: "status" }),
        move("substitute", { type: "normal", category: "status" }),
        move("protect", { type: "normal", category: "status" }),
      ],
      ["dragon"],
    );
    expect(slugs(out)).toEqual([
      "protect",
      "substitute",
      "recover",
      "wish",
    ]);
    expect(out).toHaveLength(4);
  });

  it("fills status by slug when none of the preferred slugs are present", () => {
    ensureLoaded();
    const out = compactMoves(
      [
        move("yawn", { type: "normal", category: "status" }),
        move("thunder-wave", { type: "electric", category: "status" }),
        move("toxic", { type: "poison", category: "status" }),
      ],
      ["normal"],
    );
    expect(slugs(out)).toEqual(["thunder-wave", "toxic", "yawn"]);
  });

  it("caps the whole result at 16 (6 STAB + 6 other + 4 status)", () => {
    ensureLoaded();
    const stab = Array.from({ length: 8 }, (_, i) =>
      move(`stab-${i}`, {
        type: "water",
        category: "special",
        power: 100 - i,
      }),
    );
    const other = Array.from({ length: 8 }, (_, i) =>
      move(`other-${i}`, {
        type: "normal",
        category: "physical",
        power: 90 - i,
      }),
    );
    const status = Array.from({ length: 8 }, (_, i) =>
      move(`status-${i}`, { type: "normal", category: "status" }),
    );
    const out = compactMoves(
      [...status, ...other, ...stab],
      ["water"],
    );
    expect(out).toHaveLength(16);
    expect(slugs(out).slice(0, 6)).toEqual([
      "stab-0",
      "stab-1",
      "stab-2",
      "stab-3",
      "stab-4",
      "stab-5",
    ]);
    expect(slugs(out).slice(6, 12)).toEqual([
      "other-0",
      "other-1",
      "other-2",
      "other-3",
      "other-4",
      "other-5",
    ]);
    expect(slugs(out).slice(12)).toEqual([
      "status-0",
      "status-1",
      "status-2",
      "status-3",
    ]);
  });

  it("dedupes by slug and keeps the higher-priority copy", () => {
    ensureLoaded();
    const out = compactMoves(
      [
        move("earthquake", {
          type: "ground",
          category: "physical",
          power: 80,
          method: "level-up",
        }),
        move("earthquake", {
          type: "ground",
          category: "physical",
          power: 100,
          method: "machine",
        }),
        move("protect", { type: "normal", category: "status" }),
        move("protect", { type: "normal", category: "status" }),
      ],
      ["ground"],
    );
    expect(slugs(out)).toEqual(["earthquake", "protect"]);
    expect(out.filter((m) => m.slug === "earthquake")).toHaveLength(1);
    expect(out.filter((m) => m.slug === "protect")).toHaveLength(1);
    expect(out[0]?.power).toBe(100);
  });

  it("still includes moves whose type or power is null", () => {
    ensureLoaded();
    const out = compactMoves(
      [
        move("hidden-power", {
          type: null,
          category: "special",
          power: null,
          method: "machine",
        }),
        move("dragon-claw", {
          type: "dragon",
          category: "physical",
          power: 80,
        }),
      ],
      ["dragon"],
    );
    expect(slugs(out)).toEqual(["dragon-claw", "hidden-power"]);
    expect(out[1]).toEqual(
      expect.objectContaining({
        slug: "hidden-power",
        type: null,
        power: null,
        category: "special",
      }),
    );
  });

  it("treats null-power STAB damaging as lower than numbered-power STAB", () => {
    ensureLoaded();
    const out = compactMoves(
      [
        move("mystery-fang", {
          type: "dark",
          category: "physical",
          power: null,
        }),
        move("crunch", { type: "dark", category: "physical", power: 80 }),
      ],
      ["dark"],
    );
    expect(slugs(out)).toEqual(["crunch", "mystery-fang"]);
  });
});
