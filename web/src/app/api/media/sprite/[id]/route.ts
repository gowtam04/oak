/**
 * `GET /api/media/sprite/[id]` — first-party Showdown animated sprite proxy.
 *
 * `id` is a Showdown spriteid (`gyarados`, `charizard-megax`). Closed allowlist
 * via regex — never an open URL proxy. Upstream: play.pokemonshowdown.com.
 */

import { handleMediaGet } from "@/app/api/media/_lib/handle-media";
import { showdownAniSprite, SPRITE_ID_RE } from "@/lib/sprites";

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
  return handleMediaGet({
    req,
    valid,
    cacheKey: `sprite:${id}`,
    upstreamUrl: valid ? showdownAniSprite(id) : "",
    defaultContentType: "image/gif",
  });
}
