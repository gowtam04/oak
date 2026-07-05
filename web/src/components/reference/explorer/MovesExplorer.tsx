"use client";

/**
 * MovesExplorer — the /moves index as searchable, facet-filterable dense
 * instrument rows (name · type badge · category tag · right-aligned power).
 *
 * Crawl-path contract: every move is a plain `<a>` in the server-rendered HTML
 * (Next SSRs this client component). Never a per-row next/link or next/dynamic
 * ssr:false — see PokemonCard's note.
 *
 * View states: letter-grouped when unfiltered; facet-only keeps letter headings
 * (empty ones dropped); a query flattens to one alphabetical "N results" list.
 */

import { useMemo } from "react";

import { TYPE_NAMES, type TypeName } from "@/agent/schemas";
import TypeBadge from "@/components/TypeBadge";
import type { MoveIndexRow } from "@/lib/reference-pages-types";
import RefToolbar, { type ChipGroupSpec } from "./RefToolbar";
import { useRefFilter } from "./useRefFilter";

const EMPTY_SET: ReadonlySet<string> = new Set();

const CONFIG = {
  searchText: (r: MoveIndexRow) => [r.displayName, r.slug],
  facets: {
    type: (r: MoveIndexRow) => r.type ?? null,
    category: (r: MoveIndexRow) => r.damageClass ?? null,
  },
};

const TYPE_OPTIONS = TYPE_NAMES.map((t: TypeName) => ({
  value: t,
  label: t,
  swatch: t,
}));

const CATEGORY_OPTIONS = [
  { value: "physical", label: "Physical" },
  { value: "special", label: "Special" },
  { value: "status", label: "Status" },
];

/** First-letter bucket for the alphabetical grouping ("#" for non-letters). */
function letterOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

function MoveRow({ row }: { row: MoveIndexRow }) {
  return (
    <li className="ref-moverow-item">
      <a href={`/moves/${row.slug}`} className="ref-moverow">
        <span className="ref-moverow__name">{row.displayName}</span>
        <span className="ref-moverow__type">
          {row.type && <TypeBadge type={row.type as TypeName} />}
        </span>
        <span className="ref-moverow__cat">{row.damageClass ?? ""}</span>
        <span className="ref-moverow__power">
          {row.power != null ? row.power : "—"}
        </span>
      </a>
    </li>
  );
}

export default function MovesExplorer({ rows }: { rows: MoveIndexRow[] }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [rows],
  );

  const { query, setQuery, selected, toggle, clearAll, filtered, searching } =
    useRefFilter(sorted, CONFIG);

  const anyFacet = useMemo(
    () => Object.values(selected).some((s) => s.size > 0),
    [selected],
  );
  const active = searching || anyFacet;

  const byLetter = useMemo(() => {
    const map = new Map<string, MoveIndexRow[]>();
    for (const r of filtered) {
      const key = letterOf(r.displayName);
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return [...map.keys()].sort().map((letter) => ({
      letter,
      rows: map.get(letter)!,
    }));
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
      id: "category",
      label: "Filter by category",
      options: CATEGORY_OPTIONS,
      selected: selected.category ?? EMPTY_SET,
      onToggle: (v) => toggle("category", v),
    },
  ];

  const empty = active && filtered.length === 0;

  return (
    <>
      <RefToolbar
        query={query}
        onQuery={setQuery}
        searchPlaceholder="Search moves"
        groups={groups}
        count={active ? filtered.length : sorted.length}
        noun="MOVES"
        active={active}
        onClear={clearAll}
      />

      {empty ? (
        <div className="ref-empty ref-card" data-testid="ref-empty">
          <p className="ref-empty__text">No moves match your filters.</p>
          <button type="button" className="ref-empty__clear" onClick={clearAll}>
            Clear filters
          </button>
        </div>
      ) : searching ? (
        <section className="ref-explorer__section">
          <ul className="ref-moverows">
            {filtered.map((r) => (
              <MoveRow key={r.slug} row={r} />
            ))}
          </ul>
        </section>
      ) : (
        byLetter.map(({ letter, rows: letterRows }) => (
          <section key={letter} className="ref-explorer__section">
            <h2 className="ref-genhead">{letter}</h2>
            <ul className="ref-moverows">
              {letterRows.map((r) => (
                <MoveRow key={r.slug} row={r} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
