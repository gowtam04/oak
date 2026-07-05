/**
 * `GET /api/chat/turns/:id/stream?session_id=<sid>` — SSE resume
 * (background-turns/design.md §4 / BT-3). Replays the turn's full buffered event
 * list from the start (clients rebuild the in-flight UI from scratch on reattach
 * — no offset protocol in v1), then tails live until a terminal event. If the
 * turn is already terminal, the replay ends WITH the terminal event and the
 * stream closes — so "reattach after completion" and "reattach mid-flight" are a
 * SINGLE client code path. Same SSE headers + 15s keep-alive as the POST stream:
 * both call the shared {@link streamTurnResponse} helper.
 *
 *   - 404 — unknown/expired turn (only the live registry can be resumed; a turn
 *     that survives only in the Redis terminal mirror is fetchable via the
 *     snapshot endpoint, not tailable here — design §8);
 *   - 403 — ownership mismatch (§4 "Ownership"), a pre-stream JSON error.
 *
 * Conventions: `runtime = "nodejs"` + `dynamic = "force-dynamic"`, server deps
 * via DYNAMIC import. No rate limiting.
 */

import { jsonError } from "@/app/api/auth/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  const { getTurn } = await import("@/server/turn-store");
  const turn = getTurn(id);
  if (turn === undefined) return jsonError(404, "not_found", "Turn not found.");

  const { checkTurnOwnership } = await import("../../_lib/ownership");
  const sessionIdParam = new URL(req.url).searchParams.get("session_id");
  const owns = await checkTurnOwnership(
    { accountId: turn.accountId, sessionId: turn.sessionId },
    sessionIdParam,
  );
  if (!owns) return jsonError(403, "forbidden", "You do not own this turn.");

  const { streamTurnResponse } = await import("@/server/turn-stream");
  return streamTurnResponse(turn);
}
