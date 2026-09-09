/**
 * /moves — the Moves index. A searchable, type/category-filterable enumeration
 * of every Champions move (each row a crawlable link to its detail page). All
 * grouping and filtering lives in the client MovesExplorer; this server page
 * streams the raw index rows into it.
 *
 * Index route config + dynamic-import-inside-async rules: see /pokedex/page.tsx.
 */

import type { Metadata } from "next";

import MovesExplorer from "@/components/reference/explorer/MovesExplorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { loadMovesIndex } = await import("@/data/reference-pages");
  const data = await loadMovesIndex();
  return {
    title: "Moves — Pokémon Champions",
    description: `Browse all ${data.rows.length} Champions moves — type, damage class, base power, and every Pokémon that can learn each one. Ask Oak for battle math on any of them.`,
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
        Every move available in Pokémon Champions, from priority jabs to setup
        and status. Each entry lists its type, damage class, base power, and the
        roster of Champions Pokémon that can learn it.
      </p>
      <MovesExplorer rows={data.rows} />
    </main>
  );
}
