/**
 * scope-client — typed `fetch` helper over `PUT /api/scope` (chat-qol
 * api-design.md, ADR-8; SCOPE-US-1).
 *
 * Persist a header scope-chip pick with no follow-up message. Mirrors
 * history-client.ts: it NEVER throws — a transport/HTTP failure folds to
 * `null` so the chip UI can keep its local pick. The httpOnly session
 * cookie is sent automatically (`credentials: "same-origin"`).
 *
 * Guests must pass `sessionId` (query + body, same as stop-for-guest).
 */

import { isFormat, type Format } from "@/data/formats";

export interface PersistScopeInput {
  format: Format;
  conversationId?: string | null;
  sessionId?: string;
}

export interface PersistScopeResult {
  format: Format;
  lastUsedScopes?: Format[];
}

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
};

/** Best-effort parse of a JSON body; a non-JSON/empty body yields `{}`. */
async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json();
    if (data !== null && typeof data === "object") {
      return data as Record<string, unknown>;
    }
  } catch {
    /* non-JSON or empty body */
  }
  return {};
}

/**
 * `PUT /api/scope` — persist a chip pick. Returns the stored format (and the
 * signed-in MRU list when present), or `null` on any failure.
 */
export async function persistScope(
  input: PersistScopeInput,
): Promise<PersistScopeResult | null> {
  try {
    const sessionId =
      typeof input.sessionId === "string" && input.sessionId.length > 0
        ? input.sessionId
        : undefined;
    const url = sessionId
      ? `/api/scope?session_id=${encodeURIComponent(sessionId)}`
      : "/api/scope";
    const payload: Record<string, unknown> = { format: input.format };
    if (input.conversationId !== undefined) {
      payload.conversation_id = input.conversationId;
    }
    if (sessionId !== undefined) {
      payload.session_id = sessionId;
    }
    const res = await fetch(url, {
      method: "PUT",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    if (typeof body.format !== "string" || !isFormat(body.format)) return null;
    const result: PersistScopeResult = { format: body.format };
    if (Array.isArray(body.lastUsedScopes)) {
      result.lastUsedScopes = body.lastUsedScopes.filter(
        (f): f is Format => typeof f === "string" && isFormat(f),
      );
    }
    return result;
  } catch {
    return null;
  }
}
