/**
 * `GET /api/admin/teams/[id]` — one saved team with full members, cross-account
 * (admin-panel design.md § API Design "GET /api/admin/teams/{id} … detail
 * (cross-account)", § Component Design §4; ADMIN-US-10, ADMIN-AC-10.1,
 * ADMIN-BR-2/4).
 *
 * Thin handler: `requireAdminRequest` (the real authorization boundary,
 * ADMIN-AC-1.4) → `getTeamById` → `json(200, { team })`. READ-ONLY: the panel
 * never mutates a team (ADMIN-BR-2). Un-scoped by design — ANY team regardless
 * of owning account is readable here (ADMIN-BR-4), because the guard already
 * gated the caller as the single owner-admin.
 *
 *   - no session            → 401 { code:"unauthorized" }
 *   - signed in, not admin  → 403 { code:"forbidden" }
 *   - admin, unknown id      → 404 { code:"not_found" }
 *   - admin, found           → 200 TeamDetailResponse ({ team: TeamDetail })
 *
 * `runtime`/`dynamic` are pinned and the guard + repo are reached via DYNAMIC
 * import inside the handler so `next build`'s page-data collection never eagerly
 * evaluates the env/db-touching chain (CLAUDE.md "API ROUTES" rule), mirroring
 * `api/teams/[id]/route.ts`. The dynamic-segment `params` is a Promise here
 * (Next 15 App Router) and is awaited.
 */

import { json, jsonError } from "@/app/api/auth/_lib/http";
import type { TeamDetailResponse } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { requireAdminRequest } = await import("@/app/api/admin/_lib/guard");
  const gate = await requireAdminRequest(req);
  if ("response" in gate) return gate.response;

  const { id } = await ctx.params;

  const { getTeamById } = await import("@/data/repos/admin-content-repo");
  const team = await getTeamById(id);
  if (team === null) {
    return jsonError(404, "not_found", "Team not found.");
  }

  const body: TeamDetailResponse = { team };
  return json(200, body);
}
