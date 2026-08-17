/**
 * `POST /api/calc` — public, no-auth damage estimate (ADR-3, CALC-BR-1).
 *
 * Dynamic-import the engine (same env-throw avoidance as `/api/chat`). Rate
 * limit shares the existing public `pub:<ip>` family with `/api/entity` and
 * `/api/search`. In-domain misses (incomplete / unresolved / status / index)
 * ride a 200; only invalid format / malformed JSON are 400.
 */

import { json, retryAfterHeader } from "@/app/api/auth/_lib/http";
import { isFormat } from "@/data/formats";
import { calcScenarioSchema } from "@/lib/calc/calc-schema";
import { readJsonBodyWithLimit } from "@/server/body-limit";
import { clientIp } from "@/server/client-ip";
import { checkRateLimit, PUBLIC_READ_CONFIG } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 64 * 1024;

export async function POST(req: Request): Promise<Response> {
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

  const bodyResult = await readJsonBodyWithLimit(req, MAX_BYTES);
  if (!bodyResult.ok) {
    if (bodyResult.reason === "too_large") {
      return json(413, { error: "payload_too_large" });
    }
    return json(400, { error: "invalid_json" });
  }

  const raw = bodyResult.value;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return json(400, { error: "invalid_json" });
  }

  const format = (raw as { format?: unknown }).format;
  if (typeof format !== "string" || !isFormat(format)) {
    return json(400, { error: "invalid_format" });
  }

  const parsed = calcScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "invalid_request" });
  }

  try {
    const { db } = await import("@/data/db");
    const { runCalc } = await import("@/server/calc/calc-engine");
    const result = await runCalc(parsed.data, db);
    return json(200, result);
  } catch (err) {
    const { logger } = await import("@/server/logger");
    logger.error({
      event: "calc_failed",
      format,
      err: err instanceof Error ? err.message : String(err),
    });
    return json(200, { ok: false, error: "index_unavailable" });
  }
}
