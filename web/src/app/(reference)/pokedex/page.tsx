/**
 * /pokedex — the Pokédex index (the crawl entry point for every species page).
 * Enumerates the full scarlet-violet roster grouped by generation, then appends
 * a final "Other formats" group for entities that exist only in other scopes
 * (Megas, past-gen-only forms) so they still get a crawlable link.
 *
 * Index route: `runtime = "nodejs"` + `dynamic = "force-dynamic"` — a
 * `revalidate` export on a static route would force build-time prerender, which
 * would evaluate `@/env` (throws without XAI_API_KEY) and `@/data/db`. The
 * loader is dynamically imported INSIDE the async functions for the same reason
 * (never top-level), and is itself `unstable_cache`-wrapped so per-request
 * renders don't re-enumerate the dex. An unbuilt index throws (→ 500), never a
 * soft-200 empty page.
 */

import type { Metadata } from "next";

import EntityIndexList from "@/components/reference/EntityIndexList";
import type {
  EntityIndexEntry,
  EntityIndexGroup,
} from "@/components/reference/EntityIndexList";
import { scopeLabelShort } from "@/lib/scope/scope-label";
import type { Format } from "@/data/formats";
import type { PokedexIndexData } from "@/lib/reference-pages-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** National-dex → generation label, for grouping the index rows. */
function generationLabel(dex: number): string {
  if (dex <= 151) return "Generation 1";
  if (dex <= 251) return "Generation 2";
  if (dex <= 386) return "Generation 3";
  if (dex <= 493) return "Generation 4";
  if (dex <= 649) return "Generation 5";
  if (dex <= 721) return "Generation 6";
  if (dex <= 809) return "Generation 7";
  if (dex <= 905) return "Generation 8";
  return "Generation 9";
}

/** Assemble the generation-grouped groups + a trailing cross-format group. */
function toGroups(data: PokedexIndexData): EntityIndexGroup[] {
  const byGen = new Map<string, EntityIndexEntry[]>();
  for (const r of data.rows) {
    const label = generationLabel(r.dexNumber);
    const entry: EntityIndexEntry = {
      href: `/pokedex/${r.slug}`,
      primary: r.displayName,
      secondary: `#${r.dexNumber}`,
      types: r.types,
      meta: `${r.baseStatTotal} BST`,
    };
    const list = byGen.get(label);
    if (list) list.push(entry);
    else byGen.set(label, [entry]);
  }

  const groups: EntityIndexGroup[] = [...byGen.entries()].map(
    ([heading, entries]) => ({ heading, entries }),
  );

  if (data.extras.length > 0) {
    groups.push({
      heading: "Other formats",
      entries: data.extras.map((e) => ({
        href: `/pokedex/${e.slug}`,
        primary: e.displayName,
        meta: scopeLabelShort(e.sourceFormat as Format),
      })),
    });
  }
  return groups;
}

export async function generateMetadata(): Promise<Metadata> {
  const { loadPokedexIndex } = await import("@/data/reference-pages");
  const data = await loadPokedexIndex();
  const count = data.rows.length + data.extras.length;
  return {
    title: "Pokédex — All Pokémon",
    description: `Browse all ${count} Pokémon Oak covers across Scarlet & Violet, Pokémon Champions, and Generations 5–9 — base stats, types, abilities, and full movesets.`,
    alternates: { canonical: "/pokedex" },
  };
}

export default async function PokedexIndexPage() {
  const { loadPokedexIndex } = await import("@/data/reference-pages");
  const data = await loadPokedexIndex();

  return (
    <main className="ref-page">
      <h1 className="ref-hero__title">Pokédex</h1>
      <p className="ref-intro">
        Every Pokémon Oak can reason about, grouped by generation. Oak covers
        the Scarlet &amp; Violet roster, the Pokémon Champions competitive pool,
        and mainline Generations 5 through 9 — tap any species for its base
        stats, type matchups, abilities, evolution line, and complete learnset.
      </p>
      <EntityIndexList groups={toGroups(data)} />
    </main>
  );
}
