/**
 * GET /api/usage/:slug — public species drill-in + apply-set source
 * (CF-USAGE-AC-1.4, CF-INT-BR-5–6). 200 even when unavailable or not found.
 */

import { json, retryAfterHeader } from "@/app/api/auth/_lib/http";
import { checkRateLimit, PUBLIC_READ_CONFIG } from "@/server/rate-limit";
import { clientIp } from "@/server/client-ip";
import { parseUsageLadder } from "@/server/champions-usage/ladder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const gate = await checkRateLimit(
    `pub:${clientIp(req)}`,
    "",
    PUBLIC_READ_CONFIG,
  );
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
  const ladder = parseUsageLadder(url.searchParams.get("ladder"));
  if (!ladder) return json(400, { error: "invalid_ladder" });

  const { slug } = await ctx.params;
  const trimmed = (slug ?? "").trim();
  if (!trimmed) return json(400, { error: "invalid_slug" });

  try {
    const { db } = await import("@/data/db");
    const { loadUsageSpecies } = await import(
      "@/server/champions-usage/usage-gateway"
    );
    const body = await loadUsageSpecies(trimmed, ladder, db);
    return json(200, body);
  } catch {
    return json(200, { available: false, error: "upstream_unavailable" });
  }
}
