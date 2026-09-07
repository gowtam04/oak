/**
 * `PUT /api/scope` — old clients still call this after a chip pick
 * (champions-first TurnScope, CF-DATA-BR-21). The requested format is
 * ignored; the response always acks Champions and does not persist
 * National Dex / gen-N as a future default.
 *
 *   Request  `{ format: Format, conversation_id?: string | null }`
 *            Guest also needs `session_id` as `?session_id=` or body
 *            `session_id` (same ownership pattern as `POST .../stop`).
 *   200      `{ format: "champions", lastUsedScope: "champions",
 *               lastUsedScopes: ["champions"] }`
 *            (guests omit lastUsedScope / lastUsedScopes)
 *   400      unknown / missing format; guest missing `session_id`
 *   404      signed-in + `conversation_id` not owned (no existence leak)
 *
 * No turn, no model. db/env-touching modules are dynamically imported so
 * `next build` never evaluates `@/env`.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import { CHAMPIONS_FORMAT, isFormat } from "@/data/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_FORMAT = () =>
  jsonError(400, "invalid_format", "Unknown or missing format.");
const NOT_FOUND = () => jsonError(404, "not_found", "Conversation not found.");

/** Guest session id may arrive as a query param or a body field. */
function sessionIdFrom(
  req: Request,
  body: Record<string, unknown>,
): string | null {
  const fromQuery = new URL(req.url).searchParams.get("session_id");
  if (fromQuery !== null && fromQuery.length > 0) return fromQuery;
  if (typeof body.session_id === "string" && body.session_id.length > 0) {
    return body.session_id;
  }
  return null;
}

export async function PUT(req: Request): Promise<Response> {
  const body = await readJsonObject(req);
  if (body === null) {
    return jsonError(
      400,
      "invalid_request",
      "Request body must be a JSON object.",
    );
  }

  if (typeof body.format !== "string" || !isFormat(body.format)) {
    return INVALID_FORMAT();
  }
  // Requested format is ignored (old clients may still send gen-7).

  const conversationId = body.conversation_id;
  if (
    conversationId !== undefined &&
    conversationId !== null &&
    typeof conversationId !== "string"
  ) {
    return jsonError(
      400,
      "invalid_request",
      "conversation_id must be a string or null.",
    );
  }

  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const account = await getCurrentAccount();

  if (account === null) {
    const sessionId = sessionIdFrom(req, body);
    if (sessionId === null) {
      return jsonError(400, "invalid_request", "session_id is required.");
    }
    // Do not persist the requested format onto the guest session
    // (CF-DATA-BR-21). Session id is still required so old guests 400 the
    // same as today when it is missing.
    return json(200, { format: CHAMPIONS_FORMAT });
  }

  const convId =
    typeof conversationId === "string" && conversationId.length > 0
      ? conversationId
      : null;

  if (convId !== null) {
    const convRepo = await import("@/data/repos/conversation-repo");
    // Ownership check only — do not rewrite historical format to the
    // requested chip pick (CF-DATA-BR-21).
    if ((await convRepo.getConversation(account.id, convId)) === null) {
      return NOT_FOUND();
    }
  }

  return json(200, {
    format: CHAMPIONS_FORMAT,
    lastUsedScope: CHAMPIONS_FORMAT,
    lastUsedScopes: [CHAMPIONS_FORMAT],
  });
}
