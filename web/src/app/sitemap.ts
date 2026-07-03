import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shards: 0 = static pages; 1 = pokemon, 2 = moves, 3 = abilities, 4 = items
// (filled by the reference-pages workstream via dynamic-imported repos — those
// imports MUST stay inside the function bodies; see CLAUDE.md env-throw gotcha).
export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  if (id === 0) {
    return [
      { url: `${SITE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
      { url: `${SITE_ORIGIN}/pokedex`, changeFrequency: "weekly", priority: 0.8 },
      { url: `${SITE_ORIGIN}/moves`, changeFrequency: "monthly", priority: 0.7 },
      { url: `${SITE_ORIGIN}/abilities`, changeFrequency: "monthly", priority: 0.7 },
      { url: `${SITE_ORIGIN}/items`, changeFrequency: "monthly", priority: 0.7 },
      { url: `${SITE_ORIGIN}/teams`, changeFrequency: "monthly", priority: 0.6 },
      { url: `${SITE_ORIGIN}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    ];
  }
  // TODO(reference-pages unit): shards 1–4 — entity URLs via dynamic-imported repos.
  return [];
}
