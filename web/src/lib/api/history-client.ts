/**
 * history-client — typed `fetch` helpers over the `/api/conversations/*` routes
 * (docs/features/chat-history § Interface Definitions, Phase 5).
 *
 * The ONLY thing the history UI / page talk to for conversation data. Mirrors
 * auth-client.ts: helpers NEVER throw — a transport/HTTP failure folds into a
 * safe value (`[]` / `null` / `false`) so the UI always has something to render.
 * The httpOnly session cookie is sent automatically on these same-origin
 * requests (`credentials: "same-origin"`).
 */

import type { ChatTurn } from "@/components/types";
import type { Format } from "@/data/formats";

/** List-view summary (no turns). */
export interface ConversationSummary {
  id: string;
  title: string;
  format: string;
  pinned: boolean;
  updatedAt: number;
  /** Organize (chat-qol). Absent on older payloads. */
  archived?: boolean;
  folderId?: string | null;
}

/** Full conversation, turns rehydrated to the same shape the thread renders. */
export interface ConversationDetail {
  id: string;
  title: string;
  format: string;
  pinned: boolean;
  turns: ChatTurn[];
  archived?: boolean;
  folderId?: string | null;
  /** Assistant message ids in thread (seq) order. */
  pinnedMessageIds?: string[];
  /**
   * The conversation's live durable turn, if one is still generating server-side
   * (background-turns/design.md §5.4 / §6.1). A live registry lookup by
   * conversation id + account, so reopening a thread mid-generation knows to
   * reattach (`resume`) even after an app relaunch (when the client's own
   * pending-turn pointer is gone). `null`/absent ⇒ no running turn.
   */
  active_turn?: { turn_id: string } | null;
}

export type BulkAction = "delete" | "archive" | "unarchive" | "move";

export interface BulkUpdateResult {
  updated: string[];
  skipped: string[];
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
 * `GET /api/conversations` — list the signed-in account's conversations (pinned
 * first, then most-recently-active). `q` filters by title/message text; `format`
 * filters by format. A guest, or any failure, yields `[]`.
 */
export async function listConversations(opts?: {
  q?: string;
  format?: string;
  folder_id?: string;
  archived?: boolean | 0 | 1;
  include_archived?: boolean | 1;
}): Promise<ConversationSummary[]> {
  try {
    const params = new URLSearchParams();
    if (opts?.q) params.set("q", opts.q);
    if (opts?.format) params.set("format", opts.format);
    if (opts?.folder_id) params.set("folder_id", opts.folder_id);
    if (opts?.archived === true || opts?.archived === 1) params.set("archived", "1");
    else if (opts?.archived === false || opts?.archived === 0) params.set("archived", "0");
    if (opts?.include_archived === true || opts?.include_archived === 1) {
      params.set("include_archived", "1");
    }
    const qs = params.toString();
    const res = await fetch(`/api/conversations${qs ? `?${qs}` : ""}`, {
      method: "GET",
      credentials: "same-origin",
    });
    const body = await readJsonBody(res);
    return Array.isArray(body.conversations)
      ? (body.conversations as ConversationSummary[])
      : [];
  } catch {
    return [];
  }
}

/**
 * `GET /api/conversations/[id]` — the full conversation with rehydrated turns,
 * or `null` if missing / not owned / a transport fault (HIST-US-4).
 */
export async function getConversation(
  id: string,
): Promise<ConversationDetail | null> {
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    if (typeof body.id !== "string" || !Array.isArray(body.turns)) return null;
    return body as unknown as ConversationDetail;
  } catch {
    return null;
  }
}

/** Internal: PATCH a conversation; returns whether it succeeded. */
async function patch(
  id: string,
  payload: {
    title?: string;
    pinned?: boolean;
    archived?: boolean;
    folder_id?: string | null;
  },
): Promise<boolean> {
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** `PATCH` rename (BR-H7). */
export function renameConversation(id: string, title: string): Promise<boolean> {
  return patch(id, { title });
}

/** `PATCH` pin / unpin (HIST-US-9). */
export function setPinned(id: string, pinned: boolean): Promise<boolean> {
  return patch(id, { pinned });
}

/** `PATCH` archive / unarchive (ORG-US-2). */
export function setArchived(id: string, archived: boolean): Promise<boolean> {
  return patch(id, { archived });
}

/** `PATCH` file into a folder, or unfile (`null`) (ORG-US-1). */
export function setFolder(id: string, folderId: string | null): Promise<boolean> {
  return patch(id, { folder_id: folderId });
}

/**
 * `DELETE /api/conversations/[id]` — permanent (BR-H8). A 404 (already gone /
 * not found) counts as success for an idempotent delete UX.
 */
export async function deleteConversation(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * `POST /api/conversations/import` — guest→sign-in bulk save (HIST-US-12).
 * Returns the saved conversation id, or `null` (empty thread / refusal / fault).
 *
 * `format` is the guest thread's RESOLVED scope (GS-C): a thread that switched
 * to gen-7 via an in-message signal must import as gen-7, not as whatever the
 * scope chip currently reads. Required now that the deprecated
 * `champions_mode` toggle is gone from the web client. (The server import
 * route keeps accepting the old `champions_mode` shape for other clients.)
 */
export async function importConversation(
  sessionId: string,
  turns: ChatTurn[],
  format: Format,
): Promise<string | null> {
  try {
    const res = await fetch("/api/conversations/import", {
      method: "POST",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify({
        session_id: sessionId,
        format,
        turns,
      }),
    });
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    return typeof body.id === "string" ? body.id : null;
  } catch {
    return null;
  }
}

/**
 * `POST /api/conversations/bulk` — delete / archive / unarchive / move many
 * (ORG-US-3). Failure / guest / transport → `null`.
 */
export async function bulkUpdate(
  ids: string[],
  action: BulkAction,
  folderId?: string | null,
): Promise<BulkUpdateResult | null> {
  try {
    const res = await fetch("/api/conversations/bulk", {
      method: "POST",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify({
        ids,
        action,
        ...(folderId !== undefined ? { folder_id: folderId } : {}),
      }),
    });
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    return Array.isArray(body.updated) && Array.isArray(body.skipped)
      ? { updated: body.updated as string[], skipped: body.skipped as string[] }
      : null;
  } catch {
    return null;
  }
}

/**
 * `POST /api/conversations/:id/fork` — copy the prefix through an assistant
 * card into a new conversation (FORK-US-1). Returns `{ id, title }` or `null`.
 */
export async function forkConversation(
  id: string,
  throughMessageId: string,
): Promise<{ id: string; title: string } | null> {
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(id)}/fork`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        credentials: "same-origin",
        body: JSON.stringify({ through_message_id: throughMessageId }),
      },
    );
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    return typeof body.id === "string" && typeof body.title === "string"
      ? { id: body.id, title: body.title }
      : null;
  } catch {
    return null;
  }
}

/**
 * `POST /api/conversations/:id/pins` — pin / unpin an assistant turn
 * (PIN-US-1). Returns the conversation's pinned ids in thread order, or `null`.
 */
export async function setMessagePinned(
  conversationId: string,
  messageId: string,
  pinned: boolean,
): Promise<string[] | null> {
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(conversationId)}/pins`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        credentials: "same-origin",
        body: JSON.stringify({ message_id: messageId, pinned }),
      },
    );
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    return Array.isArray(body.pinnedMessageIds)
      ? (body.pinnedMessageIds as string[])
      : null;
  } catch {
    return null;
  }
}

export type ExportFormat = "md" | "pdf";

export interface ConversationExport {
  bytes: Uint8Array;
  filename: string;
}

/** Pull the attachment name from `Content-Disposition`, preferring filename*. */
function filenameFromDisposition(
  header: string | null,
  fallback: string,
): string {
  if (!header) return fallback;
  const star = /filename\*=(?:UTF-8''|utf-8'')([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const bare = /filename=([^;]+)/i.exec(header);
  if (bare?.[1]) return bare[1].trim().replace(/^"|"$/g, "");
  return fallback;
}

/**
 * `GET /api/conversations/:id/export?format=md|pdf` — download bytes + filename
 * (EXP-US-1/2). Failure / guest / empty → `null`.
 */
export async function exportConversation(
  id: string,
  format: ExportFormat,
): Promise<ConversationExport | null> {
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(id)}/export?format=${format}`,
      { method: "GET", credentials: "same-origin" },
    );
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      filename: filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        `conversation.${format}`,
      ),
    };
  } catch {
    return null;
  }
}
