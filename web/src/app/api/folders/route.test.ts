/**
 * HTTP tests for conversation folders (chat-qol ORG-US-1, ORG-BR-1/2/6).
 *
 *   GET    /api/folders      → 200 { folders: { id, name, createdAt }[] }
 *   POST   /api/folders      → 201 { id, name, createdAt }
 *   PATCH  /api/folders/:id  → 200 { id, name }
 *   DELETE /api/folders/:id  → 204 (unfiles; does not delete/archive chats)
 *
 * Signed-in only — guests get 401. Real migrated Postgres; only
 * `getCurrentAccount` is mocked.
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OakAnswer } from "@/agent/schemas";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import { createPgSchema, installAsSingleton, type PgFixture } from "../../../../test/support/pg";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";
const SV = "scarlet-violet";

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "ok",
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

type ListRoute = typeof import("./route");
type IdRoute = typeof import("./[id]/route");

let fix: PgFixture;
let list: ListRoute;
let byId: IdRoute;
let convRepo: typeof import("@/data/repos/conversation-repo");
let folderRepo: typeof import("@/data/repos/folder-repo");

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  list = await import("./route");
  byId = await import("./[id]/route");
  convRepo = await import("@/data/repos/conversation-repo");
  folderRepo = await import("@/data/repos/folder-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE conversation, conversation_message, conversation_folder RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
});

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({
    id,
    email: `${id}@x.test`,
    createdAt: 0,
    lastUsedScope: null,
  });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

function errId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  if (typeof rec.code === "string") return rec.code;
  if (typeof rec.error === "string") return rec.error;
  return undefined;
}

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

function post(body: unknown): Promise<Response> {
  return list.POST(
    new Request("http://t/api/folders", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function patch(id: string, body: unknown): Promise<Response> {
  return byId.PATCH(
    new Request(`http://t/api/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    idCtx(id),
  );
}

async function seedConv(accountId: string, id: string): Promise<void> {
  await convRepo.appendTurnPair({
    accountId,
    conversationId: id,
    format: SV,
    userTurnId: convRepo.newTurnId(),
    userMessage: "q",
    assistantTurnId: convRepo.newTurnId(),
    answer: ANSWER,
    now: Date.now(),
  });
}

// --- Guest gating (ORG-BR-6 / ORG-AC-1.6) ----------------------------------

describe("guest → 401 on every /api/folders route", () => {
  it("rejects GET / POST / PATCH / DELETE without a session", async () => {
    guest();
    const guestGet = await list.GET();
    expect(guestGet.status).toBe(401);
    expect(await guestGet.json()).toEqual({ error: "unauthenticated" });
    expect((await post({ name: "VGC" })).status).toBe(401);
    expect((await patch("f", { name: "X" })).status).toBe(401);
    expect(
      (await byId.DELETE(new Request("http://t/api/folders/f", { method: "DELETE" }), idCtx("f")))
        .status,
    ).toBe(401);
  });
});

// --- GET / POST ------------------------------------------------------------

describe("GET /api/folders", () => {
  it("returns an empty list for an account with no folders (ORG-AC-1.1)", async () => {
    signedIn(ACCT_A);
    const res = await list.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ folders: [] });
  });

  it("lists only this account's folders, ordered by name", async () => {
    signedIn(ACCT_A);
    await folderRepo.createFolder(ACCT_A, "Zebra");
    await folderRepo.createFolder(ACCT_A, "Alpha");
    await folderRepo.createFolder(ACCT_B, "Not yours");

    const body = await (await list.GET()).json();
    expect(body.folders.map((f: { name: string }) => f.name)).toEqual(["Alpha", "Zebra"]);
    expect(body.folders[0]).toEqual({
      id: expect.any(String),
      name: "Alpha",
      createdAt: expect.any(Number),
    });
  });
});

describe("POST /api/folders", () => {
  it("creates a folder (trimmed, 1–40) and returns 201 (ORG-AC-1.1)", async () => {
    signedIn(ACCT_A);
    const res = await post({ name: "  VGC  " });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: expect.any(String),
      name: "VGC",
      createdAt: expect.any(Number),
    });

    const listed = await (await list.GET()).json();
    expect(listed.folders).toHaveLength(1);
    expect(listed.folders[0].id).toBe(body.id);
  });

  it("accepts a 40-character name", async () => {
    signedIn(ACCT_A);
    const name = "n".repeat(40);
    const res = await post({ name });
    expect(res.status).toBe(201);
    expect((await res.json()).name).toBe(name);
  });

  it("400s a blank or >40 name", async () => {
    signedIn(ACCT_A);
    expect((await post({ name: "" })).status).toBe(400);
    expect((await post({ name: "   " })).status).toBe(400);
    expect((await post({ name: "n".repeat(41) })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    const listed = await (await list.GET()).json();
    expect(listed.folders).toEqual([]);
  });

  it("409s a duplicate name (case-insensitive) with folder_name_taken", async () => {
    signedIn(ACCT_A);
    expect((await post({ name: "VGC" })).status).toBe(201);
    const res = await post({ name: " vgc " });
    expect(res.status).toBe(409);
    expect(errId(await res.json())).toBe("folder_name_taken");
  });

  it("allows the same name on a different account", async () => {
    signedIn(ACCT_A);
    expect((await post({ name: "VGC" })).status).toBe(201);
    signedIn(ACCT_B);
    const res = await post({ name: "VGC" });
    expect(res.status).toBe(201);
    expect((await res.json()).name).toBe("VGC");
  });

  it("409s a 51st folder with folder_limit", async () => {
    signedIn(ACCT_A);
    for (let i = 0; i < 50; i++) {
      await folderRepo.createFolder(ACCT_A, `Folder ${i}`);
    }
    const res = await post({ name: "Folder 50" });
    expect(res.status).toBe(409);
    expect(errId(await res.json())).toBe("folder_limit");
  });
});

// --- PATCH / DELETE --------------------------------------------------------

describe("PATCH /api/folders/:id", () => {
  it("renames in place; conversations stay in the folder (ORG-AC-1.4)", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "Old");
    await seedConv(ACCT_A, "c");
    await convRepo.setFolder(ACCT_A, "c", folder.id);

    const res = await patch(folder.id, { name: "  New Name  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: folder.id, name: "New Name" });

    expect((await convRepo.getConversation(ACCT_A, "c"))?.folderId).toBe(folder.id);
  });

  it("409s a taken ILIKE name with folder_name_taken", async () => {
    signedIn(ACCT_A);
    const a = await folderRepo.createFolder(ACCT_A, "Alpha");
    await folderRepo.createFolder(ACCT_A, "Beta");
    const res = await patch(a.id, { name: "beta" });
    expect(res.status).toBe(409);
    expect(errId(await res.json())).toBe("folder_name_taken");
  });

  it("400s a blank or >40 rename", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "Keep");
    expect((await patch(folder.id, { name: "   " })).status).toBe(400);
    expect((await patch(folder.id, { name: "n".repeat(41) })).status).toBe(400);
    expect((await folderRepo.listFolders(ACCT_A))[0].name).toBe("Keep");
  });

  it("other account → 404 (no existence leak)", async () => {
    const folder = await folderRepo.createFolder(ACCT_A, "Mine");
    signedIn(ACCT_B);
    expect((await patch(folder.id, { name: "Hijacked" })).status).toBe(404);
    expect((await folderRepo.listFolders(ACCT_A))[0].name).toBe("Mine");
  });
});

describe("DELETE /api/folders/:id", () => {
  it("unfiles conversations and does not delete or archive them (ORG-AC-1.5, ORG-BR-2)", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "VGC");
    await seedConv(ACCT_A, "filed");
    await seedConv(ACCT_A, "unfiled");
    await convRepo.setFolder(ACCT_A, "filed", folder.id);
    await convRepo.setArchived(ACCT_A, "filed", true);

    const res = await byId.DELETE(
      new Request(`http://t/api/folders/${folder.id}`, { method: "DELETE" }),
      idCtx(folder.id),
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");

    expect(await folderRepo.listFolders(ACCT_A)).toEqual([]);
    expect(await convRepo.getConversation(ACCT_A, "filed")).toMatchObject({
      archived: true,
      folderId: null,
    });
    expect(await convRepo.getConversation(ACCT_A, "unfiled")).not.toBeNull();
    expect((await convRepo.getMessages(ACCT_A, "filed")).length).toBeGreaterThan(0);
  });

  it("deleting an empty folder is 204 and changes no conversations", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "Empty");
    await seedConv(ACCT_A, "c");

    const res = await byId.DELETE(
      new Request(`http://t/api/folders/${folder.id}`, { method: "DELETE" }),
      idCtx(folder.id),
    );
    expect(res.status).toBe(204);
    expect(await convRepo.getConversation(ACCT_A, "c")).not.toBeNull();
  });

  it("other account → 404; folder and filings survive", async () => {
    const folder = await folderRepo.createFolder(ACCT_A, "Mine");
    await seedConv(ACCT_A, "c");
    await convRepo.setFolder(ACCT_A, "c", folder.id);

    signedIn(ACCT_B);
    expect(
      (
        await byId.DELETE(
          new Request(`http://t/api/folders/${folder.id}`, { method: "DELETE" }),
          idCtx(folder.id),
        )
      ).status,
    ).toBe(404);
    expect(await folderRepo.listFolders(ACCT_A)).toHaveLength(1);
    expect((await convRepo.getConversation(ACCT_A, "c"))?.folderId).toBe(folder.id);
  });
});
