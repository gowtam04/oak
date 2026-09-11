/**
 * Slash-discovery web search helper — fan-out `searchEntities` + merge.
 *
 * Contract (`docs/features/slash-discovery/architecture/design.md`):
 *   searchSlashDex(query, signal?): Promise<DexNameRow[]>
 *     Promise.all of searchEntities(kind, query, CHAMPIONS_FORMAT) for
 *     pokemon, move, ability, item. Per-kind slice 8. mergeDexNameRows(..., 8).
 *     Any kind fault → that kind []. Never throw.
 *   searchSlashUsage(query, signal?): Promise<DexNameRow[]>
 *     kind=pokemon only, cap 8.
 *
 * Maps SearchMatch { slug, display_name, kind, sprite_url? }
 *   → DexNameRow { slug, displayName, kind, spriteUrl? }.
 *
 * Debounce lives in Composer, not this helper.
 *
 * Refs: SD-BR-10, SD-BR-17, SD-US-3.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { CHAMPIONS_FORMAT } from "@/data/formats";
import type { SearchMatch } from "@/lib/api/search-client";

import { mergeDexNameRows, type DexNameRow } from "./slash-picker";

const search = vi.hoisted(() => ({ searchEntities: vi.fn() }));
vi.mock("@/lib/api/search-client", () => search);

import { searchSlashDex, searchSlashMove, searchSlashUsage } from "./slash-search";

const DEX_KINDS = ["pokemon", "move", "ability", "item"] as const;

afterEach(() => {
  search.searchEntities.mockReset();
});

function match(
  kind: SearchMatch["kind"],
  slug: string,
  display_name: string,
  sprite_url?: string,
): SearchMatch {
  const row: SearchMatch = { slug, display_name, kind };
  if (sprite_url) row.sprite_url = sprite_url;
  return row;
}

function toRow(m: SearchMatch): DexNameRow {
  const row: DexNameRow = {
    slug: m.slug,
    displayName: m.display_name,
    kind: m.kind as DexNameRow["kind"],
  };
  if (m.sprite_url) row.spriteUrl = m.sprite_url;
  return row;
}

function nMatches(kind: SearchMatch["kind"], n: number): SearchMatch[] {
  return Array.from({ length: n }, (_, i) =>
    match(kind, `${kind}-${i}`, `${kind} ${i}`),
  );
}

function mockByKind(byKind: Partial<Record<SearchMatch["kind"], SearchMatch[]>>) {
  search.searchEntities.mockImplementation(async (kind: SearchMatch["kind"]) => {
    return byKind[kind] ?? [];
  });
}

describe("searchSlashDex", () => {
  it("calls searchEntities for pokemon, move, ability, item in that order (SD-BR-17)", async () => {
    mockByKind({});
    await searchSlashDex("gar");
    expect(search.searchEntities.mock.calls.map((c) => c[0])).toEqual([
      ...DEX_KINDS,
    ]);
    for (const call of search.searchEntities.mock.calls) {
      expect(call[1]).toBe("gar");
      expect(call[2]).toBe(CHAMPIONS_FORMAT);
    }
    expect(search.searchEntities).toHaveBeenCalledTimes(4);
  });

  it("forwards a blank query (browse) on every kind", async () => {
    mockByKind({});
    await searchSlashDex("");
    expect(search.searchEntities).toHaveBeenCalledTimes(4);
    for (const call of search.searchEntities.mock.calls) {
      expect(call[1]).toBe("");
      expect(call[2]).toBe(CHAMPIONS_FORMAT);
    }
  });

  it("maps SearchMatch fields onto DexNameRow, including sprite_url (SD-US-3)", async () => {
    mockByKind({
      pokemon: [
        match(
          "pokemon",
          "garchomp",
          "Garchomp",
          "https://img.example/sprite/garchomp.png",
        ),
      ],
      move: [match("move", "earthquake", "Earthquake")],
    });
    const rows = await searchSlashDex("gar");
    expect(rows[0]).toEqual({
      slug: "garchomp",
      displayName: "Garchomp",
      kind: "pokemon",
      spriteUrl: "https://img.example/sprite/garchomp.png",
    });
    expect(rows[1]).toEqual({
      slug: "earthquake",
      displayName: "Earthquake",
      kind: "move",
    });
    expect(rows[1]!.spriteUrl).toBeUndefined();
  });

  it("slices each kind to 8 before merge, then caps the merge at 8, Pokémon-first (SD-BR-10, SD-BR-17)", async () => {
    const byKind = {
      pokemon: nMatches("pokemon", 9),
      move: nMatches("move", 9),
      ability: nMatches("ability", 9),
      item: nMatches("item", 9),
    };
    mockByKind(byKind);

    const rows = await searchSlashDex("q");
    const sliced = DEX_KINDS.map((kind) => ({
      kind,
      matches: byKind[kind].slice(0, 8).map(toRow),
    }));
    expect(rows).toEqual(mergeDexNameRows(sliced, 8));
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.kind === "pokemon")).toBe(true);
    expect(rows.map((r) => r.slug)).toEqual(
      nMatches("pokemon", 8).map((m) => m.slug),
    );
    expect(rows.some((r) => r.slug === "pokemon-8")).toBe(false);
  });

  it("fills remaining slots in Pokémon → move → ability → item order (SD-BR-17)", async () => {
    mockByKind({
      pokemon: nMatches("pokemon", 3),
      move: nMatches("move", 3),
      ability: nMatches("ability", 3),
      item: nMatches("item", 3),
    });
    const rows = await searchSlashDex("q");
    expect(rows.map((r) => r.kind)).toEqual([
      "pokemon",
      "pokemon",
      "pokemon",
      "move",
      "move",
      "move",
      "ability",
      "ability",
    ]);
    expect(rows).toHaveLength(8);
    expect(rows.some((r) => r.kind === "item")).toBe(false);
  });

  it("treats a rejecting kind as [] and still merges the rest — never throws", async () => {
    search.searchEntities.mockImplementation(async (kind: SearchMatch["kind"]) => {
      if (kind === "move") throw new Error("move search failed");
      return [match(kind, kind, kind)];
    });
    const rows = await searchSlashDex("q");
    expect(rows.map((r) => r.kind)).toEqual(["pokemon", "ability", "item"]);
    expect(rows.some((r) => r.kind === "move")).toBe(false);
  });

  it("returns [] when every kind is empty, and still never throws", async () => {
    mockByKind({});
    await expect(searchSlashDex("zzq")).resolves.toEqual([]);
  });

  it("returns [] when every kind rejects", async () => {
    search.searchEntities.mockRejectedValue(new Error("network"));
    await expect(searchSlashDex("gar")).resolves.toEqual([]);
  });

  it("accepts an AbortSignal without throwing", async () => {
    mockByKind({ pokemon: [match("pokemon", "garchomp", "Garchomp")] });
    const signal = new AbortController().signal;
    await expect(searchSlashDex("gar", signal)).resolves.toEqual([
      { slug: "garchomp", displayName: "Garchomp", kind: "pokemon" },
    ]);
  });
});

describe("searchSlashUsage", () => {
  it("calls searchEntities only for pokemon (SD-BR-12)", async () => {
    search.searchEntities.mockResolvedValue([
      match("pokemon", "garchomp", "Garchomp"),
    ]);
    const rows = await searchSlashUsage("garchomp");
    expect(search.searchEntities).toHaveBeenCalledTimes(1);
    expect(search.searchEntities).toHaveBeenCalledWith(
      "pokemon",
      "garchomp",
      CHAMPIONS_FORMAT,
    );
    expect(rows).toEqual([
      { slug: "garchomp", displayName: "Garchomp", kind: "pokemon" },
    ]);
  });

  it("caps usage rows at 8 (SD-BR-10)", async () => {
    search.searchEntities.mockResolvedValue(nMatches("pokemon", 10));
    const rows = await searchSlashUsage("a");
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.slug)).toEqual(
      nMatches("pokemon", 8).map((m) => m.slug),
    );
    expect(rows.some((r) => r.slug === "pokemon-8")).toBe(false);
  });

  it("maps sprite_url onto spriteUrl", async () => {
    search.searchEntities.mockResolvedValue([
      match(
        "pokemon",
        "garchomp",
        "Garchomp",
        "https://img.example/sprite/garchomp.png",
      ),
    ]);
    await expect(searchSlashUsage("gar")).resolves.toEqual([
      {
        slug: "garchomp",
        displayName: "Garchomp",
        kind: "pokemon",
        spriteUrl: "https://img.example/sprite/garchomp.png",
      },
    ]);
  });

  it("returns [] on empty matches", async () => {
    search.searchEntities.mockResolvedValue([]);
    await expect(searchSlashUsage("zzq")).resolves.toEqual([]);
  });

  it("returns [] and never throws when pokemon search rejects", async () => {
    search.searchEntities.mockRejectedValue(new Error("usage down"));
    await expect(searchSlashUsage("gar")).resolves.toEqual([]);
  });
});

describe("searchSlashMove", () => {
  it("calls searchEntities only for move", async () => {
    search.searchEntities.mockResolvedValue([
      match("move", "earthquake", "Earthquake"),
    ]);
    const rows = await searchSlashMove("earth");
    expect(search.searchEntities).toHaveBeenCalledTimes(1);
    expect(search.searchEntities).toHaveBeenCalledWith(
      "move",
      "earth",
      CHAMPIONS_FORMAT,
    );
    expect(rows).toEqual([
      { slug: "earthquake", displayName: "Earthquake", kind: "move" },
    ]);
  });

  it("caps move rows at 8 (SD-BR-10)", async () => {
    search.searchEntities.mockResolvedValue(nMatches("move", 10));
    const rows = await searchSlashMove("a");
    expect(rows).toHaveLength(8);
    expect(rows.map((row) => row.slug)).toEqual(
      nMatches("move", 8).map((m) => m.slug),
    );
  });

  it("returns [] and never throws when move search rejects", async () => {
    search.searchEntities.mockRejectedValue(new Error("move down"));
    await expect(searchSlashMove("earth")).resolves.toEqual([]);
  });
});
