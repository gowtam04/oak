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
  // Next's own route layer (the generated `/sitemap/[__metadata_id__]` handler)
  // passes `id` through as a STRING (e.g. "1"), not the number `generateSitemaps`
  // returned — only direct in-process calls (like this file's unit test) get a
  // real number. Coerce once up front so every branch below is reachable; a
  // strict `id === 1` etc. against the string form silently falls through to
  // whichever branch happens to be last (it always "worked" in tests because
  // the test calls this function directly with numbers).
  const shardId = Number(id);

  if (shardId === 0) {
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

  // Shards 1–4 read the Postgres index. Both imports are dynamic and stay
  // INSIDE the function body — never top-level — so `next build`'s static
  // evaluation never touches @/data/db (server-only + a live DATABASE_URL) or
  // @/env (throws on a missing XAI_API_KEY); see CLAUDE.md's env-throw gotcha.
  // We call the *Uncached loaders (the same ones the /pokedex, /moves,
  // /abilities, /items index pages assemble their rows from) rather than
  // reimplementing repo calls, so a shard's URL set can never drift from what
  // its index page actually renders. A missing/unbuilt index is a genuine 500
  // for these shards, NOT an empty array: the loaders throw `index_unavailable`
  // in that case and we deliberately let it propagate here so a crawler
  // retries instead of caching an empty sitemap as "the site has zero
  // entities."
  const { db } = await import("@/data/db");
  const {
    loadPokedexIndexUncached,
    loadMovesIndexUncached,
    loadAbilitiesIndexUncached,
    loadItemsIndexUncached,
    referenceLastModifiedUncached,
  } = await import("@/data/reference-pages");

  const lastModified = (await referenceLastModifiedUncached(db)) ?? undefined;

  if (shardId === 1) {
    const { rows, extras } = await loadPokedexIndexUncached(db);
    return [...rows, ...extras].map((r) => ({
      url: `${SITE_ORIGIN}/pokedex/${r.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  }
  if (shardId === 2) {
    const { rows } = await loadMovesIndexUncached(db);
    return rows.map((r) => ({
      url: `${SITE_ORIGIN}/moves/${r.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  }
  if (shardId === 3) {
    const { rows } = await loadAbilitiesIndexUncached(db);
    return rows.map((r) => ({
      url: `${SITE_ORIGIN}/abilities/${r.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  }
  if (shardId === 4) {
    const { rows } = await loadItemsIndexUncached(db);
    return rows.map((r) => ({
      url: `${SITE_ORIGIN}/items/${r.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  }

  throw new Error(`unknown sitemap shard: ${id}`);
}
