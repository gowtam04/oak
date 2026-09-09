/**
 * folder-client — typed `fetch` helpers over the `/api/folders/*` routes
 * (docs/features/chat-qol ORG-US-1).
 *
 * Mirrors history-client.ts: helpers NEVER throw — a guest 401, 404, or
 * transport fault folds into a safe value (`[]` / `null` / `false`).
 */

export interface Folder {
  id: string;
  name: string;
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

function asFolder(raw: unknown): Folder | null {
  if (raw === null || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || typeof rec.name !== "string") return null;
  return {
    id: rec.id,
    name: rec.name,
    createdAt: typeof rec.createdAt === "number" ? rec.createdAt : 0,
  };
}

/** `GET /api/folders` — this account's folders, or `[]`. */
export async function listFolders(): Promise<Folder[]> {
  try {
    const res = await fetch("/api/folders", {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) return [];
    const body = await readJsonBody(res);
    if (!Array.isArray(body.folders)) return [];
    return body.folders
      .map(asFolder)
      .filter((f): f is Folder => f !== null);
  } catch {
    return [];
  }
}

/** `POST /api/folders` — create. 409 / 400 / fault → `null`. */
export async function createFolder(name: string): Promise<Folder | null> {
  try {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    return asFolder(await readJsonBody(res));
  } catch {
    return null;
  }
}

/** `PATCH /api/folders/:id` — rename. Failure → `null`. */
export async function renameFolder(
  id: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch(`/api/folders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    return typeof body.id === "string" && typeof body.name === "string"
      ? { id: body.id, name: body.name }
      : null;
  } catch {
    return null;
  }
}

/**
 * `DELETE /api/folders/:id` — unfiles conversations; does not delete them.
 * A 404 (already gone) counts as success for an idempotent UX.
 */
export async function deleteFolder(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/folders/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
