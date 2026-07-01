/**
 * `GET /api/admin/turns/[id]` — the full per-turn drill-down: a single
 * `turn_record` rendered as `TurnDetailResponse`, including the parsed
 * `tool_trace` (each tool call with name/latency/cache-hit/error), the full
 * `answer_text`, and the raw `answer_json` (the complete `OakAnswer` for the
 * answer-card re-render). This is the detail half of ADMIN-US-5 — the list half
 * is `GET /api/admin/turns`.
 *
 * Design refs:
 *   - docs/features/admin-panel/architecture/design.md
 *       § Component Design › 4 (Admin API — `turns/[id]`; guard → repo → json)
 *       § API Design (`GET /api/admin/turns/{id} → TurnDetailResponse`)
 *       § Technical Decisions AD-3/AD-4 (full stored content; the `rate_limited`
 *         row has null `answer_text`/`answer_json`), AD-5 (route guard boundary).
 *   - requirements.md ADMIN-US-5, ADMIN-AC-5.2 (the exact drill-down fields),
 *     ADMIN-BR-1/2/4 (admin-only, read-only, owner cross-account full read).
 *
 * Shape (mirrors `/api/teams/[id]` for the dynamic `[id]` segment):
 *   - `runtime = "nodejs"` + `dynamic = "force-dynamic"`.
 *   - `ctx.params` is a Promise (Next App Router) — awaited for the id.
 *   - Guard AND repo via DYNAMIC import inside the handler (CLAUDE.md "API
 *     ROUTES" rule); only the pure `json`/`jsonError` helpers and erased
 *     `import type`s are imported at the top.
 *   - Gating first (ADMIN-AC-1.4): 401 (no session) / 403 (non-admin); a
 *     non-admin gets a bare error envelope and NO turn data (ADMIN-AC-1.2).
 *   - A missing id → `404 {code:"not_found"}` (the repo returns `null`); a
 *     genuine fault propagates to the transport seam.
 */

import { json, jsonError } from "@/app/api/auth/_lib/http";

import type { TurnDetailResponse } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { requireAdminRequest } = await import("@/app/api/admin/_lib/guard");
  const auth = await requireAdminRequest(req);
  if ("response" in auth) return auth.response;

  const { id } = await ctx.params;

  const { getTurn } = await import("@/data/repos/admin-content-repo");
  const turn = await getTurn(id);
  if (turn === null) {
    return jsonError(404, "not_found", "Turn not found.");
  }

  const body: TurnDetailResponse = { turn };
  return json(200, body);
}
