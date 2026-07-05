/**
 * `GET /api/chat/turns/:id` — JSON snapshot of a durable turn
 * (background-turns/design.md §4). Lets a client that lost its stream learn the
 * turn's terminal state without reattaching:
 *   - 200 `{ turn_id, status, answer? , error? }` — `answer` present iff
 *     `complete`; `error` present iff `error`;
 *   - 404 — unknown/expired turn (client treats as "interrupted — offer retry");
 *   - 403 — ownership mismatch (§4 "Ownership").
 *
 * The snapshot reads the in-process registry first, then the fail-soft Redis
 * terminal mirror (so a turn that finished before a process restart is still
 * recoverable). Conventions (CLAUDE.md "API ROUTES"): `runtime = "nodejs"` +
 * `dynamic = "force-dynamic"`, server deps reached via DYNAMIC import inside the
 * handler. No rate limiting (cheap, ownership-gated; the POST caps are the spend
 * control).
 */

import { json, jsonError } from "@/app/api/auth/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  const { getTurnSnapshot } = await import("@/server/turn-store");
  const snap = await getTurnSnapshot(id);
  if (snap === null) return jsonError(404, "not_found", "Turn not found.");

  const { checkTurnOwnership } = await import("../_lib/ownership");
  const sessionIdParam = new URL(req.url).searchParams.get("session_id");
  const owns = await checkTurnOwnership(
    { accountId: snap.accountId, sessionId: snap.sessionId },
    sessionIdParam,
  );
  if (!owns) return jsonError(403, "forbidden", "You do not own this turn.");

  return json(200, {
    turn_id: snap.turnId,
    status: snap.status,
    ...(snap.status === "complete" && snap.answer
      ? { answer: snap.answer }
      : {}),
    ...(snap.status === "error" && snap.error ? { error: snap.error } : {}),
  });
}
