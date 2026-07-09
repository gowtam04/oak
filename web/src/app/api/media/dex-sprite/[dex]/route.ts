/**
 * `GET /api/media/dex-sprite/[dex]` — first-party PokeAPI front-sprite proxy
 * by national dex number. Used as a client fallback / legacy rewrite target
 * for historical answers that embedded GitHub raw front-sprite URLs.
 */

import { handleMediaGet } from "@/app/api/media/_lib/handle-media";
import {
  DEX_NUMBER_MAX,
  DEX_NUMBER_MIN,
  pokeApiSprite,
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
    cacheKey: `dex-sprite:${dex}`,
    upstreamUrl: valid ? pokeApiSprite(dex) : "",
    defaultContentType: "image/png",
  });
}
