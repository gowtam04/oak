/**
 * /abilities — the Abilities index. A searchable A–Z enumeration of every
 * Champions ability, each row linking to its detail page. Grouping and search
 * live in the shared client NamesExplorer; this server page streams the raw
 * name rows in.
 *
 * Index route config + dynamic-import-inside-async rules: see /pokedex/page.tsx.
 */

import type { Metadata } from "next";

import NamesExplorer from "@/components/reference/explorer/NamesExplorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { loadAbilitiesIndex } = await import("@/data/reference-pages");
  const data = await loadAbilitiesIndex();
  return {
    title: "Abilities — Pokémon Champions",
    description: `Browse all ${data.rows.length} Champions abilities — what each one does and every Pokémon that can have it. Ask Oak how any ability interacts in battle.`,
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
        Every Pokémon ability on the current Champions roster, with its effect
        and the Pokémon that carry it. Abilities are where a lot of Oak&apos;s
        battle reasoning starts — how they change damage, weather, priority, and
        switch math.
      </p>
      <NamesExplorer
        rows={data.rows}
        basePath="/abilities"
        noun="ABILITIES"
        searchPlaceholder="Search abilities"
      />
    </main>
  );
}
