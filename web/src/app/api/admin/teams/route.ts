/**
 * `GET /api/admin/teams` — cross-account saved-team browser
 * (admin-panel design.md § API Design "GET /api/admin/teams … list (cross-
 * account)", § Component Design §4; ADMIN-US-10, ADMIN-BR-2/4).
 *
 * Thin handler: `requireAdminRequest` (the real authorization boundary,
 * ADMIN-AC-1.4) → parse query → `listAllTeams` → `json(200, …)`. READ-ONLY: it
 * only reads (ADMIN-BR-2); the un-scoped cross-account read is the panel's point
 * (ADMIN-BR-4) and is allowed solely because the guard already gated the caller.
 *
 *   - no session            → 401 { code:"unauthorized" }
 *   - signed in, not admin  → 403 { code:"forbidden" }
 *   - admin                  → 200 TeamsListResponse (Paginated<TeamSummary>)
 *
 * Query params (all optional, lenient — bad/missing fall back to repo defaults,
 * never 500): `q` (name substring, ilike), `format` (exact), `limit`, `cursor`
 * (keyset on (updated_at, id)). `nextCursor` is null on the last page.
 *
 * `runtime`/`dynamic` are pinned and the guard + repo are reached via DYNAMIC
 * import inside the handler so `next build`'s page-data collection never eagerly
 * evaluates the env/db-touching chain (CLAUDE.md "API ROUTES" rule), mirroring
 * `api/conversations/route.ts` and `api/auth/me/route.ts`.
 */

import { json } from "@/app/api/auth/_lib/http";
import type { TeamsListResponse } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("@/app/api/admin/_lib/guard");
  const gate = await requireAdminRequest(req);
  if ("response" in gate) return gate.response;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || undefined;
  const format = url.searchParams.get("format")?.trim() || undefined;
  const cursor = url.searchParams.get("cursor")?.trim() || undefined;
  // `Number(null)` / `Number("")` → 0, a bad value → NaN; the repo's clampLimit
  // turns any non-positive/non-finite value into its default page size.
  const limit = Number(url.searchParams.get("limit"));

  const { listAllTeams } = await import("@/data/repos/admin-content-repo");
  const page: TeamsListResponse = await listAllTeams({
    q,
    format,
    cursor,
    limit,
  });
  return json(200, page);
}
