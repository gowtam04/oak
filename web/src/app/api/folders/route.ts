/**
 * `/api/folders` — list / create conversation folders
 * (docs/features/chat-qol § Folders; ORG-US-1, ORG-BR-1/6).
 *
 *   GET  → 200 { folders: { id, name, createdAt }[] }
 *   POST → 201 { id, name, createdAt }   body { name }
 *
 * Signed-in only (ORG-BR-6). 409 `folder_limit` / `folder_name_taken`.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import {
  currentAccount,
  errorCode,
  folderRepo,
} from "../conversations/_lib/route-helpers";
import { FOLDER_NAME_MAX, parseFolderName } from "./_lib/parse-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNAUTHORIZED = () => json(401, { error: "unauthenticated" });

export async function GET(): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();

  const repo = await folderRepo();
  const folders = await repo.listFolders(account.id);
  return json(200, { folders });
}

export async function POST(req: Request): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();

  const body = await readJsonObject(req);
  if (body === null) {
    return jsonError(400, "invalid_request", "Request body must be a JSON object.");
  }

  const name = parseFolderName(body.name);
  if (name === null) {
    return jsonError(
      400,
      "invalid_request",
      `name must be 1–${FOLDER_NAME_MAX} characters.`,
    );
  }

  const repo = await folderRepo();
  try {
    const created = await repo.createFolder(account.id, name);
    return json(201, created);
  } catch (err) {
    const code = errorCode(err);
    if (code === "folder_limit" || code === "folder_name_taken") {
      return jsonError(409, code, code);
    }
    throw err;
  }
}
