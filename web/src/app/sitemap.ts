import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shards: 0 = static pages; 1 = pokemon, 2 = moves, 3 = abilities, 4 = items
// (filled by the reference-pages workstream via dynamic-imported repos — those
// imports MUST stay inside the function bodies; see CLAUDE.md env-throw gotcha).
// Smogon OU shard 5 is retired (ADR-5) — Usage is a static /usage URL on shard 0.
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
      { url: `${SITE_ORIGIN}/usage`, changeFrequency: "hourly", priority: 0.7 },
      { url: `${SITE_ORIGIN}/teams`, changeFrequency: "monthly", priority: 0.6 },
      { url: `${SITE_ORIGIN}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    ];
  }

  // Shards 1–4 read the Champions Postgres index. Imports stay INSIDE the
  // function body so `next build` never evaluates @/data/db / @/env. A
  // missing/unbuilt Champions index is a genuine 500 (crawler retries), not
  // an empty sitemap.
  const { db } = await import("@/data/db");
  const { CHAMPIONS_FORMAT } = await import("@/data/formats");
  const { isIndexAvailable } = await import("@/data/entity-profile");
  if (!(await isIndexAvailable(CHAMPIONS_FORMAT, db))) {
    throw new Error("index_unavailable");
  }
  const { ingest_meta } = await import("@/data/schema");
  const { eq } = await import("drizzle-orm");
  let lastModified: Date | undefined;
  try {
    const rows = await db
      .select({ ts: ingest_meta.last_success_at })
      .from(ingest_meta)
      .where(eq(ingest_meta.format, CHAMPIONS_FORMAT))
      .limit(1);
    const ts = rows[0]?.ts;
    lastModified = ts != null ? new Date(ts) : undefined;
  } catch {
    lastModified = undefined;
  }

  if (shardId === 1) {
    const { listAllPokemon } = await import("@/data/repos/pokedex-repo");
    const rows = await listAllPokemon(CHAMPIONS_FORMAT, db);
    return rows.map((r) => ({
      url: `${SITE_ORIGIN}/pokedex/${r.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  }
  if (shardId === 2) {
    const { listNamesByKind } = await import("@/data/repos/reference-cache");
    const rows = await listNamesByKind("move", CHAMPIONS_FORMAT, db);
    return rows.map((r) => ({
      url: `${SITE_ORIGIN}/moves/${r.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  }
  if (shardId === 3) {
    const { listNamesByKind } = await import("@/data/repos/reference-cache");
    const rows = await listNamesByKind("ability", CHAMPIONS_FORMAT, db);
    return rows.map((r) => ({
      url: `${SITE_ORIGIN}/abilities/${r.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  }
  if (shardId === 4) {
    const { listNamesByKind } = await import("@/data/repos/reference-cache");
    const rows = await listNamesByKind("item", CHAMPIONS_FORMAT, db);
    return rows.map((r) => ({
      url: `${SITE_ORIGIN}/items/${r.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  }

  throw new Error(`unknown sitemap shard: ${id}`);
}
