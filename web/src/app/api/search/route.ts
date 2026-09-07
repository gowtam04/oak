/**
 * `GET /api/search` — name→candidate typeahead for the team builder's pickers.
 *
 *   ?kind=pokemon|move|ability|item|type
 *   ?q=<partial display name or slug>
 *   ?format=scarlet-violet|champions
 *
 * A thin, public (no-auth — Pokédex data) wrapper over the in-memory fuzzy
 * `resolveEntity` index (the same matcher behind `resolve_entity` / `/api/entity`).
 * It returns a ranked, slug-bearing match list so the EntityPicker can show
 * display names while storing canonical slugs — no more typing raw slugs.
 *
 * Responses (all in-domain results ride a 200, mirroring `/api/entity`):
 *   - 200 { matches: { slug, display_name, kind, sprite_url? }[] }
 *           typed: ≤ LIMIT best-first; blank query: the full kind, alphabetical
 *           (Dex browse + picker focus). `sprite_url` is present only on
 *           pokemon matches that resolve to a `pokemon` row.
 *   - 400 { error }         for a malformed/missing kind or format
 *
 * Never throws for in-domain misses: an unreadable index degrades to an empty
 * match list. `@/data/db` (and its repo dependents) import `@/env` at module
 * load, so they are DYNAMICALLY imported inside the handler — keeping `next
 * build` from evaluating `env` (cf. the entity / sprites / chat routes).
 */

import { json, retryAfterHeader } from "@/app/api/auth/_lib/http";
import { isFormat, type Format } from "@/data/formats";
import { ENTITY_KINDS, type EntityKind } from "@/agent/schemas";
import { checkRateLimit, PUBLIC_READ_CONFIG } from "@/server/rate-limit";
import { clientIp } from "@/server/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<string>(ENTITY_KINDS);

/** Max matches returned per typed query — enough for a dropdown, bounds abuse. */
const LIMIT = 8;

/** Cap the query length — names are short; this bounds fuse.js work. */
const MAX_Q = 64;

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
  const kindParam = url.searchParams.get("kind")?.trim() ?? "";
  const q = (url.searchParams.get("q")?.trim() ?? "").slice(0, MAX_Q);
  const formatParam = url.searchParams.get("format")?.trim() ?? "";

  // --- Param validation (a bad kind/format is a real 4xx, not an envelope) ---
  if (!KINDS.has(kindParam)) return json(400, { error: "invalid_kind" });
  if (!isFormat(formatParam)) return json(400, { error: "invalid_format" });

  const kind = kindParam as EntityKind;
  const format = formatParam as Format;

  try {
    const repo = await import("@/data/repos/resolve-index");
    // A blank query lists the full kind alphabetically (Dex browse + picker
    // focus). A typed query fuzzy-ranks the best matches (capped).
    const { matches } =
      q.length === 0
        ? await repo.listEntities(kind, undefined, format)
        : await repo.resolveEntity(q, kind, LIMIT, format);

    // Sprite thumbs are additive: a lookup fault must not wipe name matches.
    let sprites = new Map<string, string>();
    if (kind === "pokemon" && matches.length > 0) {
      try {
        const { db } = await import("@/data/db");
        const { spriteUrlsByIds } = await import("@/data/repos/pokedex-repo");
        sprites = await spriteUrlsByIds(
          matches.map((m) => m.slug),
          format,
          db,
        );
      } catch (err) {
        const { logger } = await import("@/server/logger");
        logger.error({
          event: "search_sprites_failed",
          kind,
          query: q,
          format,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return json(200, {
      matches: matches.map((m) => {
        const sprite_url = sprites.get(m.slug);
        return {
          slug: m.slug,
          display_name: m.display_name,
          kind: m.kind,
          ...(sprite_url ? { sprite_url } : {}),
        };
      }),
    });
  } catch (err) {
    // Transport/DB fault — degrade to an empty list (the picker just shows no
    // suggestions) rather than a 500, mirroring the app's read endpoints.
    const { logger } = await import("@/server/logger");
    logger.error({
      event: "search_failed",
      kind,
      query: q,
      format,
      err: err instanceof Error ? err.message : String(err),
    });
    return json(200, { matches: [] });
  }
}
