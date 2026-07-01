/**
 * `GET /api/admin/accounts/[id]` — one account's full detail (admin-panel
 * design.md § API Design "accounts/{id}", § Component Design §4; ADMIN-US-8,
 * ADMIN-AC-8.1/8.2/8.3, ADMIN-BR-1/2/4).
 *
 *   200 → AccountDetailResponse { account: AccountWithActivity; sessions: SessionInfo[] }
 *   404 → { code:"not_found" } when no account with that id exists
 *
 * `sessions` lists the account's currently-active device sessions (read-only —
 * the panel never revokes one, ADMIN-BR-2).
 *
 * Gating (ADMIN-AC-1.4): `requireAdminRequest` runs FIRST — 401 (no session) /
 * 403 (non-admin) / pass. The guard + repo are reached via DYNAMIC import inside
 * the handler so `next build`'s page-data collection never eagerly evaluates the
 * env/db-touching chain (CLAUDE.md "API ROUTES").
 */

import { json, jsonError } from "@/app/api/auth/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { requireAdminRequest } = await import("../../_lib/guard");
  const guard = await requireAdminRequest(req);
  if ("response" in guard) return guard.response;

  const { id } = await ctx.params;

  const { getAccountDetail } = await import("@/data/repos/admin-content-repo");
  const detail = await getAccountDetail(id);
  if (detail === null) {
    return jsonError(404, "not_found", "Account not found.");
  }
  return json(200, detail);
}
