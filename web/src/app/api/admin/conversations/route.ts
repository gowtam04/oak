/**
 * `GET /api/admin/conversations` — cross-account conversation browser
 * (admin-panel design.md § Component Design §4 / § API Design; ADMIN-US-9,
 * ADMIN-BR-2 read-only, ADMIN-BR-4 owner-only cross-account read access).
 *
 * Admin-gated, read-only, un-scoped variant of the user-facing
 * `GET /api/conversations`: it lists EVERY account's saved threads, each row
 * carrying the owning account (id + joined email) so the operator can see whose
 * thread it is. Query params (all optional, lenient — bad/missing → defaults,
 * never 500):
 *   - `q`      substring search over the conversation title OR any message text
 *              (ilike, AD-7)
 *   - `format` exact format filter ("scarlet-violet" | "champions")
 *   - `limit`  page size (clamped 1..200 by the repo; default 50)
 *   - `cursor` opaque keyset cursor on (updated_at, id)
 *
 * → 200 `ConversationsListResponse` (`Paginated<ConversationSummary>`).
 *   401 `{code:"unauthorized"}` (no session) / 403 `{code:"forbidden"}`
 *   (signed-in non-admin), via the shared admin guard.
 *
 * `runtime`/`dynamic` are pinned and the guard + repo are reached by DYNAMIC
 * import inside the handler so `next build`'s page-data collection never eagerly
 * evaluates the env/db-touching chain (CLAUDE.md "API ROUTES").
 */

import { json } from "@/app/api/auth/_lib/http";
import type { ConversationsListResponse } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("../_lib/guard");
  const gate = await requireAdminRequest(req);
  if ("response" in gate) return gate.response;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || undefined;
  const format = url.searchParams.get("format")?.trim() || undefined;
  const cursor = url.searchParams.get("cursor")?.trim() || undefined;
  // Number(null) === 0 and Number("abc") === NaN; the repo's clampLimit maps
  // both (and any out-of-range value) to a sane default — lenient parsing.
  const limit = Number(url.searchParams.get("limit"));

  const { listAllConversations } = await import(
    "@/data/repos/admin-content-repo"
  );
  const result: ConversationsListResponse = await listAllConversations({
    q,
    format,
    limit,
    cursor,
  });
  return json(200, result);
}
