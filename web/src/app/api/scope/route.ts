/**
 * `PUT /api/scope` — persist a header scope-chip pick with no follow-up
 * message (chat-qol api-design.md, ADR-8; SCOPE-US-1, SCOPE-BR-1).
 *
 *   Request  `{ format: Format, conversation_id?: string | null }`
 *            Guest also needs `session_id` as `?session_id=` or body
 *            `session_id` (same ownership pattern as `POST .../stop`).
 *   200      `{ format, lastUsedScopes?: Format[] }`
 *            (`lastUsedScopes` omitted for guests)
 *   400      unknown / missing format; guest missing `session_id`
 *   404      signed-in + `conversation_id` not owned (no existence leak)
 *
 * Signed-in + conversation_id → conversation format + last_used_scope + MRU.
 * Signed-in + no conversation  → last_used_scope + MRU only (empty new chat).
 * Guest                      → `setSessionScope` (session/thread). No MRU.
 *
 * No turn, no model. db/env-touching modules are dynamically imported so
 * `next build` never evaluates `@/env`.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import { isFormat, type Format } from "@/data/formats";

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
  const format: Format = body.format;

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
    const { setSessionScope } = await import("@/server/session-store");
    await setSessionScope(sessionId, format);
    return json(200, { format });
  }

  const convId =
    typeof conversationId === "string" && conversationId.length > 0
      ? conversationId
      : null;

  if (convId !== null) {
    const convRepo = await import("@/data/repos/conversation-repo");
    const conv = await convRepo.getConversation(account.id, convId);
    if (conv === null) return NOT_FOUND();
    await convRepo.updateConversationFormat(account.id, convId, format);
  }

  const accounts = await import("@/data/repos/accounts-repo");
  const mru = await import("@/data/repos/scope-mru-repo");
  await accounts.updateLastUsedScope(account.id, format);
  await mru.touch(account.id, format, Date.now());
  const lastUsedScopes = (await mru.list(account.id)).filter(isFormat);
  return json(200, { format, lastUsedScopes });
}
