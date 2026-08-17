/**
 * `GET /api/shares/public/:id` — unauthenticated live-snapshot JSON
 * (SHARE-US-2, SHARE-BR-1, AUTH-BR-2, CQ-OQ-5).
 *
 * No auth. Revoked / unknown → 404. Rate-limited with PUBLIC_READ_CONFIG
 * (same `pub:<ip>` bucket as `/api/entity`). Natives render this JSON;
 * they do not parse `GET /a/[id]` HTML.
 */

import { json, retryAfterHeader } from "@/app/api/auth/_lib/http";
import { checkRateLimit, PUBLIC_READ_CONFIG } from "@/server/rate-limit";
import { clientIp } from "@/server/client-ip";
import {
  NO_STORE,
  publicShareBody,
  shareError,
  shareRepo,
} from "../../_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  // Rate-limit BEFORE any dynamic import / DB work — public, unauthenticated
  // GET on the shared pool; shares the `pub:<ip>` bucket (EDGE-02).
  const gate = await checkRateLimit(
    `pub:${clientIp(req)}`,
    "",
    PUBLIC_READ_CONFIG,
  );
  if (!gate.allowed) {
    const retryAfterMs =
      gate.reason === "rate_limited" ? gate.retryAfterMs : 0;
    return shareError(
      429,
      "rate_limited",
      undefined,
      retryAfterHeader(retryAfterMs),
    );
  }

  const { id } = await ctx.params;
  const repo = await shareRepo();
  const share = await repo.getLiveShare(id);
  if (share === null) {
    return shareError(404, "not_found", undefined, NO_STORE);
  }
  return json(200, publicShareBody(share), NO_STORE);
}
