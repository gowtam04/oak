/**
 * `/api/folders/[id]` — rename / delete a conversation folder
 * (docs/features/chat-qol § Folders; ORG-AC-1.4, ORG-AC-1.5, ORG-BR-2).
 *
 *   PATCH  → 200 { id, name }   body { name }
 *   DELETE → 204                 unfiles conversations; does not delete them
 *
 * Isolation: another account's folder is 404 (no existence leak). Guests 401.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import {
  currentAccount,
  errorCode,
  folderRepo,
} from "../../conversations/_lib/route-helpers";
import { parseFolderName } from "../_lib/parse-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UNAUTHORIZED = () => json(401, { error: "unauthenticated" });
const NOT_FOUND = () => jsonError(404, "not_found", "Folder not found.");

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const body = await readJsonObject(req);
  if (body === null) {
    return jsonError(400, "invalid_request", "Request body must be a JSON object.");
  }

  const name = parseFolderName(body.name);
  if (name === null) {
    return jsonError(400, "invalid_request", "name must be 1–40 characters.");
  }

  const repo = await folderRepo();
  try {
    const renamed = await repo.renameFolder(account.id, id, name);
    return json(200, renamed);
  } catch (err) {
    const code = errorCode(err);
    if (code === "folder_name_taken") {
      return jsonError(409, code, code);
    }
    if (err instanceof Error && err.message === "folder not found") {
      return NOT_FOUND();
    }
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const repo = await folderRepo();
  try {
    await repo.deleteFolder(account.id, id);
  } catch (err) {
    if (err instanceof Error && err.message === "folder not found") {
      return NOT_FOUND();
    }
    throw err;
  }
  return new Response(null, { status: 204 });
}
