/**
 * /pokedex — the Pokédex index (the crawl entry point for every species page).
 * Enumerates the full scarlet-violet roster (plus a trailing "Other formats"
 * group for entities that exist only in other scopes) as a searchable,
 * generation-grouped card grid. All grouping/filtering lives in the client
 * PokedexExplorer; this server page just streams the raw index data into it.
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

import PokedexExplorer from "@/components/reference/explorer/PokedexExplorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      <PokedexExplorer data={data} />
    </main>
  );
}
