/**
 * `GET /api/admin/accounts` — cross-account accounts list with derived activity
 * (admin-panel design.md § API Design "accounts", § Component Design §4;
 * ADMIN-US-8, ADMIN-US-11, ADMIN-AC-8.1/8.2/11.1, ADMIN-BR-1/2/4).
 *
 *   200 → AccountsResponse = Paginated<AccountWithActivity> { rows, nextCursor }
 *
 * `?sort=recent|turns|cost|errors` selects the ordering — `cost`/`turns`/`errors`
 * are the HEAVY-USER view (ADMIN-US-11); it is NOT a separate route (design.md
 * "Heavy-users is `accounts?sort=…`; it is not a separate route"). Default
 * `recent` (signup date). Other params: `q` (email substring, ilike),
 * `limit`/`cursor` (keyset pagination on the deterministic sort).
 *
 * READ-ONLY (ADMIN-BR-2): this only reads — it never mutates an account.
 * Validation is lenient (bad/missing → sensible defaults, never 500); the repo
 * clamps `limit` and decodes a malformed `cursor` to page one.
 *
 * Gating (ADMIN-AC-1.4): `requireAdminRequest` runs FIRST — 401 (no session) /
 * 403 (non-admin) / pass. The guard + repo are reached via DYNAMIC import inside
 * the handler so `next build`'s page-data collection never eagerly evaluates the
 * env/db-touching chain (CLAUDE.md "API ROUTES").
 */

import { json } from "@/app/api/auth/_lib/http";
import type { AccountSort, AccountsResponse } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The valid `sort` modes (mirrors the `AccountSort` union); anything else → default. */
const ACCOUNT_SORTS = new Set<AccountSort>(["recent", "turns", "cost", "errors"]);

export async function GET(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("../_lib/guard");
  const guard = await requireAdminRequest(req);
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const params = url.searchParams;

  const q = params.get("q")?.trim() || undefined;

  const sortParam = params.get("sort")?.trim();
  const sort: AccountSort | undefined =
    sortParam && ACCOUNT_SORTS.has(sortParam as AccountSort)
      ? (sortParam as AccountSort)
      : undefined;

  // Lenient: NaN/<=0 → the repo's clampLimit default; cursor decode is defensive.
  const limit = Number.parseInt(params.get("limit") ?? "", 10);
  const cursor = params.get("cursor")?.trim() || undefined;

  const { listAccounts } = await import("@/data/repos/admin-content-repo");
  const result: AccountsResponse = await listAccounts({ q, sort, limit, cursor });
  return json(200, result);
}
