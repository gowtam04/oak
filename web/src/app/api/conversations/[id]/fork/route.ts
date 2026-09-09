/**
 * `POST /api/conversations/:id/fork` — copy a prefix into a new conversation
 * (docs/features/chat-qol FORK-US-1, FORK-BR-1/2).
 *
 *   { through_message_id } → 201 { id, title }
 *
 * Server-mints the new conversation id. Source is unchanged. Signed-in only.
 */

import { randomUUID } from "node:crypto";

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import { currentAccount, conversationRepo } from "../../_lib/route-helpers";

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

  if (typeof body.through_message_id !== "string" || body.through_message_id.length === 0) {
    return jsonError(400, "invalid_request", "through_message_id is required.");
  }

  const repo = await conversationRepo();
  try {
    const created = await repo.forkConversation(
      account.id,
      id,
      body.through_message_id,
      randomUUID(),
    );
    return json(201, created);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === "conversation not found" || err.message === "fork point not found")
    ) {
      return NOT_FOUND();
    }
    throw err;
  }
}
