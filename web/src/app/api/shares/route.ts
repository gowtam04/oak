/**
 * `/api/shares` — create a public snapshot / list live Shared-by-me
 * (chat-qol Phase 4; SHARE-US-1, SHARE-US-4, SHARE-BR-1/2/5/9, AUTH-BR-6).
 *
 *   POST  body { conversation_id, assistant_message_id }
 *         → 201 { id, url }   url is origin-absolute `/a/{id}`
 *   GET   → 200 { shares: { id, url, conversationTitle, createdAt }[] }
 *
 * Signed-in only. Guests 401. A missing / foreign conversation or a
 * non-assistant message id is 404 (no existence leak). 409 `share_limit`
 * when the account already has 200 live shares.
 */

import { json, readJsonObject } from "@/app/api/auth/_lib/http";
import type { OakAnswer } from "@/agent/schemas";
import {
  UNAUTHORIZED,
  NOT_FOUND,
  conversationRepo,
  currentAccount,
  errorCode,
  shareError,
  shareRepo,
  shareUrl,
} from "./_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — Shared-by-me (live only)
// ---------------------------------------------------------------------------

export async function GET(_req: Request): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();

  const repo = await shareRepo();
  const rows = await repo.listLiveShares(account.id);
  return json(200, {
    shares: rows.map((s) => ({
      id: s.id,
      url: shareUrl(s.id),
      conversationTitle: s.conversationTitle,
      createdAt: s.createdAt,
    })),
  });
}

// ---------------------------------------------------------------------------
// POST — snapshot one user + assistant pair
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();

  const body = await readJsonObject(req);
  if (body === null) {
    return shareError(400, "invalid_request", "Request body must be a JSON object.");
  }
  if (
    typeof body.conversation_id !== "string" ||
    body.conversation_id.length === 0 ||
    typeof body.assistant_message_id !== "string" ||
    body.assistant_message_id.length === 0
  ) {
    return shareError(
      400,
      "invalid_request",
      "conversation_id and assistant_message_id are required.",
    );
  }

  const source = await loadShareSource(
    account.id,
    body.conversation_id,
    body.assistant_message_id,
  );
  if (source === null) return NOT_FOUND();

  const repo = await shareRepo();
  try {
    const created = await repo.createShare({
      accountId: account.id,
      conversationId: body.conversation_id,
      conversationTitle: source.title,
      questionText: source.question,
      answer: source.answer,
    });
    return json(201, { id: created.id, url: shareUrl(created.id) });
  } catch (err) {
    if (errorCode(err) === "share_limit") {
      return shareError(409, "share_limit", "Live share limit reached.");
    }
    throw err;
  }
}

/**
 * Load the assistant row + the immediately preceding user row (SHARE-BR-5).
 * Returns null for a missing/foreign conversation, a user-row id, or a
 * message with no predecessor — all indistinguishable 404s (AUTH-BR-6).
 */
async function loadShareSource(
  accountId: string,
  conversationId: string,
  assistantMessageId: string,
): Promise<{ title: string; question: string; answer: OakAnswer } | null> {
  const conv = await conversationRepo();
  const conversation = await conv.getConversation(accountId, conversationId);
  if (conversation === null) return null;

  const messages = await conv.getMessages(accountId, conversationId);
  const idx = messages.findIndex((m) => m.id === assistantMessageId);
  if (idx < 0) return null;
  const assistant = messages[idx];
  if (assistant.role !== "assistant" || !assistant.answerJson) return null;
  const prev = idx > 0 ? messages[idx - 1] : undefined;
  if (!prev || prev.role !== "user") return null;

  let answer: OakAnswer;
  try {
    answer = JSON.parse(assistant.answerJson) as OakAnswer;
  } catch {
    return null;
  }
  return {
    title: conversation.title,
    question: prev.textContent,
    answer,
  };
}
