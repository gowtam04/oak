"use client";

/**
 * useRefFilter — the generic client-side filter engine behind every reference
 * index explorer (/pokedex, /moves, /abilities, /items). One hook, one set of
 * filter semantics; each explorer just supplies how to read a row's searchable
 * text and its facet values.
 *
 * Filter semantics (all four explorers share these):
 *   - Search matches diacritic-folded, punctuation-stripped displayName + slug
 *     (so "Flabébé" / "Farfetch'd" match "flabebe" / "farfetchd").
 *   - Multi-select WITHIN one facet is OR; ACROSS facets and with the query is
 *     AND. A facet accessor may return several values for one row (a dual-type
 *     Pokémon) — the row matches the facet if ANY of its values is selected.
 *   - `searching` is true for a non-empty trimmed query; explorers use it to
 *     flatten their grouped view into one flat "N results" grid.
 *
 * Perf: the query is run through `useDeferredValue` so typing stays responsive
 * while the (memoized) filter pass over ~1000 rows catches up a frame later.
 *
 * Pure and platform-agnostic (React only, no db/repos/server-only imports) so
 * it and its helpers are unit-testable under jsdom.
 */

import { useCallback, useDeferredValue, useMemo, useState } from "react";

/** A single facet's value(s) for one row: one value, several, or none. */
type FacetValue = string | readonly string[] | null;

export interface RefFilterConfig<Row> {
  /** The strings a row's text query matches against (displayName, slug, …). */
  searchText: (row: Row) => string[];
  /**
   * Named facets. Each accessor returns the row's value(s) for that facet — a
   * single string (generation, category), an array (a Pokémon's two types), or
   * null when the row has no value for it. An empty object = search-only.
   */
  facets: Record<string, (row: Row) => FacetValue>;
}

export interface RefFilterState<Row> {
  query: string;
  setQuery: (q: string) => void;
  deferredQuery: string;
  selected: Record<string, ReadonlySet<string>>;
  toggle: (facetId: string, value: string) => void;
  clearAll: () => void;
  filtered: Row[];
  /** True while a non-empty trimmed query is in effect (drives flattening). */
  searching: boolean;
}

/**
 * Lowercase, strip diacritics (NFD + combining-mark removal), then drop every
 * non-alphanumeric character. "Flabébé" → "flabebe", "Farfetch'd" → "farfetchd",
 * "U-turn" → "uturn".
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * True if any haystack contains the normalized needle. An empty/whitespace/
 * punctuation-only needle (normalizes to "") matches everything — a no-op query.
 */
export function matchesQuery(haystacks: string[], needle: string): boolean {
  const n = normalizeSearch(needle);
  if (n === "") return true;
  return haystacks.some((h) => normalizeSearch(h).includes(n));
}

/** True if a row's facet value(s) intersect the selected set (OR-within-facet). */
function facetMatches(value: FacetValue, selected: ReadonlySet<string>): boolean {
  if (value == null) return false;
  if (typeof value === "string") return selected.has(value);
  return value.some((v) => selected.has(v));
}

export function useRefFilter<Row>(
  rows: readonly Row[],
  config: RefFilterConfig<Row>,
): RefFilterState<Row> {
  const facetKeys = useMemo(() => Object.keys(config.facets), [config]);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(facetKeys.map((k) => [k, new Set<string>()])),
  );

  const deferredQuery = useDeferredValue(query);

  const toggle = useCallback((facetId: string, value: string) => {
    setSelected((prev) => {
      const next = new Set(prev[facetId] ?? []);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [facetId]: next };
    });
  }, []);

  const clearAll = useCallback(() => {
    setQuery("");
    setSelected(() =>
      Object.fromEntries(facetKeys.map((k) => [k, new Set<string>()])),
    );
  }, [facetKeys]);

  const filtered = useMemo(() => {
    const activeFacets = Object.entries(selected).filter(
      ([, set]) => set.size > 0,
    );
    return rows.filter((row) => {
      if (!matchesQuery(config.searchText(row), deferredQuery)) return false;
      for (const [facetId, set] of activeFacets) {
        const accessor = config.facets[facetId];
        if (!accessor) continue;
        if (!facetMatches(accessor(row), set)) return false;
      }
      return true;
    });
  }, [rows, deferredQuery, selected, config]);

  const searching = deferredQuery.trim().length > 0;

  return {
    query,
    setQuery,
    deferredQuery,
    selected,
    toggle,
    clearAll,
    filtered,
    searching,
  };
}
