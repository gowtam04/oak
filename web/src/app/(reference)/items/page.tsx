/**
 * /items — the Items index. A flat A–Z enumeration of every held/battle item,
 * each row linking to its detail page (effect + which forms require it).
 *
 * Index route config + dynamic-import-inside-async rules: see /pokedex/page.tsx.
 */

import type { Metadata } from "next";

import EntityIndexList from "@/components/reference/EntityIndexList";
import type {
  EntityIndexEntry,
  EntityIndexGroup,
} from "@/components/reference/EntityIndexList";
import type { NamesIndexData } from "@/lib/reference-pages-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** First-letter bucket for the alphabetical grouping ("#" for non-letters). */
function letterOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

function toGroups(data: NamesIndexData, hrefBase: string): EntityIndexGroup[] {
  const byLetter = new Map<string, EntityIndexEntry[]>();
  const sorted = [...data.rows].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
  for (const r of sorted) {
    const entry: EntityIndexEntry = {
      href: `${hrefBase}/${r.slug}`,
      primary: r.displayName,
    };
    const key = letterOf(r.displayName);
    const list = byLetter.get(key);
    if (list) list.push(entry);
    else byLetter.set(key, [entry]);
  }
  return [...byLetter.keys()]
    .sort()
    .map((heading) => ({ heading, entries: byLetter.get(heading)! }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { loadItemsIndex } = await import("@/data/reference-pages");
  const data = await loadItemsIndex();
  return {
    title: "Items — All Pokémon Held Items",
    description: `Browse all ${data.rows.length} Pokémon items — what each held or battle item does and the forms that require it. Ask Oak how any item factors into a set.`,
    alternates: { canonical: "/items" },
  };
}

export default async function ItemsIndexPage() {
  const { loadItemsIndex } = await import("@/data/reference-pages");
  const data = await loadItemsIndex();

  return (
    <main className="ref-page">
      <h1 className="ref-hero__title">Items</h1>
      <p className="ref-intro">
        Every held and battle item Oak can reason about, with its effect and the
        forms that require it (Mega stones and the like). Items shape damage,
        speed, and survivability — Oak factors them into team building and calcs
        across Scarlet &amp; Violet, Champions, and Generations 5 through 9.
      </p>
      <EntityIndexList groups={toGroups(data, "/items")} />
    </main>
  );
}
