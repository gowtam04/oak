/**
 * Oracle tests for src/data/repos/conversation-repo.ts — the sole Postgres
 * reader/writer for durable chat history (docs/features/chat-history). Asserts
 * behaviour against a real migrated Postgres schema (Testcontainers).
 *
 * Like accounts-repo.test.ts the repo reads the `@/data/db` SINGLETON, so the
 * harness installs the fixture as the singleton BEFORE the first dynamic import
 * of the repo, and `server-only` is neutralised under the vitest node env.
 *
 * Account isolation (BR-H1) is asserted explicitly: every read is account-scoped
 * and a different account sees null/[].
 *
 * Chat-qol Phase 1 helpers (replaceLastPair, folder/archive/bulk/fork/pins)
 * are asserted in additional describes at the bottom; they are not yet
 * exported — that is the intended red.
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
import type { ChatTurn } from "@/components/types";

type Repo = typeof import("./conversation-repo");

/** Phase 1 chat-qol helpers — not yet on the repo export. */
type ChatQolRepo = Repo & {
  replaceLastPair: (
    accountId: string,
    conversationId: string,
    userText: string,
    answer: OakAnswer,
  ) => Promise<void>;
  setArchived: (
    accountId: string,
    conversationId: string,
    archived: boolean,
  ) => Promise<void>;
  setFolder: (
    accountId: string,
    conversationId: string,
    folderId: string | null,
  ) => Promise<void>;
  bulkUpdate: (
    accountId: string,
    input: {
      ids: string[];
      action: "delete" | "archive" | "unarchive" | "move";
      folder_id?: string | null;
    },
  ) => Promise<{ updated: string[]; skipped: string[] }>;
  forkConversation: (
    accountId: string,
    sourceId: string,
    throughAssistantMessageId: string,
    newId: string,
  ) => Promise<{ id: string; title: string }>;
  setMessagePinned: (
    accountId: string,
    conversationId: string,
    messageId: string,
    pinned: boolean,
  ) => Promise<void>;
  listPinnedMessageIds: (
    accountId: string,
    conversationId: string,
  ) => Promise<string[]>;
};

type ListFilterOpts = {
  q?: string;
  format?: string;
  folder_id?: string;
  archived?: boolean;
  include_archived?: boolean;
};

type ConversationSummary = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  folderId: string | null;
};

let fix: PgFixture;
let repo: ChatQolRepo;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  repo = (await import("./conversation-repo")) as ChatQolRepo;
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE conversation, conversation_message, conversation_folder RESTART IDENTITY`,
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCT_A = "account-a";
const ACCT_B = "account-b";
const SV = "scarlet-violet";
const CH = "champions";

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

function userTurn(content: string): ChatTurn {
  return { id: randomUUID(), role: "user", content };
}
function assistantTurn(markdown: string): ChatTurn {
  return { id: randomUUID(), role: "assistant", answer: makeAnswer(markdown) };
}

async function append(
  accountId: string,
  conversationId: string,
  format: string,
  userMessage: string,
  answerMarkdown: string,
  now: number,
): Promise<void> {
  await repo.appendTurnPair({
    accountId,
    conversationId,
    format,
    userTurnId: repo.newTurnId(),
    userMessage,
    assistantTurnId: repo.newTurnId(),
    answer: makeAnswer(answerMarkdown),
    now,
  });
}

/** code or message — Phase 2 maps these to HTTP 409. */
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

async function insertFolder(
  accountId: string,
  name: string,
  id: string = randomUUID(),
  createdAt = 1000,
): Promise<string> {
  await fix.db.execute(
    sql`INSERT INTO conversation_folder (id, account_id, name, created_at)
        VALUES (${id}, ${accountId}, ${name}, ${createdAt})`,
  );
  return id;
}

async function messageIds(
  conversationId: string,
  role: "user" | "assistant",
): Promise<string[]> {
  const res = await fix.db.execute(
    sql`SELECT id FROM conversation_message
        WHERE conversation_id = ${conversationId} AND role = ${role}
        ORDER BY seq`,
  );
  return (res.rows as { id: string }[]).map((r) => r.id);
}

function listConversations(
  accountId: string,
  opts?: ListFilterOpts,
): Promise<ConversationSummary[]> {
  return (
    repo.listConversations as (
      a: string,
      o?: ListFilterOpts,
    ) => Promise<ConversationSummary[]>
  )(accountId, opts);
}

// ---------------------------------------------------------------------------
// appendTurnPair — creation, seq, continuation (BR-H2, BR-H7)
// ---------------------------------------------------------------------------

describe("appendTurnPair", () => {
  it("creates the conversation with a derived title + format on the first turn", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "What beats Garchomp?", "Ice types.", 1000);

    const conv = await repo.getConversation(ACCT_A, id);
    expect(conv).toMatchObject({
      id,
      accountId: ACCT_A,
      title: "What beats Garchomp?",
      format: SV,
      pinned: false,
      createdAt: 1000,
      updatedAt: 1000,
    });
  });

  it("stores both turns with monotonic seq, text_content, and assistant answer_json", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "hi", "hello there", 1000);

    const turns = await repo.getMessages(ACCT_A, id);
    expect(turns.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "hi"],
      [1, "assistant", "hello there"],
    ]);
    expect(turns[0].answerJson).toBeNull();
    const parsed = JSON.parse(turns[1].answerJson!) as OakAnswer;
    expect(parsed.answer_markdown).toBe("hello there");
    expect(parsed.status).toBe("answered");
  });

  it("continues the same conversation (seq advances, updated_at bumps, title fixed)", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "first question", "a1", 1000);
    await append(ACCT_A, id, SV, "second question", "a2", 2000);

    const conv = await repo.getConversation(ACCT_A, id);
    expect(conv?.createdAt).toBe(1000);
    expect(conv?.updatedAt).toBe(2000); // bumped
    expect(conv?.title).toBe("first question"); // fixed at creation

    const turns = await repo.getMessages(ACCT_A, id);
    expect(turns.map((t) => t.seq)).toEqual([0, 1, 2, 3]);
    expect(turns.map((t) => t.textContent)).toEqual([
      "first question",
      "a1",
      "second question",
      "a2",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Account isolation (BR-H1)
// ---------------------------------------------------------------------------

describe("account isolation", () => {
  it("getConversation / getMessages return null/[] for another account", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "private thread", "secret", 1000);

    expect(await repo.getConversation(ACCT_B, id)).toBeNull();
    expect(await repo.getMessages(ACCT_B, id)).toEqual([]);
    // owner still sees it
    expect(await repo.getConversation(ACCT_A, id)).not.toBeNull();
  });

  it("listConversations only returns the asking account's conversations", async () => {
    await append(ACCT_A, randomUUID(), SV, "A1", "x", 1000);
    await append(ACCT_B, randomUUID(), SV, "B1", "y", 1000);

    const listA = await repo.listConversations(ACCT_A);
    expect(listA).toHaveLength(1);
    expect(listA[0].title).toBe("A1");
  });
});

// ---------------------------------------------------------------------------
// listConversations — ordering + filters (HIST-US-3, HIST-US-10, HIST-US-11, BR-H11)
// ---------------------------------------------------------------------------

describe("listConversations", () => {
  it("orders pinned first, then most-recently-active", async () => {
    const older = randomUUID();
    const newer = randomUUID();
    const pinned = randomUUID();
    await append(ACCT_A, older, SV, "older", "x", 1000);
    await append(ACCT_A, newer, SV, "newer", "x", 3000);
    await append(ACCT_A, pinned, SV, "pinned", "x", 2000);
    await repo.setPinned(ACCT_A, pinned, true);

    const list = await repo.listConversations(ACCT_A);
    expect(list.map((c) => c.title)).toEqual(["pinned", "newer", "older"]);
    expect(list[0].pinned).toBe(true);
  });

  it("q filters by title (case-insensitive)", async () => {
    await append(ACCT_A, randomUUID(), SV, "Garchomp counters", "x", 1000);
    await append(ACCT_A, randomUUID(), SV, "Best Trick Room mons", "x", 2000);

    const list = await repo.listConversations(ACCT_A, { q: "garchomp" });
    expect(list.map((c) => c.title)).toEqual(["Garchomp counters"]);
  });

  it("q filters by message text, not just title (BR-H11)", async () => {
    const id = randomUUID();
    // title is the first user message ("hi"); the match is in a later turn.
    await append(ACCT_A, id, SV, "hi", "Iron Valiant outspeeds it.", 1000);
    await append(ACCT_A, randomUUID(), SV, "unrelated", "nothing here", 2000);

    const list = await repo.listConversations(ACCT_A, { q: "iron valiant" });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
  });

  it("format filters the list", async () => {
    await append(ACCT_A, randomUUID(), SV, "standard one", "x", 1000);
    await append(ACCT_A, randomUUID(), CH, "champions one", "x", 2000);

    const sv = await repo.listConversations(ACCT_A, { format: SV });
    expect(sv.map((c) => c.title)).toEqual(["standard one"]);
    const ch = await repo.listConversations(ACCT_A, { format: CH });
    expect(ch.map((c) => c.title)).toEqual(["champions one"]);
  });

  it("treats user-typed % literally (no wildcard surface)", async () => {
    await append(ACCT_A, randomUUID(), SV, "100% effective", "x", 1000);
    await append(ACCT_A, randomUUID(), SV, "plain title", "x", 2000);

    // A literal "%" should not match every title.
    const list = await repo.listConversations(ACCT_A, { q: "100%" });
    expect(list.map((c) => c.title)).toEqual(["100% effective"]);
  });
});

// ---------------------------------------------------------------------------
// importConversation — idempotent guest→sign-in bulk save (HIST-US-12, BR-H10)
// ---------------------------------------------------------------------------

describe("importConversation", () => {
  it("returns null and creates nothing for empty turns (AC-12.2)", async () => {
    const id = randomUUID();
    const result = await repo.importConversation({
      accountId: ACCT_A,
      id,
      format: SV,
      turns: [],
      now: 1000,
    });
    expect(result).toBeNull();
    expect(await repo.getConversation(ACCT_A, id)).toBeNull();
  });

  it("imports a thread (title from first user message, full fidelity)", async () => {
    const id = randomUUID();
    const turns = [
      userTurn("Build me a rain team"),
      assistantTurn("Here is a rain team..."),
      userTurn("make it weak to Trick Room instead"),
      assistantTurn("Adjusted..."),
    ];
    const result = await repo.importConversation({
      accountId: ACCT_A,
      id,
      format: CH,
      turns,
      now: 1000,
    });
    expect(result).toBe(id);

    const conv = await repo.getConversation(ACCT_A, id);
    expect(conv?.title).toBe("Build me a rain team");
    expect(conv?.format).toBe(CH);

    const stored = await repo.getMessages(ACCT_A, id);
    expect(stored.map((t) => [t.seq, t.role])).toEqual([
      [0, "user"],
      [1, "assistant"],
      [2, "user"],
      [3, "assistant"],
    ]);
    expect(JSON.parse(stored[1].answerJson!).answer_markdown).toBe(
      "Here is a rain team...",
    );
  });

  it("is idempotent — re-importing the same turns is a no-op", async () => {
    const id = randomUUID();
    const turns = [userTurn("hello"), assistantTurn("hi")];
    await repo.importConversation({ accountId: ACCT_A, id, format: SV, turns, now: 1000 });
    await repo.importConversation({ accountId: ACCT_A, id, format: SV, turns, now: 2000 });

    const stored = await repo.getMessages(ACCT_A, id);
    expect(stored).toHaveLength(2); // not duplicated
  });

  it("refuses to write into a conversation owned by another account (BR-H1)", async () => {
    const id = randomUUID();
    // Account A creates a conversation with this id.
    await append(ACCT_A, id, SV, "A owns this", "x", 1000);
    // Account B tries to import using the same id.
    const result = await repo.importConversation({
      accountId: ACCT_B,
      id,
      format: SV,
      turns: [userTurn("intrusion"), assistantTurn("nope")],
      now: 2000,
    });
    expect(result).toBeNull();
    // A's conversation is untouched; B sees nothing.
    expect((await repo.getMessages(ACCT_A, id)).map((t) => t.textContent)).toEqual([
      "A owns this",
      "x",
    ]);
    expect(await repo.getConversation(ACCT_B, id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rename / pin (HIST-US-7, HIST-US-9)
// ---------------------------------------------------------------------------

describe("rename + pin", () => {
  it("renameConversation persists and is account-scoped", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "old title", "x", 1000);

    await repo.renameConversation(ACCT_A, id, "New Name");
    expect((await repo.getConversation(ACCT_A, id))?.title).toBe("New Name");

    // Another account cannot rename it (no-op).
    await repo.renameConversation(ACCT_B, id, "Hijacked");
    expect((await repo.getConversation(ACCT_A, id))?.title).toBe("New Name");
  });

  it("setPinned toggles the pinned flag", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "t", "x", 1000);

    await repo.setPinned(ACCT_A, id, true);
    expect((await repo.getConversation(ACCT_A, id))?.pinned).toBe(true);
    await repo.setPinned(ACCT_A, id, false);
    expect((await repo.getConversation(ACCT_A, id))?.pinned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteConversation — permanent + scoped (HIST-US-8, BR-H8)
// ---------------------------------------------------------------------------

describe("deleteConversation", () => {
  it("removes the conversation and all its messages", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "doomed", "x", 1000);

    await repo.deleteConversation(ACCT_A, id);
    expect(await repo.getConversation(ACCT_A, id)).toBeNull();
    expect(await repo.getMessages(ACCT_A, id)).toEqual([]);
  });

  it("is idempotent (deleting an absent id is a no-op)", async () => {
    await expect(
      repo.deleteConversation(ACCT_A, "no-such-id"),
    ).resolves.toBeUndefined();
  });

  it("does not delete another account's conversation", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "A's thread", "x", 1000);

    await repo.deleteConversation(ACCT_B, id); // wrong account → no-op
    expect(await repo.getConversation(ACCT_A, id)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// no active-team column: appendTurnPair / importConversation create + restore a
// conversation without any team binding (teams are referenced by name in chat).
// ---------------------------------------------------------------------------

describe("no active-team column", () => {
  it("getConversation never exposes an activeTeamId field", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "thread", "x", 1000);
    const conv = await repo.getConversation(ACCT_A, id);
    expect(conv).not.toBeNull();
    expect(conv).not.toHaveProperty("activeTeamId");
  });

  it("importConversation restores a conversation without a team binding", async () => {
    const id = randomUUID();
    const result = await repo.importConversation({
      accountId: ACCT_A,
      id,
      format: SV,
      turns: [userTurn("hi"), assistantTurn("hello")],
      now: 1000,
    });
    expect(result).toBe(id);
    const conv = await repo.getConversation(ACCT_A, id);
    expect(conv?.format).toBe(SV);
    expect(conv).not.toHaveProperty("activeTeamId");
  });
});

// ---------------------------------------------------------------------------
// replaceLastPair — retry/edit persist (REC-BR-2, REC-BR-4)
// ---------------------------------------------------------------------------

describe("replaceLastPair", () => {
  it("replaces the last user+assistant pair, reuses both seq values, and bumps updated_at without changing title (REC-BR-2)", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "first question", "a1", 1000);
    await append(ACCT_A, id, SV, "second question", "a2", 2000);

    await repo.replaceLastPair(
      ACCT_A,
      id,
      "second question edited",
      makeAnswer("a2-retry"),
    );

    const conv = await repo.getConversation(ACCT_A, id);
    expect(conv?.title).toBe("first question");
    expect(conv?.updatedAt).toBeGreaterThan(2000);

    const turns = await repo.getMessages(ACCT_A, id);
    expect(turns.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "first question"],
      [1, "assistant", "a1"],
      [2, "user", "second question edited"],
      [3, "assistant", "a2-retry"],
    ]);
    expect(JSON.parse(turns[3].answerJson!).answer_markdown).toBe("a2-retry");
    // Exactly one current pair for that last question — old last pair is gone.
    expect(turns.filter((t) => t.textContent === "second question")).toHaveLength(0);
    expect(turns.filter((t) => t.textContent === "a2")).toHaveLength(0);
  });

  it("replacing the only pair still keeps the original title (REC-BR-2)", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "What beats Garchomp?", "Ice types.", 1000);

    await repo.replaceLastPair(ACCT_A, id, "What beats Garchomp really?", makeAnswer("Ice Beam."));

    const conv = await repo.getConversation(ACCT_A, id);
    expect(conv?.title).toBe("What beats Garchomp?");
    const turns = await repo.getMessages(ACCT_A, id);
    expect(turns).toHaveLength(2);
    expect(turns.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "What beats Garchomp really?"],
      [1, "assistant", "Ice Beam."],
    ]);
  });

  it("rejects an empty thread with nothing_to_replace", async () => {
    const id = randomUUID();
    await fix.db.execute(
      sql`INSERT INTO conversation (id, account_id, title, format, pinned, created_at, updated_at)
          VALUES (${id}, ${ACCT_A}, 'Empty', ${SV}, 0, 1000, 1000)`,
    );

    await expect(
      repo.replaceLastPair(ACCT_A, id, "q", makeAnswer("a")),
    ).rejects.toSatisfy((e) => expectCode(e, "nothing_to_replace"));
    expect(await repo.getMessages(ACCT_A, id)).toEqual([]);
  });

  it("rejects when the last message is a lone user row (nothing_to_replace)", async () => {
    const id = randomUUID();
    await fix.db.execute(
      sql`INSERT INTO conversation (id, account_id, title, format, pinned, created_at, updated_at)
          VALUES (${id}, ${ACCT_A}, 'Partial', ${SV}, 0, 1000, 1000)`,
    );
    await fix.db.execute(
      sql`INSERT INTO conversation_message (id, conversation_id, account_id, seq, role, text_content, answer_json, created_at)
          VALUES (${randomUUID()}, ${id}, ${ACCT_A}, 0, 'user', 'only user', NULL, 1000)`,
    );

    await expect(
      repo.replaceLastPair(ACCT_A, id, "q", makeAnswer("a")),
    ).rejects.toSatisfy((e) => expectCode(e, "nothing_to_replace"));
    expect((await repo.getMessages(ACCT_A, id)).map((t) => t.role)).toEqual(["user"]);
  });

  it("rejects when the last two rows are not [user, assistant] (nothing_to_replace)", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "q1", "a1", 1000);
    await fix.db.execute(
      sql`INSERT INTO conversation_message (id, conversation_id, account_id, seq, role, text_content, answer_json, created_at)
          VALUES (${randomUUID()}, ${id}, ${ACCT_A}, 2, 'user', 'trailing user', NULL, 2000)`,
    );

    await expect(
      repo.replaceLastPair(ACCT_A, id, "q", makeAnswer("a")),
    ).rejects.toSatisfy((e) => expectCode(e, "nothing_to_replace"));
    expect((await repo.getMessages(ACCT_A, id)).map((t) => t.textContent)).toEqual([
      "q1",
      "a1",
      "trailing user",
    ]);
  });

  it("rejects another account's conversation (BR-H1 / AUTH-BR-5)", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "private", "secret", 1000);

    await expect(
      repo.replaceLastPair(ACCT_B, id, "hijack", makeAnswer("nope")),
    ).rejects.toThrow();

    const turns = await repo.getMessages(ACCT_A, id);
    expect(turns.map((t) => t.textContent)).toEqual(["private", "secret"]);
  });
});

// ---------------------------------------------------------------------------
// listConversations — folder + archive filters (ORG-BR-1, ORG-BR-2, ORG-BR-3)
// ---------------------------------------------------------------------------

describe("listConversations — folder + archive filters", () => {
  it("defaults to non-archived conversations (ORG-BR-3)", async () => {
    const live = randomUUID();
    const archived = randomUUID();
    await append(ACCT_A, live, SV, "live thread", "x", 1000);
    await append(ACCT_A, archived, SV, "archived thread", "x", 2000);
    await repo.setArchived(ACCT_A, archived, true);

    const list = await listConversations(ACCT_A);
    expect(list.map((c) => c.id)).toEqual([live]);
    expect(list[0].archived).toBe(false);
  });

  it("archived:true returns only archived conversations (ORG-US-2)", async () => {
    const live = randomUUID();
    const archived = randomUUID();
    await append(ACCT_A, live, SV, "live thread", "x", 1000);
    await append(ACCT_A, archived, SV, "archived thread", "x", 2000);
    await repo.setArchived(ACCT_A, archived, true);

    const list = await listConversations(ACCT_A, { archived: true });
    expect(list.map((c) => c.id)).toEqual([archived]);
    expect(list[0].archived).toBe(true);
  });

  it("does not show an archived conversation even if it is pinned (ORG-BR-3)", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "pinned archived", "x", 1000);
    await repo.setPinned(ACCT_A, id, true);
    await repo.setArchived(ACCT_A, id, true);

    expect(await listConversations(ACCT_A)).toEqual([]);
    expect((await listConversations(ACCT_A, { archived: true })).map((c) => c.id)).toEqual([
      id,
    ]);
  });

  it("folder_id uuid lists only non-archived conversations in that folder (ORG-AC-1.3)", async () => {
    const folderId = await insertFolder(ACCT_A, "VGC");
    const inFolder = randomUUID();
    const inFolderArchived = randomUUID();
    const unfiled = randomUUID();
    await append(ACCT_A, inFolder, SV, "filed live", "x", 1000);
    await append(ACCT_A, inFolderArchived, SV, "filed archived", "x", 2000);
    await append(ACCT_A, unfiled, SV, "unfiled live", "x", 3000);
    await repo.setFolder(ACCT_A, inFolder, folderId);
    await repo.setFolder(ACCT_A, inFolderArchived, folderId);
    await repo.setArchived(ACCT_A, inFolderArchived, true);

    const list = await listConversations(ACCT_A, { folder_id: folderId });
    expect(list.map((c) => c.id)).toEqual([inFolder]);
    expect(list[0].folderId).toBe(folderId);
  });

  it("folder_id 'unfiled' lists only non-archived conversations with no folder (ORG-BR-1)", async () => {
    const folderId = await insertFolder(ACCT_A, "Ladder");
    const filed = randomUUID();
    const unfiled = randomUUID();
    const unfiledArchived = randomUUID();
    await append(ACCT_A, filed, SV, "filed", "x", 1000);
    await append(ACCT_A, unfiled, SV, "unfiled", "x", 2000);
    await append(ACCT_A, unfiledArchived, SV, "unfiled archived", "x", 3000);
    await repo.setFolder(ACCT_A, filed, folderId);
    await repo.setArchived(ACCT_A, unfiledArchived, true);

    const list = await listConversations(ACCT_A, { folder_id: "unfiled" });
    expect(list.map((c) => c.id)).toEqual([unfiled]);
    expect(list[0].folderId).toBeNull();
  });

  it("include_archived on search returns matching archived rows (ORG-AC-2.4)", async () => {
    const live = randomUUID();
    const archived = randomUUID();
    await append(ACCT_A, live, SV, "Garchomp live", "x", 1000);
    await append(ACCT_A, archived, SV, "Garchomp archived", "x", 2000);
    await repo.setArchived(ACCT_A, archived, true);

    const defaultSearch = await listConversations(ACCT_A, { q: "garchomp" });
    expect(defaultSearch.map((c) => c.id)).toEqual([live]);

    const withArchived = await listConversations(ACCT_A, {
      q: "garchomp",
      include_archived: true,
    });
    expect(withArchived.map((c) => c.id).sort()).toEqual([live, archived].sort());
  });

  it("does not leak another account's conversations through folder/archive filters (AUTH-BR-5)", async () => {
    const folderId = await insertFolder(ACCT_A, "Mine");
    const id = randomUUID();
    await append(ACCT_A, id, SV, "secret", "x", 1000);
    await repo.setFolder(ACCT_A, id, folderId);

    expect(await listConversations(ACCT_B, { folder_id: folderId })).toEqual([]);
    expect(await listConversations(ACCT_B, { folder_id: "unfiled" })).toEqual([]);
    expect(await listConversations(ACCT_B, { archived: true })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setArchived / setFolder (ORG-BR-1, ORG-BR-2)
// ---------------------------------------------------------------------------

describe("setArchived + setFolder", () => {
  it("setArchived hides from the default list and keeps folder membership (ORG-BR-2)", async () => {
    const folderId = await insertFolder(ACCT_A, "VGC");
    const id = randomUUID();
    await append(ACCT_A, id, SV, "thread", "x", 1000);
    await repo.setFolder(ACCT_A, id, folderId);
    await repo.setArchived(ACCT_A, id, true);

    const conv = await repo.getConversation(ACCT_A, id);
    expect(conv as { archived?: boolean; folderId?: string | null }).toMatchObject({
      archived: true,
      folderId,
    });
    expect(await listConversations(ACCT_A)).toEqual([]);
    expect((await listConversations(ACCT_A, { archived: true }))[0]?.folderId).toBe(
      folderId,
    );
  });

  it("setArchived(false) returns the conversation to the default list", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "thread", "x", 1000);
    await repo.setArchived(ACCT_A, id, true);
    await repo.setArchived(ACCT_A, id, false);

    expect((await listConversations(ACCT_A)).map((c) => c.id)).toEqual([id]);
    expect((await repo.getConversation(ACCT_A, id) as { archived?: boolean }).archived).toBe(
      false,
    );
  });

  it("setFolder(null) unfiles; a conversation is in one folder or unfiled (ORG-BR-1)", async () => {
    const a = await insertFolder(ACCT_A, "A");
    const b = await insertFolder(ACCT_A, "B");
    const id = randomUUID();
    await append(ACCT_A, id, SV, "thread", "x", 1000);

    await repo.setFolder(ACCT_A, id, a);
    expect((await repo.getConversation(ACCT_A, id) as { folderId?: string | null }).folderId).toBe(a);

    await repo.setFolder(ACCT_A, id, b);
    expect((await repo.getConversation(ACCT_A, id) as { folderId?: string | null }).folderId).toBe(b);
    expect((await listConversations(ACCT_A, { folder_id: a })).map((c) => c.id)).toEqual([]);
    expect((await listConversations(ACCT_A, { folder_id: b })).map((c) => c.id)).toEqual([id]);

    await repo.setFolder(ACCT_A, id, null);
    expect((await repo.getConversation(ACCT_A, id) as { folderId?: string | null }).folderId).toBeNull();
    expect((await listConversations(ACCT_A, { folder_id: "unfiled" })).map((c) => c.id)).toEqual([
      id,
    ]);
  });

  it("setFolder / setArchived are no-ops for another account (AUTH-BR-5)", async () => {
    const folderId = await insertFolder(ACCT_A, "Mine");
    const id = randomUUID();
    await append(ACCT_A, id, SV, "thread", "x", 1000);

    await repo.setFolder(ACCT_B, id, folderId);
    await repo.setArchived(ACCT_B, id, true);

    const conv = await repo.getConversation(ACCT_A, id);
    expect(conv as { archived?: boolean; folderId?: string | null }).toMatchObject({
      archived: false,
      folderId: null,
    });
  });

  it("does not file into another account's folder", async () => {
    const foreign = await insertFolder(ACCT_B, "Not yours");
    const id = randomUUID();
    await append(ACCT_A, id, SV, "thread", "x", 1000);

    await repo.setFolder(ACCT_A, id, foreign).catch(() => undefined);
    expect((await repo.getConversation(ACCT_A, id) as { folderId?: string | null }).folderId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// bulkUpdate — skip unowned ids (ORG-US-3, ORG-BR-4, AUTH-BR-5)
// ---------------------------------------------------------------------------

describe("bulkUpdate", () => {
  it("bulk delete permanently removes owned conversations and skips foreign ids (ORG-BR-4)", async () => {
    const a1 = randomUUID();
    const a2 = randomUUID();
    const b1 = randomUUID();
    await append(ACCT_A, a1, SV, "A1", "x", 1000);
    await append(ACCT_A, a2, SV, "A2", "x", 2000);
    await append(ACCT_B, b1, SV, "B1", "x", 3000);

    const result = await repo.bulkUpdate(ACCT_A, {
      ids: [a1, b1, "no-such-id"],
      action: "delete",
    });
    expect(result.updated.sort()).toEqual([a1].sort());
    expect(result.skipped.sort()).toEqual([b1, "no-such-id"].sort());

    expect(await repo.getConversation(ACCT_A, a1)).toBeNull();
    expect(await repo.getMessages(ACCT_A, a1)).toEqual([]);
    expect(await repo.getConversation(ACCT_A, a2)).not.toBeNull();
    expect(await repo.getConversation(ACCT_B, b1)).not.toBeNull();
  });

  it("bulk archive / unarchive apply per owned id and do not unfile (ORG-BR-2)", async () => {
    const folderId = await insertFolder(ACCT_A, "VGC");
    const a1 = randomUUID();
    const a2 = randomUUID();
    const b1 = randomUUID();
    await append(ACCT_A, a1, SV, "A1", "x", 1000);
    await append(ACCT_A, a2, SV, "A2", "x", 2000);
    await append(ACCT_B, b1, SV, "B1", "x", 3000);
    await repo.setFolder(ACCT_A, a1, folderId);

    const archived = await repo.bulkUpdate(ACCT_A, {
      ids: [a1, b1],
      action: "archive",
    });
    expect(archived.updated).toEqual([a1]);
    expect(archived.skipped).toEqual([b1]);
    expect((await repo.getConversation(ACCT_A, a1) as { archived?: boolean; folderId?: string | null })).toMatchObject({
      archived: true,
      folderId,
    });
    expect((await repo.getConversation(ACCT_B, b1) as { archived?: boolean }).archived ?? false).toBe(false);

    const unarchived = await repo.bulkUpdate(ACCT_A, {
      ids: [a1],
      action: "unarchive",
    });
    expect(unarchived.updated).toEqual([a1]);
    expect((await repo.getConversation(ACCT_A, a1) as { archived?: boolean; folderId?: string | null })).toMatchObject({
      archived: false,
      folderId,
    });
  });

  it("bulk move updates folder_id (including null = unfile) and skips foreign ids (ORG-AC-3.3)", async () => {
    const folderId = await insertFolder(ACCT_A, "Ladder");
    const a1 = randomUUID();
    const a2 = randomUUID();
    const b1 = randomUUID();
    await append(ACCT_A, a1, SV, "A1", "x", 1000);
    await append(ACCT_A, a2, SV, "A2", "x", 2000);
    await append(ACCT_B, b1, SV, "B1", "x", 3000);

    const moved = await repo.bulkUpdate(ACCT_A, {
      ids: [a1, b1],
      action: "move",
      folder_id: folderId,
    });
    expect(moved.updated).toEqual([a1]);
    expect(moved.skipped).toEqual([b1]);
    expect((await repo.getConversation(ACCT_A, a1) as { folderId?: string | null }).folderId).toBe(folderId);
    expect((await repo.getConversation(ACCT_B, b1) as { folderId?: string | null }).folderId ?? null).toBeNull();

    const unfiled = await repo.bulkUpdate(ACCT_A, {
      ids: [a1, a2],
      action: "move",
      folder_id: null,
    });
    expect(unfiled.updated.sort()).toEqual([a1, a2].sort());
    expect((await repo.getConversation(ACCT_A, a1) as { folderId?: string | null }).folderId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// forkConversation (FORK-AC-1.1–1.4, FORK-BR-2)
// ---------------------------------------------------------------------------

describe("forkConversation", () => {
  it("copies the prefix through the chosen assistant card, including pins, and leaves the source unchanged (FORK-BR-2)", async () => {
    const sourceId = randomUUID();
    await append(ACCT_A, sourceId, CH, "rain team", "here is rain", 1000);
    await append(ACCT_A, sourceId, CH, "make it sun", "here is sun", 2000);
    await append(ACCT_A, sourceId, CH, "add TR", "here is TR", 3000);

    const [firstAsst, , thirdAsst] = await messageIds(sourceId, "assistant");
    await repo.setMessagePinned(ACCT_A, sourceId, firstAsst, true);
    await repo.setMessagePinned(ACCT_A, sourceId, thirdAsst, true);
    await repo.setPinned(ACCT_A, sourceId, true);

    const newId = randomUUID();
    const result = await repo.forkConversation(ACCT_A, sourceId, firstAsst, newId);
    expect(result).toEqual({ id: newId, title: "rain team (fork)" });

    const fork = await repo.getConversation(ACCT_A, newId);
    expect(fork as { format?: string; pinned?: boolean; archived?: boolean; folderId?: string | null }).toMatchObject({
      format: CH,
      pinned: false,
      archived: false,
      folderId: null,
    });

    const forkTurns = await repo.getMessages(ACCT_A, newId);
    expect(forkTurns.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "rain team"],
      [1, "assistant", "here is rain"],
    ]);

    const forkAsstIds = await messageIds(newId, "assistant");
    expect(await repo.listPinnedMessageIds(ACCT_A, newId)).toEqual(forkAsstIds);

    const source = await repo.getConversation(ACCT_A, sourceId);
    expect(source?.pinned).toBe(true);
    expect((await repo.getMessages(ACCT_A, sourceId)).map((t) => t.textContent)).toEqual([
      "rain team",
      "here is rain",
      "make it sun",
      "here is sun",
      "add TR",
      "here is TR",
    ]);
    expect(await repo.listPinnedMessageIds(ACCT_A, sourceId)).toEqual([
      firstAsst,
      thirdAsst,
    ]);
  });

  it("does not copy pins after the fork point (FORK-AC-1.3)", async () => {
    const sourceId = randomUUID();
    await append(ACCT_A, sourceId, SV, "q1", "a1", 1000);
    await append(ACCT_A, sourceId, SV, "q2", "a2", 2000);
    const [firstAsst, secondAsst] = await messageIds(sourceId, "assistant");
    await repo.setMessagePinned(ACCT_A, sourceId, firstAsst, true);
    await repo.setMessagePinned(ACCT_A, sourceId, secondAsst, true);

    const newId = randomUUID();
    await repo.forkConversation(ACCT_A, sourceId, firstAsst, newId);
    expect(await repo.listPinnedMessageIds(ACCT_A, newId)).toHaveLength(1);
    expect(await repo.getMessages(ACCT_A, newId)).toHaveLength(2);
  });

  it("truncates '{sourceTitle} (fork)' to 120 characters", async () => {
    const sourceId = randomUUID();
    await append(ACCT_A, sourceId, SV, "short", "a", 1000);
    const longTitle = "x".repeat(120);
    await repo.renameConversation(ACCT_A, sourceId, longTitle);
    const [asst] = await messageIds(sourceId, "assistant");

    const result = await repo.forkConversation(ACCT_A, sourceId, asst, randomUUID());
    expect(result.title.length).toBeLessThanOrEqual(120);
    expect(result.title).toBe(`${longTitle} (fork)`.slice(0, 120));
  });

  it("fork of an archived, filed source is unfiled and not archived (FORK-AC-1.4)", async () => {
    const folderId = await insertFolder(ACCT_A, "VGC");
    const sourceId = randomUUID();
    await append(ACCT_A, sourceId, SV, "source", "a", 1000);
    await repo.setFolder(ACCT_A, sourceId, folderId);
    await repo.setArchived(ACCT_A, sourceId, true);
    const [asst] = await messageIds(sourceId, "assistant");

    const newId = randomUUID();
    await repo.forkConversation(ACCT_A, sourceId, asst, newId);
    const fork = await repo.getConversation(ACCT_A, newId);
    expect(fork as { archived?: boolean; folderId?: string | null; format?: string }).toMatchObject({
      archived: false,
      folderId: null,
      format: SV,
    });
    // Source membership unchanged.
    expect(await repo.getConversation(ACCT_A, sourceId) as { archived?: boolean; folderId?: string | null }).toMatchObject({
      archived: true,
      folderId,
    });
  });

  it("rejects forking another account's conversation (AUTH-BR-5)", async () => {
    const sourceId = randomUUID();
    await append(ACCT_A, sourceId, SV, "private", "secret", 1000);
    const [asst] = await messageIds(sourceId, "assistant");
    const newId = randomUUID();

    await expect(
      repo.forkConversation(ACCT_B, sourceId, asst, newId),
    ).rejects.toThrow();
    expect(await repo.getConversation(ACCT_B, newId)).toBeNull();
    expect(await repo.getConversation(ACCT_A, sourceId)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// per-turn pins (PIN-BR-1) — independent of conversation pin
// ---------------------------------------------------------------------------

describe("message pins", () => {
  it("pins and unpins assistant messages; list is thread order (PIN-BR-1, PIN-AC-1.2)", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "q1", "a1", 1000);
    await append(ACCT_A, id, SV, "q2", "a2", 2000);
    const [first, second] = await messageIds(id, "assistant");

    // Pin later first so list order is seq, not pin time.
    await repo.setMessagePinned(ACCT_A, id, second, true);
    await repo.setMessagePinned(ACCT_A, id, first, true);
    expect(await repo.listPinnedMessageIds(ACCT_A, id)).toEqual([first, second]);

    await repo.setMessagePinned(ACCT_A, id, first, false);
    expect(await repo.listPinnedMessageIds(ACCT_A, id)).toEqual([second]);
  });

  it("rejects pinning a user message (PIN-BR-1)", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "q1", "a1", 1000);
    const [userId] = await messageIds(id, "user");

    await expect(repo.setMessagePinned(ACCT_A, id, userId, true)).rejects.toThrow();
    expect(await repo.listPinnedMessageIds(ACCT_A, id)).toEqual([]);
  });

  it("rejects a 51st pin with pin_limit", async () => {
    const id = randomUUID();
    for (let i = 0; i < 51; i++) {
      await append(ACCT_A, id, SV, `q${i}`, `a${i}`, 1000 + i);
    }
    const asst = await messageIds(id, "assistant");
    expect(asst).toHaveLength(51);
    for (let i = 0; i < 50; i++) {
      await repo.setMessagePinned(ACCT_A, id, asst[i], true);
    }
    expect(await repo.listPinnedMessageIds(ACCT_A, id)).toHaveLength(50);

    await expect(repo.setMessagePinned(ACCT_A, id, asst[50], true)).rejects.toSatisfy((e) =>
      expectCode(e, "pin_limit"),
    );
    expect(await repo.listPinnedMessageIds(ACCT_A, id)).toHaveLength(50);
  });

  it("conversation pin does not add or remove turn pins (PIN-AC-1.4)", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "q1", "a1", 1000);
    const [asst] = await messageIds(id, "assistant");
    await repo.setMessagePinned(ACCT_A, id, asst, true);
    await repo.setPinned(ACCT_A, id, true);
    expect(await repo.listPinnedMessageIds(ACCT_A, id)).toEqual([asst]);
    await repo.setPinned(ACCT_A, id, false);
    expect(await repo.listPinnedMessageIds(ACCT_A, id)).toEqual([asst]);
  });

  it("cannot pin another account's message (AUTH-BR-5)", async () => {
    const id = randomUUID();
    await append(ACCT_A, id, SV, "q1", "a1", 1000);
    const [asst] = await messageIds(id, "assistant");

    await expect(repo.setMessagePinned(ACCT_B, id, asst, true)).rejects.toThrow();
    expect(await repo.listPinnedMessageIds(ACCT_A, id)).toEqual([]);
    expect(await repo.listPinnedMessageIds(ACCT_B, id)).toEqual([]);
  });
});
