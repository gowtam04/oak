/**
 * `POST /api/chat/turns/:id/stop` — explicit stop (background-turns/design.md §4
 * / BT-4). Aborts the turn's own AbortController; the turn transitions to
 * `stopped`, subscribers receive `event: stopped`, and the streams close.
 * Nothing is persisted or recorded (matches today's Stop-discards semantics).
 *
 *   - 200 `{ turn_id, status: "stopped" }` — stopping a running turn; stopping an
 *     already-terminal turn is a 200 no-op returning the CURRENT status;
 *   - 404 — unknown/expired turn;
 *   - 403 — ownership mismatch (§4 "Ownership").
 *
 * A guest supplies its session id via `?session_id=` OR a `{ session_id }` body
 * field (§4). Conventions: `runtime = "nodejs"` + `dynamic = "force-dynamic"`,
 * server deps via DYNAMIC import. No rate limiting.
 */

import { json, jsonError } from "@/app/api/auth/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  const { getTurn, stopTurn } = await import("@/server/turn-store");
  const turn = getTurn(id);
  if (turn === undefined) return jsonError(404, "not_found", "Turn not found.");

  // Guest session id may arrive as a query param or a body field.
  let sessionIdParam = new URL(req.url).searchParams.get("session_id");
  if (sessionIdParam === null) {
    try {
      const body = (await req.json()) as { session_id?: unknown } | null;
      if (body && typeof body.session_id === "string") {
        sessionIdParam = body.session_id;
      }
    } catch {
      // No/invalid body — leave sessionIdParam null (guest ownership will fail).
    }
  }

  const { checkTurnOwnership } = await import("../../_lib/ownership");
  const owns = await checkTurnOwnership(
    { accountId: turn.accountId, sessionId: turn.sessionId },
    sessionIdParam,
  );
  if (!owns) return jsonError(403, "forbidden", "You do not own this turn.");

  // Idempotent: only a running turn is aborted; an already-terminal turn returns
  // its current status unchanged.
  if (turn.status === "running") stopTurn(turn);

  return json(200, { turn_id: id, status: turn.status });
}
