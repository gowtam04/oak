/**
 * POST /api/teams/set-template — live Champions usage set for one species.
 * Public read (no account secrets); applying onto a team is a later PATCH.
 * Request `{ species }` only; leftover `format` is ignored (always Champions).
 */

import { z } from "zod";

import { json, jsonError, retryAfterHeader } from "@/app/api/auth/_lib/http";
import { checkRateLimit, PUBLIC_READ_CONFIG } from "@/server/rate-limit";
import { clientIp } from "@/server/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  species: z.string().min(1).max(80),
});

export async function POST(req: Request): Promise<Response> {
  try {
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

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, "invalid_request", "JSON body required.");
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(400, "invalid_request", "species required.");
    }

    const { db } = await import("@/data/db");
    const { resolveSetTemplate } = await import("@/server/teams/set-template");
    const result = await resolveSetTemplate(parsed.data.species, db);
    return json(200, result);
  } catch {
    return json(200, {
      found: false,
      notes: ["Live Champions usage is unavailable."],
    });
  }
}
