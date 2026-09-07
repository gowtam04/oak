/**
 * GET /api/usage — public live Champions ladder (CF-USAGE-US-1, ADR-5).
 *
 * `?ladder=doubles` (default) | `singles`. 200 even when unavailable.
 * Off-roster names are skipped. No Smogon fallback.
 */

import { json, retryAfterHeader } from "@/app/api/auth/_lib/http";
import { checkRateLimit, PUBLIC_READ_CONFIG } from "@/server/rate-limit";
import { clientIp } from "@/server/client-ip";
import { parseUsageLadder } from "@/server/champions-usage/ladder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
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

  try {
    const { db } = await import("@/data/db");
    const { loadUsageLeaderboard } = await import(
      "@/server/champions-usage/usage-gateway"
    );
    const body = await loadUsageLeaderboard(ladder, db);
    return json(200, body);
  } catch {
    return json(200, {
      available: false,
      ladder,
      error: "upstream_unavailable",
      rows: [],
    });
  }
}
