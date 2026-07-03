/**
 * /abilities — the Abilities index. A flat A–Z enumeration of every ability,
 * each row linking to its detail page (effect + the Pokémon that have it).
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
  const { loadAbilitiesIndex } = await import("@/data/reference-pages");
  const data = await loadAbilitiesIndex();
  return {
    title: "Abilities — All Pokémon Abilities",
    description: `Browse all ${data.rows.length} Pokémon abilities — what each one does and every Pokémon that can have it. Ask Oak how any ability interacts in battle.`,
    alternates: { canonical: "/abilities" },
  };
}

export default async function AbilitiesIndexPage() {
  const { loadAbilitiesIndex } = await import("@/data/reference-pages");
  const data = await loadAbilitiesIndex();

  return (
    <main className="ref-page">
      <h1 className="ref-hero__title">Abilities</h1>
      <p className="ref-intro">
        Every Pokémon ability Oak can reason about, with its effect and the
        Pokémon that carry it. Abilities are where a lot of Oak&apos;s battle
        reasoning starts — how they change damage, weather, priority, and switch
        math across Scarlet &amp; Violet, Champions, and Generations 5 through 9.
      </p>
      <EntityIndexList groups={toGroups(data, "/abilities")} />
    </main>
  );
}
