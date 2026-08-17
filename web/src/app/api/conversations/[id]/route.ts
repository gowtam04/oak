/**
 * `/api/conversations/[id]` — read / rename+pin / delete a single conversation
 * (docs/features/chat-history § API Design; HIST-US-4, HIST-US-7, HIST-US-8,
 * HIST-US-9, AC-4.1, AC-4.2, AC-8.1, BR-H1, BR-H8).
 *
 *   GET    → 200 { id, title, format, pinned, archived, folderId,
 *                  pinnedMessageIds, pinnedArtifacts, turns: ChatTurn[] }
 *   PATCH  → 200 { ok: true }   body { title?, pinned?, archived?, folder_id? }
 *   DELETE → 200 { ok: true }   permanent
 *
 * Isolation (BR-H1): a conversation that belongs to another account is
 * indistinguishable from a missing one — all three return **404** (never 403,
 * no existence leak). Guests get **401**.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import type { ChatTurn } from "@/components/types";
import type { OakAnswer } from "@/agent/schemas";
import {
  artifactPinRepo,
  currentAccount,
  conversationRepo,
} from "../_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upper bound for a user-supplied rename (auto-titles are ≤60; allow longer). */
const MAX_RENAME_LEN = 120;

type Ctx = { params: Promise<{ id: string }> };

const UNAUTHORIZED = () =>
  jsonError(401, "unauthorized", "You must be signed in.");
const NOT_FOUND = () =>
  jsonError(404, "not_found", "Conversation not found.");

// ---------------------------------------------------------------------------
// GET — full conversation with rehydrated turns
// ---------------------------------------------------------------------------

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const repo = await conversationRepo();
  const conv = await repo.getConversation(account.id, id);
  if (conv === null) return NOT_FOUND();

  const stored = await repo.getMessages(account.id, id);
  const turns: ChatTurn[] = [];
  for (const t of stored) {
    if (t.role === "user") {
      turns.push({ id: t.id, role: "user", content: t.textContent });
    } else if (t.answerJson) {
      // Rehydrate the full OakAnswer so it re-renders via the normal answer
      // card tree, not a plain-text fallback (BR-H3 / AC-4.1).
      turns.push({
        id: t.id,
        role: "assistant",
        answer: JSON.parse(t.answerJson) as OakAnswer,
      });
    }
  }

  // active_turn (background-turns/design.md §5.4): a live registry lookup by
  // conversation id + account, so a reopened thread knows to reattach even after
  // an app relaunch (when the client's own pending-turn pointer is gone).
  // Additive + best-effort — an in-process lookup, never a DB read.
  const { findRunningByConversation } = await import("@/server/turn-store");
  const running = findRunningByConversation(account.id, id);

  const pinnedMessageIds = await repo.listPinnedMessageIds(account.id, id);

  const pins = await artifactPinRepo();
  const pinnedArtifacts = (await pins.list(account.id, id)).map((pin) => ({
    id: pin.id,
    kind: pin.kind,
    title: pin.title,
    created_at: pin.createdAt,
  }));

  return json(200, {
    id: conv.id,
    title: conv.title,
    format: conv.format,
    pinned: conv.pinned,
    archived: conv.archived,
    folderId: conv.folderId,
    pinnedMessageIds,
    pinnedArtifacts,
    turns,
    active_turn: running ? { turn_id: running.turnId } : null,
  });
}

// ---------------------------------------------------------------------------
// PATCH — rename, pin, archive, folder
// ---------------------------------------------------------------------------

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const body = await readJsonObject(req);
  if (body === null) {
    return jsonError(400, "invalid_request", "Request body must be a JSON object.");
  }

  const hasTitle = body.title !== undefined;
  const hasPinned = body.pinned !== undefined;
  const hasArchived = body.archived !== undefined;
  const hasFolderId = body.folder_id !== undefined;
  if (!hasTitle && !hasPinned && !hasArchived && !hasFolderId) {
    return jsonError(
      400,
      "invalid_request",
      "Provide at least one of { title, pinned, archived, folder_id }.",
    );
  }

  let title: string | undefined;
  if (hasTitle) {
    if (typeof body.title !== "string") {
      return jsonError(400, "invalid_request", "title must be a string.");
    }
    title = body.title.trim();
    if (title.length === 0 || title.length > MAX_RENAME_LEN) {
      return jsonError(
        400,
        "invalid_title",
        `title must be 1–${MAX_RENAME_LEN} characters.`,
      );
    }
  }

  let pinned: boolean | undefined;
  if (hasPinned) {
    if (typeof body.pinned !== "boolean") {
      return jsonError(400, "invalid_request", "pinned must be a boolean.");
    }
    pinned = body.pinned;
  }

  let archived: boolean | undefined;
  if (hasArchived) {
    if (typeof body.archived !== "boolean") {
      return jsonError(400, "invalid_request", "archived must be a boolean.");
    }
    archived = body.archived;
  }

  let folderId: string | null | undefined;
  if (hasFolderId) {
    if (body.folder_id !== null && typeof body.folder_id !== "string") {
      return jsonError(
        400,
        "invalid_request",
        "folder_id must be a string or null.",
      );
    }
    folderId = body.folder_id;
  }

  const repo = await conversationRepo();
  // Ownership check up front so a not-owned id is a 404 (BR-H1), not a silent
  // no-op masquerading as success.
  const conv = await repo.getConversation(account.id, id);
  if (conv === null) return NOT_FOUND();

  if (title !== undefined) await repo.renameConversation(account.id, id, title);
  if (pinned !== undefined) await repo.setPinned(account.id, id, pinned);
  if (archived !== undefined) await repo.setArchived(account.id, id, archived);
  if (folderId !== undefined) {
    try {
      await repo.setFolder(account.id, id, folderId);
    } catch (err) {
      if (err instanceof Error && err.message === "folder not found") {
        return NOT_FOUND();
      }
      throw err;
    }
  }

  return json(200, { ok: true });
}

// ---------------------------------------------------------------------------
// DELETE — permanent (BR-H8)
// ---------------------------------------------------------------------------

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const repo = await conversationRepo();
  // Ownership check so another account's id returns 404 (isolation, AC-2.2). A
  // client that deletes an already-gone conversation gets 404, which the
  // history client treats as success (idempotent UX).
  const conv = await repo.getConversation(account.id, id);
  if (conv === null) return NOT_FOUND();

  await repo.deleteConversation(account.id, id);
  return json(200, { ok: true });
}
