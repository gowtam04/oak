import { afterEach, describe, it, expect } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import {
  normalizeSearch,
  matchesQuery,
  useRefFilter,
  type RefFilterConfig,
} from "./useRefFilter";

interface Mon {
  name: string;
  types: string[];
  gen: string;
}

const ROWS: Mon[] = [
  { name: "Charmander", types: ["fire"], gen: "1" },
  { name: "Squirtle", types: ["water"], gen: "1" },
  { name: "Charizard", types: ["fire", "flying"], gen: "6" },
  { name: "Chespin", types: ["grass"], gen: "6" },
];

const CONFIG: RefFilterConfig<Mon> = {
  searchText: (r) => [r.name],
  facets: {
    type: (r) => r.types,
    gen: (r) => r.gen,
  },
};

describe("normalizeSearch", () => {
  it("folds diacritics and strips punctuation/whitespace", () => {
    expect(normalizeSearch("Flabébé")).toBe("flabebe");
    expect(normalizeSearch("Farfetch'd")).toBe("farfetchd");
    expect(normalizeSearch("U-turn")).toBe("uturn");
    expect(normalizeSearch("   ")).toBe("");
  });
});

describe("matchesQuery", () => {
  it("matches on any diacritic-folded haystack", () => {
    expect(matchesQuery(["Flabébé", "flabebe-blue"], "flabebe")).toBe(true);
    expect(matchesQuery(["Pikachu"], "char")).toBe(false);
  });

  it("treats an empty/punctuation-only needle as a no-op match", () => {
    expect(matchesQuery(["anything"], "   ")).toBe(true);
    expect(matchesQuery(["anything"], "'")).toBe(true);
  });
});

describe("useRefFilter", () => {
  it("is idle (all rows, not searching) before any input", () => {
    const { result } = renderHook(() => useRefFilter(ROWS, CONFIG));
    expect(result.current.filtered).toHaveLength(4);
    expect(result.current.searching).toBe(false);
  });

  it("OR-matches within a facet (incl. multi-valued rows)", () => {
    const { result } = renderHook(() => useRefFilter(ROWS, CONFIG));
    act(() => result.current.toggle("type", "fire"));
    // Charmander (fire) + Charizard (fire/flying via array OR).
    expect(result.current.filtered.map((r) => r.name)).toEqual([
      "Charmander",
      "Charizard",
    ]);

    act(() => result.current.toggle("type", "water"));
    expect(result.current.filtered.map((r) => r.name)).toEqual([
      "Charmander",
      "Squirtle",
      "Charizard",
    ]);
  });

  it("AND-matches across facets", () => {
    const { result } = renderHook(() => useRefFilter(ROWS, CONFIG));
    act(() => result.current.toggle("type", "fire"));
    act(() => result.current.toggle("gen", "6"));
    expect(result.current.filtered.map((r) => r.name)).toEqual(["Charizard"]);
  });

  it("clearAll resets the query and every facet", () => {
    const { result } = renderHook(() => useRefFilter(ROWS, CONFIG));
    act(() => result.current.toggle("type", "fire"));
    act(() => result.current.setQuery("char"));
    act(() => result.current.clearAll());
    expect(result.current.query).toBe("");
    expect(result.current.filtered).toHaveLength(4);
    expect(result.current.searching).toBe(false);
  });

  it("sets searching only for a non-empty trimmed query", () => {
    const { result } = renderHook(() => useRefFilter(ROWS, CONFIG));
    act(() => result.current.setQuery("char"));
    expect(result.current.searching).toBe(true);
    expect(result.current.filtered.map((r) => r.name)).toEqual([
      "Charmander",
      "Charizard",
    ]);

    act(() => result.current.setQuery("   "));
    expect(result.current.searching).toBe(false);
  });
});
