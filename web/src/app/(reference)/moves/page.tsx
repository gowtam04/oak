/**
 * /moves — the Moves index. A flat A–Z enumeration of every move (each row a
 * crawlable link to its detail page), showing type + damage class + power when
 * the batched move summaries carried them.
 *
 * Index route config + dynamic-import-inside-async rules: see /pokedex/page.tsx.
 */

import type { Metadata } from "next";

import EntityIndexList from "@/components/reference/EntityIndexList";
import type {
  EntityIndexEntry,
  EntityIndexGroup,
} from "@/components/reference/EntityIndexList";
import type { MovesIndexData } from "@/lib/reference-pages-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Title-case a slug ("dynamic-punch" → "Dynamic Punch"). */
function titleCase(slug: string): string {
  return slug
    .split(/[-\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** First-letter bucket for the alphabetical grouping ("#" for non-letters). */
function letterOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

function toGroups(data: MovesIndexData): EntityIndexGroup[] {
  const byLetter = new Map<string, EntityIndexEntry[]>();
  const sorted = [...data.rows].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
  for (const r of sorted) {
    const meta =
      r.damageClass || r.power != null
        ? [
            r.damageClass ? titleCase(r.damageClass) : null,
            r.power != null ? `${r.power} BP` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;
    const entry: EntityIndexEntry = {
      href: `/moves/${r.slug}`,
      primary: r.displayName,
      ...(r.type ? { types: [r.type] } : {}),
      meta,
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
  const { loadMovesIndex } = await import("@/data/reference-pages");
  const data = await loadMovesIndex();
  return {
    title: "Moves — All Pokémon Moves",
    description: `Browse all ${data.rows.length} Pokémon moves — type, damage class, base power, and every Pokémon that can learn each one. Ask Oak for battle math on any of them.`,
    alternates: { canonical: "/moves" },
  };
}

export default async function MovesIndexPage() {
  const { loadMovesIndex } = await import("@/data/reference-pages");
  const data = await loadMovesIndex();

  return (
    <main className="ref-page">
      <h1 className="ref-hero__title">Moves</h1>
      <p className="ref-intro">
        Every move Oak knows, from priority jabs to setup and status. Each entry
        lists its type, damage class, base power, and the full roster of Pokémon
        that can learn it — the reasoning Oak draws on for damage calcs and
        moveset checks across Scarlet &amp; Violet, Champions, and Generations 5
        through 9.
      </p>
      <EntityIndexList groups={toGroups(data)} />
    </main>
  );
}
