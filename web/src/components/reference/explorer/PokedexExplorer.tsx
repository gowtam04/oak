"use client";

/**
 * PokedexExplorer — the hero of the reference section: the /pokedex index as a
 * searchable, facet-filterable, generation-grouped card grid of the current
 * Champions roster.
 *
 * Crawl-path contract (see PokemonCard): every species is a plain `<a>` present
 * in the server-rendered HTML. This is a client component only for interactivity
 * — Next SSRs it, so all roster anchors ship in the initial payload. Never swap
 * the cards for next/link (mass prefetch) or gate this behind next/dynamic
 * ssr:false (drops the anchors from the crawlable HTML).
 *
 * View states (shared index semantics):
 *   - idle (no query, no facet): generation sections for roster species.
 *   - facet-only: generation sections kept, empty ones dropped.
 *   - query: flattens to one dex-ordered "N results" grid.
 * Other-format extras are ignored even if the loader still ships an empty
 * `extras` array.
 */

import { useMemo } from "react";

import { TYPE_NAMES, type TypeName } from "@/agent/schemas";
import type { PokedexIndexData } from "@/lib/reference-pages-types";
import PokemonCard from "./PokemonCard";
import RefToolbar, { type ChipGroupSpec } from "./RefToolbar";
import { useRefFilter } from "./useRefFilter";

const EMPTY_SET: ReadonlySet<string> = new Set();

/** Upper national-dex bound for gens 1–8; anything above is gen 9. */
const GEN_UPPER = [151, 251, 386, 493, 649, 721, 809, 905];

/** National-dex number → its generation (1–9). */
function genNumber(dex: number): number {
  for (let i = 0; i < GEN_UPPER.length; i++) {
    if (dex <= GEN_UPPER[i]!) return i + 1;
  }
  return 9;
}

/** National-dex → generation label, for grouping the index rows. */
export function generationLabel(dex: number): string {
  return `Generation ${genNumber(dex)}`;
}

const ALL_GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const CONFIG = {
  searchText: (r: PokedexIndexData["rows"][number]) => [r.displayName, r.slug],
  facets: {
    type: (r: PokedexIndexData["rows"][number]) => r.types,
    generation: (r: PokedexIndexData["rows"][number]) =>
      String(genNumber(r.dexNumber)),
  },
};

const TYPE_OPTIONS = TYPE_NAMES.map((t: TypeName) => ({
  value: t,
  label: t,
  swatch: t,
}));

const GEN_OPTIONS = ALL_GENS.map((n) => ({
  value: String(n),
  label: `Gen ${n}`,
}));

export default function PokedexExplorer({ data }: { data: PokedexIndexData }) {
  const { query, setQuery, selected, toggle, clearAll, filtered, searching } =
    useRefFilter(data.rows, CONFIG);

  const anyFacet = useMemo(
    () => Object.values(selected).some((s) => s.size > 0),
    [selected],
  );
  const active = searching || anyFacet;

  const byGen = useMemo(() => {
    const map = new Map<number, typeof filtered>();
    for (const r of filtered) {
      const n = genNumber(r.dexNumber);
      const list = map.get(n);
      if (list) list.push(r);
      else map.set(n, [r]);
    }
    return map;
  }, [filtered]);

  const groups: ChipGroupSpec[] = [
    {
      id: "type",
      label: "Filter by type",
      options: TYPE_OPTIONS,
      selected: selected.type ?? EMPTY_SET,
      onToggle: (v) => toggle("type", v),
    },
    {
      id: "generation",
      label: "Filter by generation",
      options: GEN_OPTIONS,
      selected: selected.generation ?? EMPTY_SET,
      onToggle: (v) => toggle("generation", v),
    },
  ];

  const shownCount = filtered.length;
  const totalCount = data.rows.length;
  const empty = active && shownCount === 0;

  return (
    <>
      <RefToolbar
        query={query}
        onQuery={setQuery}
        searchPlaceholder="Search Pokémon"
        groups={groups}
        count={active ? shownCount : totalCount}
        noun="POKÉMON"
        active={active}
        onClear={clearAll}
      />

      {empty ? (
        <div className="ref-empty ref-card" data-testid="ref-empty">
          <p className="ref-empty__text">
            Nothing on the Champions roster matched.
          </p>
          <button type="button" className="ref-empty__clear" onClick={clearAll}>
            Clear filters
          </button>
        </div>
      ) : searching ? (
        <section className="ref-explorer__section">
          <ul className="ref-cardgrid">
            {filtered.map((r) => (
              <PokemonCard key={r.slug} row={r} />
            ))}
          </ul>
        </section>
      ) : (
        <>
          {ALL_GENS.map((n) => {
            const rows = byGen.get(n);
            if (!rows || rows.length === 0) return null;
            return (
              <section key={n} className="ref-explorer__section">
                <h2 className="ref-genhead">
                  Generation {n} <span className="ref-genhead__count">· {rows.length}</span>
                </h2>
                <ul className="ref-cardgrid">
                  {rows.map((r) => (
                    <PokemonCard key={r.slug} row={r} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
