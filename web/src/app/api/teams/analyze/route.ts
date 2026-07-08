/**
 * `POST /api/teams/analyze` — stateless team-analysis read endpoint (#9).
 *
 * Takes a draft team `{ format, members }` and returns the full analysis — a
 * per-member stat readout, a defensive type matrix, offensive coverage, and
 * speed tiers (see `@/lib/teams/team-analysis` for the wire contract). It reads
 * ONLY public Pokédex math through the repo layer (species typing/stats, move
 * types, the format's type chart) — no account, conversation, or team data — so
 * it is deliberately PUBLIC (no auth gate), like `GET /api/entity`. That
 * sidesteps the cookie-vs-Bearer split and lets the same endpoint serve the web
 * panel and the iOS/Android team editors.
 *
 * Responses:
 *   - 200 TeamAnalysisResponse { status: "ok" | "unavailable" }
 *   - 400 { error } for a malformed/invalid body (NOT an analysis envelope)
 *   - 413 { error } for an over-cap body
 *   - 429 { error } when the shared public-read rate limit trips
 *
 * Never throws for in-domain misses (an unreadable index → `unavailable`).
 * `@/data/db` (and its repo dependents) import `@/env` at module load, so they
 * are DYNAMICALLY imported inside the handler — keeping `next build` from
 * evaluating `env` (cf. the entity/chat routes).
 */

import { json, retryAfterHeader } from "@/app/api/auth/_lib/http";
import { readJsonBodyWithLimit } from "@/server/body-limit";
import { teamAnalysisRequestSchema } from "@/lib/teams/team-analysis";
import { checkRateLimit, PUBLIC_READ_CONFIG } from "@/server/rate-limit";
import { clientIp } from "@/server/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Byte cap for a draft team (EDGE-01). Six members with full EV/IV spreads and
 * move/ability/item slugs is a few KiB; this is generous but bounded, and
 * enforced by streaming so a chunked body can't slip past it.
 */
const MAX_BYTES = 256 * 1024;

export async function POST(req: Request): Promise<Response> {
  // Rate-limit BEFORE any dynamic import / DB work (EDGE-02) — this is a public,
  // unauthenticated POST doing DB I/O on the shared pool. It shares the
  // `pub:<ip>` bucket with the other public read routes (one per IP).
  const gate = await checkRateLimit(`pub:${clientIp(req)}`, "", PUBLIC_READ_CONFIG);
  if (!gate.allowed) {
    const retryAfterMs = gate.reason === "rate_limited" ? gate.retryAfterMs : 0;
    return json(429, { error: "rate_limited" }, retryAfterHeader(retryAfterMs));
  }

  // Read under a hard streaming byte cap: too_large → 413, malformed → 400.
  const bodyResult = await readJsonBodyWithLimit(req, MAX_BYTES);
  if (!bodyResult.ok) {
    if (bodyResult.reason === "too_large") {
      return json(413, { error: "payload_too_large" });
    }
    return json(400, { error: "invalid_json" });
  }

  // A malformed body is a real 4xx, NOT an analysis envelope.
  const parsed = teamAnalysisRequestSchema.safeParse(bodyResult.value);
  if (!parsed.success) return json(400, { error: "invalid_request" });
  const { format, members } = parsed.data;

  try {
    const { db } = await import("@/data/db");
    const { analyzeTeamForFormat } = await import("@/server/teams/analyze-team");
    const result = await analyzeTeamForFormat(members, format, db);
    return json(200, result);
  } catch (err) {
    // Transport/DB fault — degrade to a clear "couldn't analyze" envelope (NFR-2)
    // rather than a 500, so the panel shows an honest state, not a crash.
    const { logger } = await import("@/server/logger");
    logger.error({
      event: "team_analyze_failed",
      format,
      err: err instanceof Error ? err.message : String(err),
    });
    return json(200, { status: "unavailable", format });
  }
}
