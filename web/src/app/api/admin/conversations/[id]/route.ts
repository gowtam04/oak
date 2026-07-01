/**
 * `GET /api/admin/conversations/[id]` — a single conversation's full thread,
 * cross-account (admin-panel design.md § Component Design §4 / § API Design;
 * ADMIN-US-9, ADMIN-AC-9.2, ADMIN-BR-2 read-only, ADMIN-BR-4 owner-only
 * cross-account read access).
 *
 * Admin-gated, read-only, un-scoped variant of the user-facing
 * `GET /api/conversations/[id]`: it returns ANY conversation regardless of
 * owning account, with the summary (owning account + message count) and every
 * stored turn in `seq` order for the thread reader.
 *
 * → 200 `ConversationThreadResponse` (`{ summary, turns }`).
 *   404 `{code:"not_found"}` when no conversation has that id.
 *   401 `{code:"unauthorized"}` (no session) / 403 `{code:"forbidden"}`
 *   (signed-in non-admin), via the shared admin guard.
 *
 * `runtime`/`dynamic` are pinned and the guard + repo are reached by DYNAMIC
 * import inside the handler so `next build`'s page-data collection never eagerly
 * evaluates the env/db-touching chain (CLAUDE.md "API ROUTES").
 */

import { json, jsonError } from "@/app/api/auth/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { requireAdminRequest } = await import("../../_lib/guard");
  const gate = await requireAdminRequest(req);
  if ("response" in gate) return gate.response;

  const { id } = await ctx.params;

  const { getConversationThread } = await import(
    "@/data/repos/admin-content-repo"
  );
  const thread = await getConversationThread(id);
  if (thread === null) {
    return jsonError(404, "not_found", "Conversation not found.");
  }
  return json(200, thread);
}
