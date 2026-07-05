"use client";

/**
 * NamesExplorer — the /abilities and /items indexes: a search-only, letter-
 * grouped grid of quiet link cards (these datasets carry no facets, so none are
 * faked). Shared by both routes via `basePath` + `noun`.
 *
 * Crawl-path contract: every entity is a plain `<a>` in the server-rendered HTML
 * (Next SSRs this client component). Never a per-row next/link or next/dynamic
 * ssr:false — see PokemonCard's note.
 *
 * View states: letter-grouped when unsearched; a query flattens to one
 * alphabetical "N results" grid.
 */

import { useMemo } from "react";

import type { NameRow } from "@/lib/reference-pages-types";
import RefToolbar from "./RefToolbar";
import { useRefFilter } from "./useRefFilter";

const CONFIG = {
  searchText: (r: NameRow) => [r.displayName, r.slug],
  facets: {},
};

/** First-letter bucket for the alphabetical grouping ("#" for non-letters). */
function letterOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

function NameCard({ row, basePath }: { row: NameRow; basePath: string }) {
  return (
    <li className="ref-cardcell">
      <a href={`${basePath}/${row.slug}`} className="ref-card ref-namecard">
        {row.displayName}
      </a>
    </li>
  );
}

export interface NamesExplorerProps {
  rows: NameRow[];
  /** "/abilities" | "/items" — the detail-page href base. */
  basePath: string;
  /** Idle count noun, e.g. "ABILITIES" / "ITEMS". */
  noun: string;
  /** Search-field placeholder, e.g. "Search abilities". */
  searchPlaceholder: string;
}

export default function NamesExplorer({
  rows,
  basePath,
  noun,
  searchPlaceholder,
}: NamesExplorerProps) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [rows],
  );

  const { query, setQuery, clearAll, filtered, searching } = useRefFilter(
    sorted,
    CONFIG,
  );

  const byLetter = useMemo(() => {
    const map = new Map<string, NameRow[]>();
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

  const empty = searching && filtered.length === 0;

  return (
    <>
      <RefToolbar
        query={query}
        onQuery={setQuery}
        searchPlaceholder={searchPlaceholder}
        groups={[]}
        count={searching ? filtered.length : sorted.length}
        noun={noun}
        active={searching}
        onClear={clearAll}
      />

      {empty ? (
        <div className="ref-empty ref-card" data-testid="ref-empty">
          <p className="ref-empty__text">Nothing matches your search.</p>
          <button type="button" className="ref-empty__clear" onClick={clearAll}>
            Clear search
          </button>
        </div>
      ) : searching ? (
        <section className="ref-explorer__section">
          <ul className="ref-namegrid">
            {filtered.map((r) => (
              <NameCard key={r.slug} row={r} basePath={basePath} />
            ))}
          </ul>
        </section>
      ) : (
        byLetter.map(({ letter, rows: letterRows }) => (
          <section key={letter} className="ref-explorer__section">
            <h2 className="ref-genhead">{letter}</h2>
            <ul className="ref-namegrid">
              {letterRows.map((r) => (
                <NameCard key={r.slug} row={r} basePath={basePath} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
