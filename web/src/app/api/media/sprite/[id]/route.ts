/**
 * `GET /api/media/sprite/[id]` — first-party Showdown animated sprite proxy.
 *
 * `id` is a Showdown spriteid (`gyarados`, `charizard-megax`). Closed allowlist
 * via regex — never an open URL proxy. Upstream: play.pokemonshowdown.com
 * `ani/`; if that 404s and `pokeApiFormIdForSpriteId` has a form id, PokeAPI
 * official artwork (cached under a distinct key).
 */

import { handleMediaGet } from "@/app/api/media/_lib/handle-media";
import { pokeApiFormIdForSpriteId } from "@/lib/pokeapi-form-ids";
import { pokeApiArtwork, showdownAniSprite, SPRITE_ID_RE } from "@/lib/sprites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: raw } = await ctx.params;
  // Path segment may arrive percent-encoded; normalize + validate.
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    id = raw;
  }
  const valid = SPRITE_ID_RE.test(id);
  const formId = valid ? pokeApiFormIdForSpriteId(id) : null;
  return handleMediaGet({
    req,
    valid,
    cacheKey: `sprite:${id}`,
    upstreamUrl: valid ? showdownAniSprite(id) : "",
    defaultContentType: "image/gif",
    fallback:
      formId != null
        ? {
            cacheKey: `sprite-fallback:${id}`,
            upstreamUrl: pokeApiArtwork(formId),
            defaultContentType: "image/png",
          }
        : undefined,
  });
}
