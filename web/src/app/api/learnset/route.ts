/**
 * `GET /api/learnset` — the team builder's per-species legal-movepool lookup.
 *
 * A team member's Move pickers must offer ONLY the moves that member's species
 * can actually learn in the active format (not the whole move index). The client
 * resolves that movepool here, once per focused species, and feeds it to the
 * pickers as a static option list.
 *
 *   ?pokemon=<species slug>                (e.g. "swampert-mega")
 *   ?format=scarlet-violet|champions        (snapshot at open time, BR-AV-7)
 *
 * Response (always a 200 for in-domain results, mirroring /api/sprites):
 *   - 200 { moves: { slug, display_name, type?, damage_class?, power? }[] }
 *     (unknown species ⇒ empty list; the F1 metadata fields ride along from the
 *     reference cache and are simply absent for a move with no cached detail)
 *   - 400 { error } for a malformed/missing param
 *
 * No auth gate — public Pokédex data; works for guests. Never throws for
 * in-domain misses: an unreadable index degrades to `{ moves: [] }`. `@/data/db`
 * (and its repo dependents) import `@/env` at module load, so they are
 * DYNAMICALLY imported inside the handler — keeping `next build` from evaluating
 * `env` (cf. the sprites / entity / chat routes).
 */

import { json, retryAfterHeader } from "@/app/api/auth/_lib/http";
import { isFormat, type Format } from "@/data/formats";
import { checkRateLimit, PUBLIC_READ_CONFIG } from "@/server/rate-limit";
import { clientIp } from "@/server/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // Rate-limit BEFORE any dynamic import / DB work (EDGE-02) — public,
  // unauthenticated GET on the shared pool; shares the `pub:<ip>` bucket.
  const gate = await checkRateLimit(`pub:${clientIp(req)}`, "", PUBLIC_READ_CONFIG);
  if (!gate.allowed) {
    const retryAfterMs =
      gate.reason === "rate_limited" ? gate.retryAfterMs : 0;
    return json(
      429,
      { error: "rate_limited" },
      retryAfterHeader(retryAfterMs),
    );
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("pokemon")?.trim() ?? "";
  const formatParam = url.searchParams.get("format")?.trim() ?? "";

  if (slug.length === 0) return json(400, { error: "missing_pokemon" });
  if (!isFormat(formatParam)) return json(400, { error: "invalid_format" });

  const format = formatParam as Format;

  try {
    const { db } = await import("@/data/db");
    const { movesForPokemon } = await import("@/data/repos/learnset-repo");
    const { moveSummaries } = await import("@/data/repos/reference-cache");

    const learned = await movesForPokemon(slug, format, db);
    const summaries = await moveSummaries(
      learned.map((m) => m.moveSlug),
      format,
      db,
    );
    // Hydrate display names (fall back to the slug) + the F1 metadata fields
    // (type/damage_class/power, absent when the move has no cached detail),
    // then sort by display name for a stable, friendly dropdown order.
    const moves = learned
      .map((m) => {
        const summary = summaries.get(m.moveSlug);
        return {
          slug: m.moveSlug,
          display_name: summary?.displayName ?? m.moveSlug,
          // summary is either absent (field truly unknown ⇒ undefined, drops
          // out of the JSON body) or present with damageClass/power already
          // normalized to `null` (never undefined) by moveSummaries.
          type: summary?.type,
          damage_class: summary?.damageClass,
          power: summary?.power,
        };
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name));

    return json(200, { moves });
  } catch (err) {
    // Transport/DB fault — degrade to an empty list (the pickers stay usable,
    // just unfiltered-empty) rather than a 500.
    const { logger } = await import("@/server/logger");
    logger.error({
      event: "learnset_fetch_failed",
      pokemon: slug,
      format,
      err: err instanceof Error ? err.message : String(err),
    });
    return json(200, { moves: [] });
  }
}
