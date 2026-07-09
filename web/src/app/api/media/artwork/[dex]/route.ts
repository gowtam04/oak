/**
 * `GET /api/media/artwork/[dex]` — first-party official-artwork proxy by
 * national dex number. Upstream: PokeAPI sprites via GitHub raw (cached here
 * so clients never hit GitHub's rate limit directly).
 */

import { handleMediaGet } from "@/app/api/media/_lib/handle-media";
import {
  DEX_NUMBER_MAX,
  DEX_NUMBER_MIN,
  pokeApiArtwork,
} from "@/lib/sprites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ dex: string }> },
): Promise<Response> {
  const { dex: raw } = await ctx.params;
  const dex = Number(raw);
  const valid =
    Number.isInteger(dex) && dex >= DEX_NUMBER_MIN && dex <= DEX_NUMBER_MAX;
  return handleMediaGet({
    req,
    valid,
    cacheKey: `artwork:${dex}`,
    upstreamUrl: valid ? pokeApiArtwork(dex) : "",
    defaultContentType: "image/png",
  });
}
