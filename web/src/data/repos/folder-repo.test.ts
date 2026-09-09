/**
 * Oracle tests for src/data/repos/folder-repo.ts — conversation folders
 * (docs/features/chat-qol). Asserts behaviour against a real migrated
 * Postgres schema (Testcontainers).
 *
 * The repo reads the `@/data/db` SINGLETON, so the harness installs the
 * fixture as the singleton BEFORE the first dynamic import.
 *
 * Expected exports:
 *   createFolder(accountId, name) → { id, name, createdAt }
 *   listFolders(accountId) → { id, name, createdAt }[]
 *   renameFolder(accountId, id, name) → { id, name }
 *   deleteFolder(accountId, id) → void  (unfiles conversations in the same txn)
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

import type { OakAnswer } from "@/agent/schemas";

type FolderRepo = typeof import("./folder-repo");
type ConversationRepo = typeof import("./conversation-repo");

let fix: PgFixture;
let folders: FolderRepo;
let conversations: ConversationRepo;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  folders = await import("./folder-repo");
  conversations = await import("./conversation-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE conversation, conversation_message, conversation_folder RESTART IDENTITY`,
  );
});

const ACCT_A = "account-a";
const ACCT_B = "account-b";
const SV = "scarlet-violet";

function makeAnswer(markdown: string): OakAnswer {
  return {
    status: "answered",
    answer_markdown: markdown,
    reasoning_markdown: "because reasons",
    citations: [],
    inferences: [],
    generation_basis: { generation: "gen-9", fallback: false },
  };
}

function errorText(err: unknown): string {
  if (err instanceof Error) {
    const extra = (err as Error & { code?: string }).code;
    return extra ? `${extra} ${err.message}` : err.message;
  }
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return String(err);
}

function expectCode(err: unknown, code: string): boolean {
  return errorText(err).includes(code);
}

async function appendThread(
  accountId: string,
  conversationId: string,
  title: string,
  now = 1000,
): Promise<void> {
  await conversations.appendTurnPair({
    accountId,
    conversationId,
    format: SV,
    userTurnId: conversations.newTurnId(),
    userMessage: title,
    assistantTurnId: conversations.newTurnId(),
    answer: makeAnswer("ok"),
    now,
  });
}

async function folderIdOn(conversationId: string): Promise<string | null> {
  const res = await fix.db.execute(
    sql`SELECT folder_id FROM conversation WHERE id = ${conversationId}`,
  );
  return ((res.rows[0] as { folder_id: string | null } | undefined)?.folder_id) ?? null;
}

async function archivedOn(conversationId: string): Promise<number> {
  const res = await fix.db.execute(
    sql`SELECT archived FROM conversation WHERE id = ${conversationId}`,
  );
  return (res.rows[0] as { archived: number }).archived;
}

async function fileIn(conversationId: string, folderId: string): Promise<void> {
  await fix.db.execute(
    sql`UPDATE conversation SET folder_id = ${folderId} WHERE id = ${conversationId}`,
  );
}

async function markArchived(conversationId: string): Promise<void> {
  await fix.db.execute(
    sql`UPDATE conversation SET archived = 1 WHERE id = ${conversationId}`,
  );
}

// ---------------------------------------------------------------------------
// create / list / rename / delete
// ---------------------------------------------------------------------------

describe("createFolder + listFolders", () => {
  it("creates a folder and lists it for the owning account (ORG-AC-1.1)", async () => {
    const created = await folders.createFolder(ACCT_A, "VGC");
    expect(created.name).toBe("VGC");
    expect(created.id).toBeTruthy();
    expect(typeof created.createdAt).toBe("number");

    const list = await folders.listFolders(ACCT_A);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, name: "VGC" });
  });

  it("trims the name and accepts a 40-character name", async () => {
    const created = await folders.createFolder(ACCT_A, "  Ladder  ");
    expect(created.name).toBe("Ladder");

    const forty = "n".repeat(40);
    const long = await folders.createFolder(ACCT_A, forty);
    expect(long.name).toBe(forty);
  });

  it("rejects a blank (after trim) or >40 character name", async () => {
    await expect(folders.createFolder(ACCT_A, "   ")).rejects.toThrow();
    await expect(folders.createFolder(ACCT_A, "")).rejects.toThrow();
    await expect(folders.createFolder(ACCT_A, "n".repeat(41))).rejects.toThrow();
    expect(await folders.listFolders(ACCT_A)).toEqual([]);
  });

  it("rejects a duplicate name per account, case-insensitive (folder_name_taken)", async () => {
    await folders.createFolder(ACCT_A, "VGC");
    await expect(folders.createFolder(ACCT_A, "vgc")).rejects.toSatisfy((e) =>
      expectCode(e, "folder_name_taken"),
    );
    await expect(folders.createFolder(ACCT_A, " VGC ")).rejects.toSatisfy((e) =>
      expectCode(e, "folder_name_taken"),
    );
    expect(await folders.listFolders(ACCT_A)).toHaveLength(1);
  });

  it("allows the same name on a different account", async () => {
    await folders.createFolder(ACCT_A, "VGC");
    const other = await folders.createFolder(ACCT_B, "VGC");
    expect(other.name).toBe("VGC");
    expect(await folders.listFolders(ACCT_A)).toHaveLength(1);
    expect(await folders.listFolders(ACCT_B)).toHaveLength(1);
  });

  it("rejects a 51st folder with folder_limit", async () => {
    for (let i = 0; i < 50; i++) {
      await folders.createFolder(ACCT_A, `Folder ${i}`);
    }
    expect(await folders.listFolders(ACCT_A)).toHaveLength(50);
    await expect(folders.createFolder(ACCT_A, "Folder 50")).rejects.toSatisfy((e) =>
      expectCode(e, "folder_limit"),
    );
    expect(await folders.listFolders(ACCT_A)).toHaveLength(50);
  });

  it("listFolders is account-scoped (AUTH-BR-5)", async () => {
    await folders.createFolder(ACCT_A, "Mine");
    expect(await folders.listFolders(ACCT_B)).toEqual([]);
  });
});

describe("renameFolder", () => {
  it("renames in place; conversations stay in the folder (ORG-AC-1.4)", async () => {
    const folder = await folders.createFolder(ACCT_A, "Old");
    const convId = randomUUID();
    await appendThread(ACCT_A, convId, "thread");
    await fileIn(convId, folder.id);

    const renamed = await folders.renameFolder(ACCT_A, folder.id, "New Name");
    expect(renamed).toMatchObject({ id: folder.id, name: "New Name" });

    const listed = await folders.listFolders(ACCT_A);
    expect(listed.map((f) => f.name)).toEqual(["New Name"]);
    expect(await folderIdOn(convId)).toBe(folder.id);
  });

  it("trims the new name and rejects a taken ILIKE name (folder_name_taken)", async () => {
    const a = await folders.createFolder(ACCT_A, "Alpha");
    await folders.createFolder(ACCT_A, "Beta");

    const renamed = await folders.renameFolder(ACCT_A, a.id, "  Gamma  ");
    expect(renamed.name).toBe("Gamma");

    await expect(folders.renameFolder(ACCT_A, a.id, "beta")).rejects.toSatisfy((e) =>
      expectCode(e, "folder_name_taken"),
    );
    expect((await folders.listFolders(ACCT_A)).map((f) => f.name).sort()).toEqual([
      "Beta",
      "Gamma",
    ]);
  });

  it("rejects a blank or >40 rename", async () => {
    const folder = await folders.createFolder(ACCT_A, "Keep");
    await expect(folders.renameFolder(ACCT_A, folder.id, "   ")).rejects.toThrow();
    await expect(folders.renameFolder(ACCT_A, folder.id, "n".repeat(41))).rejects.toThrow();
    expect((await folders.listFolders(ACCT_A))[0].name).toBe("Keep");
  });

  it("another account cannot rename it (AUTH-BR-5)", async () => {
    const folder = await folders.createFolder(ACCT_A, "Mine");
    await folders.renameFolder(ACCT_B, folder.id, "Hijacked").catch(() => undefined);
    expect((await folders.listFolders(ACCT_A))[0].name).toBe("Mine");
    expect(await folders.listFolders(ACCT_B)).toEqual([]);
  });
});

describe("deleteFolder", () => {
  it("unfiles conversations in one transaction and does not delete or archive them (ORG-BR-1, ORG-AC-1.5)", async () => {
    const folder = await folders.createFolder(ACCT_A, "VGC");
    const filedA = randomUUID();
    const filedB = randomUUID();
    const unfiled = randomUUID();
    await appendThread(ACCT_A, filedA, "filed A", 1000);
    await appendThread(ACCT_A, filedB, "filed B", 2000);
    await appendThread(ACCT_A, unfiled, "already unfiled", 3000);
    await fileIn(filedA, folder.id);
    await fileIn(filedB, folder.id);

    await folders.deleteFolder(ACCT_A, folder.id);

    expect(await folders.listFolders(ACCT_A)).toEqual([]);
    expect(await conversations.getConversation(ACCT_A, filedA)).not.toBeNull();
    expect(await conversations.getConversation(ACCT_A, filedB)).not.toBeNull();
    expect(await folderIdOn(filedA)).toBeNull();
    expect(await folderIdOn(filedB)).toBeNull();
    expect(await folderIdOn(unfiled)).toBeNull();
    expect(await archivedOn(filedA)).toBe(0);
    expect(await archivedOn(filedB)).toBe(0);
    expect(await conversations.getMessages(ACCT_A, filedA)).not.toEqual([]);
  });

  it("deleting an empty folder removes it and changes no conversations", async () => {
    const folder = await folders.createFolder(ACCT_A, "Empty");
    const convId = randomUUID();
    await appendThread(ACCT_A, convId, "unrelated");

    await folders.deleteFolder(ACCT_A, folder.id);

    expect(await folders.listFolders(ACCT_A)).toEqual([]);
    expect(await conversations.getConversation(ACCT_A, convId)).not.toBeNull();
    expect(await folderIdOn(convId)).toBeNull();
  });

  it("does not archive a filed conversation when the folder is deleted (ORG-BR-2)", async () => {
    const folder = await folders.createFolder(ACCT_A, "VGC");
    const convId = randomUUID();
    await appendThread(ACCT_A, convId, "thread");
    await fileIn(convId, folder.id);
    await markArchived(convId);

    await folders.deleteFolder(ACCT_A, folder.id);

    expect(await folderIdOn(convId)).toBeNull();
    expect(await archivedOn(convId)).toBe(1);
  });

  it("another account cannot delete it (AUTH-BR-5)", async () => {
    const folder = await folders.createFolder(ACCT_A, "Mine");
    const convId = randomUUID();
    await appendThread(ACCT_A, convId, "thread");
    await fileIn(convId, folder.id);

    await folders.deleteFolder(ACCT_B, folder.id).catch(() => undefined);
    expect(await folders.listFolders(ACCT_A)).toHaveLength(1);
    expect(await folderIdOn(convId)).toBe(folder.id);
  });
});
