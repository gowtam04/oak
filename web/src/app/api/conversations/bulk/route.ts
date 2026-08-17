/**
 * `POST /api/conversations/bulk` — delete / archive / unarchive / move many
 * conversations (docs/features/chat-qol ORG-US-3, ORG-BR-4).
 *
 *   { ids, action, folder_id? } → 200 { updated, skipped }
 *
 * Unknown / not-owned ids are skipped (not a 404 for the batch). Empty `ids`
 * is 400. Signed-in only.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import { currentAccount, conversationRepo } from "../_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["delete", "archive", "unarchive", "move"] as const;
type BulkAction = (typeof ACTIONS)[number];

const UNAUTHORIZED = () => json(401, { error: "unauthenticated" });

function isAction(value: unknown): value is BulkAction {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

/** Accept a folder UUID or `null` (unfile). Objects / other types are rejected. */
function parseFolderId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

export async function POST(req: Request): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();

  const body = await readJsonObject(req);
  if (body === null) {
    return jsonError(400, "invalid_request", "Request body must be a JSON object.");
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return jsonError(400, "invalid_request", "ids must be a non-empty array.");
  }
  const ids = body.ids;
  if (!ids.every((id): id is string => typeof id === "string" && id.length > 0)) {
    return jsonError(400, "invalid_request", "ids must be non-empty strings.");
  }

  if (!isAction(body.action)) {
    return jsonError(
      400,
      "invalid_request",
      "action must be delete, archive, unarchive, or move.",
    );
  }

  const folderId = parseFolderId(body.folder_id);
  if (body.action === "move" && folderId === undefined) {
    return jsonError(
      400,
      "invalid_request",
      "move requires folder_id (string or null).",
    );
  }

  const repo = await conversationRepo();
  const result = await repo.bulkUpdate(account.id, {
    ids,
    action: body.action,
    folder_id: folderId,
  });
  return json(200, result);
}
