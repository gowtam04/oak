/**
 * `POST /api/conversations/:id/pins` — pin / unpin an assistant turn
 * (docs/features/chat-qol PIN-US-1, PIN-BR-1/2).
 *
 *   { message_id, pinned } → 200 { pinnedMessageIds }
 *
 * Assistant rows only. Cap 50 → 409 `pin_limit`. Independent of the
 * conversation-level sidebar pin. Signed-in only.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import {
  currentAccount,
  conversationRepo,
  errorCode,
} from "../../_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UNAUTHORIZED = () => json(401, { error: "unauthenticated" });
const NOT_FOUND = () =>
  jsonError(404, "not_found", "Conversation not found.");

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const body = await readJsonObject(req);
  if (body === null) {
    return jsonError(400, "invalid_request", "Request body must be a JSON object.");
  }

  if (typeof body.message_id !== "string" || body.message_id.length === 0) {
    return jsonError(400, "invalid_request", "message_id is required.");
  }
  if (typeof body.pinned !== "boolean") {
    return jsonError(400, "invalid_request", "pinned must be a boolean.");
  }

  const repo = await conversationRepo();
  try {
    await repo.setMessagePinned(account.id, id, body.message_id, body.pinned);
  } catch (err) {
    const code = errorCode(err);
    if (code === "pin_limit") {
      return jsonError(409, "pin_limit", "pin_limit");
    }
    if (err instanceof Error && err.message === "message not found") {
      return NOT_FOUND();
    }
    if (err instanceof Error && err.message === "only assistant messages can be pinned") {
      return jsonError(400, "invalid_request", err.message);
    }
    throw err;
  }

  const pinnedMessageIds = await repo.listPinnedMessageIds(account.id, id);
  return json(200, { pinnedMessageIds });
}
