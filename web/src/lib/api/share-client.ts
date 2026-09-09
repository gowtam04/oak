/**
 * share-client — typed `fetch` helpers over the `/api/shares/*` routes
 * (chat-qol Phase 4; SHARE-US-1..5).
 *
 * Never-throw, same contract as history-client / teams-client: a transport or
 * HTTP failure folds into a safe value (`null` / `[]` / `false`) so the UI
 * always has something to render. The httpOnly session cookie is sent
 * automatically on same-origin requests (`credentials: "same-origin"`).
 */

import { oakAnswerSchema, type OakAnswer } from "@/agent/schemas";

export interface CreatedShare {
  id: string;
  url: string;
}

export interface ShareListItem {
  id: string;
  url: string;
  conversationTitle: string;
  createdAt: number;
}

export interface PublicShare {
  id: string;
  question: string;
  answer: OakAnswer;
  conversationTitle: string;
  createdAt: number;
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
 * `POST /api/shares` — snapshot one assistant card. Guest / 404 / share_limit
 * / transport all fold to `null`.
 */
export async function createShare(
  conversationId: string,
  assistantMessageId: string,
): Promise<CreatedShare | null> {
  try {
    const res = await fetch("/api/shares", {
      method: "POST",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify({
        conversation_id: conversationId,
        assistant_message_id: assistantMessageId,
      }),
    });
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    if (typeof body.id !== "string" || typeof body.url !== "string") return null;
    return { id: body.id, url: body.url };
  } catch {
    return null;
  }
}

/**
 * `GET /api/shares` — this account's live Shared-by-me list. Guest or any
 * failure yields `[]` (SHARE-AC-4.2 empty, not an error).
 */
export async function listShares(): Promise<ShareListItem[]> {
  try {
    const res = await fetch("/api/shares", {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) return [];
    const body = await readJsonBody(res);
    if (!Array.isArray(body.shares)) return [];
    return body.shares.flatMap((row) => {
      const item = toListItem(row);
      return item ? [item] : [];
    });
  } catch {
    return [];
  }
}

function toListItem(value: unknown): ShareListItem | null {
  if (value === null || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.url !== "string" ||
    typeof r.conversationTitle !== "string" ||
    typeof r.createdAt !== "number"
  ) {
    return null;
  }
  return {
    id: r.id,
    url: r.url,
    conversationTitle: r.conversationTitle,
    createdAt: r.createdAt,
  };
}

/**
 * `DELETE /api/shares/:id` — owner revoke. A 404 (already gone / not owned)
 * counts as success for an idempotent revoke UX.
 */
export async function revokeShare(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/shares/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * `GET /api/shares/public/:id` — unauthenticated live snapshot. Revoked,
 * unknown, or a transport/contract fault yields `null`.
 */
export async function getPublicShare(id: string): Promise<PublicShare | null> {
  try {
    const res = await fetch(`/api/shares/public/${encodeURIComponent(id)}`, {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    if (
      typeof body.id !== "string" ||
      typeof body.question !== "string" ||
      typeof body.conversationTitle !== "string" ||
      typeof body.createdAt !== "number"
    ) {
      return null;
    }
    const parsed = oakAnswerSchema.safeParse(body.answer);
    if (!parsed.success) return null;
    return {
      id: body.id,
      question: body.question,
      answer: parsed.data,
      conversationTitle: body.conversationTitle,
      createdAt: body.createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * `POST /api/shares/:id/import-team` — create a new team on the VIEWER
 * account from the snapshot's `proposed_team`. Guest / no proposal / revoked
 * / transport all fold to `null`.
 */
export async function importTeamFromShare(id: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/shares/${encodeURIComponent(id)}/import-team`,
      { method: "POST", credentials: "same-origin" },
    );
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    return typeof body.team_id === "string" ? body.team_id : null;
  } catch {
    return null;
  }
}
