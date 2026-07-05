/**
 * /items — the Items index. A searchable A–Z enumeration of every held/battle
 * item, each row linking to its detail page. Grouping and search live in the
 * shared client NamesExplorer; this server page streams the raw name rows in.
 *
 * Index route config + dynamic-import-inside-async rules: see /pokedex/page.tsx.
 */

import type { Metadata } from "next";

import NamesExplorer from "@/components/reference/explorer/NamesExplorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      <NamesExplorer
        rows={data.rows}
        basePath="/items"
        noun="ITEMS"
        searchPlaceholder="Search items"
      />
    </main>
  );
}
