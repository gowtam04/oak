/**
 * Oracle tests for src/data/repos/share-repo.ts — immutable public-share
 * snapshots (docs/features/chat-qol). Asserts behaviour against a real
 * migrated Postgres schema (Testcontainers).
 *
 * The repo reads the `@/data/db` SINGLETON, so the harness installs the
 * fixture as the singleton BEFORE the first dynamic import.
 *
 * Expected exports match api-design internal interfaces:
 *   createShare({ accountId, conversationId, conversationTitle, questionText, answer })
 *   getLiveShare(id) → ShareRow | null   (null if missing OR revoked)
 *   listLiveShares(accountId) / countLiveShares(accountId)
 *   revokeShare(accountId, id) → boolean
 *   deleteSharesForAccount(accountId) → void
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

type ShareRepo = typeof import("./share-repo");
type ConversationRepo = typeof import("./conversation-repo");

let fix: PgFixture;
let shares: ShareRepo;
let conversations: ConversationRepo;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  shares = await import("./share-repo");
  conversations = await import("./conversation-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE shared_answer, conversation, conversation_message, conversation_folder RESTART IDENTITY`,
  );
});

const ACCT_A = "account-a";
const ACCT_B = "account-b";
const SV = "scarlet-violet";
const SHARE_ID_RE = /^[A-Za-z0-9_-]{21}$/;

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

function snapshotAnswer(row: {
  answer?: OakAnswer;
  answerJson?: string;
}): OakAnswer {
  if (row.answer) return row.answer;
  if (row.answerJson) return JSON.parse(row.answerJson) as OakAnswer;
  throw new Error("ShareRow has neither answer nor answerJson");
}

async function createShare(over: {
  accountId?: string;
  conversationId?: string;
  conversationTitle?: string;
  questionText?: string;
  answer?: OakAnswer;
} = {}) {
  return shares.createShare({
    accountId: over.accountId ?? ACCT_A,
    conversationId: over.conversationId ?? randomUUID(),
    conversationTitle: over.conversationTitle ?? "Rain team",
    questionText: over.questionText ?? "Build me rain",
    answer: over.answer ?? makeAnswer("Here is rain."),
  });
}

async function insertLiveShare(
  accountId: string,
  id: string,
  createdAt = 1000,
  revokedAt: number | null = null,
): Promise<void> {
  await fix.db.execute(
    sql`INSERT INTO shared_answer
          (id, account_id, conversation_id, conversation_title, question_text, answer_json, created_at, revoked_at)
        VALUES
          (${id}, ${accountId}, NULL, 'T', 'Q', ${JSON.stringify(makeAnswer("seed"))}, ${createdAt}, ${revokedAt})`,
  );
}

// ---------------------------------------------------------------------------
// create + getLive — snapshot fidelity (SHARE-BR-2)
// ---------------------------------------------------------------------------

describe("createShare + getLiveShare", () => {
  it("stores an immutable snapshot and returns it by id (SHARE-BR-2)", async () => {
    const answer = makeAnswer("Here is rain.");
    const conversationId = randomUUID();
    const created = await createShare({
      conversationId,
      conversationTitle: "Rain team",
      questionText: "Build me rain",
      answer,
    });
    expect(created.id).toMatch(SHARE_ID_RE);

    const live = await shares.getLiveShare(created.id);
    expect(live).not.toBeNull();
    expect(live).toMatchObject({
      id: created.id,
      accountId: ACCT_A,
      conversationId,
      conversationTitle: "Rain team",
      questionText: "Build me rain",
    });
    expect(snapshotAnswer(live!)).toEqual(answer);
    expect(typeof (live as { createdAt?: number }).createdAt).toBe("number");
  });

  it("mints unique unguessable ids", async () => {
    const a = await createShare();
    const b = await createShare();
    expect(a.id).toMatch(SHARE_ID_RE);
    expect(b.id).toMatch(SHARE_ID_RE);
    expect(a.id).not.toBe(b.id);
  });

  it("does not mutate the snapshot if the caller later mutates the answer object (SHARE-BR-2)", async () => {
    const answer = makeAnswer("original");
    const { id } = await createShare({ answer });
    answer.answer_markdown = "mutated";

    const live = await shares.getLiveShare(id);
    expect(snapshotAnswer(live!).answer_markdown).toBe("original");
  });

  it("returns null for a missing id", async () => {
    expect(await shares.getLiveShare("no-such-share-id-00001")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// revoke + live-only reads (SHARE-BR-3 owner-only)
// ---------------------------------------------------------------------------

describe("revokeShare", () => {
  it("hides a revoked share from getLiveShare and listLiveShares", async () => {
    const { id } = await createShare({ conversationTitle: "Keep me" });
    expect(await shares.revokeShare(ACCT_A, id)).toBe(true);

    expect(await shares.getLiveShare(id)).toBeNull();
    expect(await shares.listLiveShares(ACCT_A)).toEqual([]);
    expect(await shares.countLiveShares(ACCT_A)).toBe(0);
  });

  it("is owner-only — another account gets false and the share stays live", async () => {
    const { id } = await createShare();
    expect(await shares.revokeShare(ACCT_B, id)).toBe(false);
    expect(await shares.getLiveShare(id)).not.toBeNull();
    expect(await shares.listLiveShares(ACCT_A)).toHaveLength(1);
  });

  it("a second revoke is false (cannot restore; already dead)", async () => {
    const { id } = await createShare();
    expect(await shares.revokeShare(ACCT_A, id)).toBe(true);
    expect(await shares.revokeShare(ACCT_A, id)).toBe(false);
    expect(await shares.getLiveShare(id)).toBeNull();
  });
});

describe("listLiveShares + countLiveShares", () => {
  it("lists and counts only the caller's live shares", async () => {
    const liveA = await createShare({ accountId: ACCT_A, conversationTitle: "A live" });
    const revokedA = await createShare({ accountId: ACCT_A, conversationTitle: "A dead" });
    await createShare({ accountId: ACCT_B, conversationTitle: "B live" });
    await shares.revokeShare(ACCT_A, revokedA.id);

    const list = await shares.listLiveShares(ACCT_A);
    expect(list.map((s) => s.id)).toEqual([liveA.id]);
    expect(list[0]).toMatchObject({
      conversationTitle: "A live",
      accountId: ACCT_A,
    });
    expect(await shares.countLiveShares(ACCT_A)).toBe(1);
    expect(await shares.countLiveShares(ACCT_B)).toBe(1);
    expect(await shares.listLiveShares("nobody")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// conversation delete does not revoke (SHARE-BR-3)
// ---------------------------------------------------------------------------

describe("conversation delete vs shares", () => {
  it("getLiveShare still returns the snapshot after deleteConversation (SHARE-BR-3)", async () => {
    const convId = randomUUID();
    await conversations.appendTurnPair({
      accountId: ACCT_A,
      conversationId: convId,
      format: SV,
      userTurnId: conversations.newTurnId(),
      userMessage: "Build me rain",
      assistantTurnId: conversations.newTurnId(),
      answer: makeAnswer("Here is rain."),
      now: 1000,
    });
    const answer = makeAnswer("Here is rain.");
    const { id } = await createShare({
      conversationId: convId,
      conversationTitle: "Build me rain",
      questionText: "Build me rain",
      answer,
    });

    await conversations.deleteConversation(ACCT_A, convId);
    expect(await conversations.getConversation(ACCT_A, convId)).toBeNull();

    const live = await shares.getLiveShare(id);
    expect(live).not.toBeNull();
    expect(live).toMatchObject({
      id,
      questionText: "Build me rain",
      conversationTitle: "Build me rain",
    });
    expect(snapshotAnswer(live!)).toEqual(answer);
  });
});

// ---------------------------------------------------------------------------
// live cap 200 (data-model cap / SHARE-BR-9 as assigned)
// ---------------------------------------------------------------------------

describe("live share cap", () => {
  it("rejects the 201st live share with share_limit", async () => {
    for (let i = 0; i < 200; i++) {
      await insertLiveShare(ACCT_A, `s${i.toString().padStart(20, "0")}`, 1000 + i);
    }
    expect(await shares.countLiveShares(ACCT_A)).toBe(200);

    await expect(createShare({ accountId: ACCT_A })).rejects.toSatisfy((e) =>
      expectCode(e, "share_limit"),
    );
    expect(await shares.countLiveShares(ACCT_A)).toBe(200);
  });

  it("revoked shares do not count toward the 200 live cap", async () => {
    for (let i = 0; i < 200; i++) {
      await insertLiveShare(ACCT_A, `s${i.toString().padStart(20, "0")}`, 1000 + i);
    }
    const firstId = `s${"0".repeat(20)}`;
    expect(await shares.revokeShare(ACCT_A, firstId)).toBe(true);
    expect(await shares.countLiveShares(ACCT_A)).toBe(199);

    const created = await createShare({ accountId: ACCT_A });
    expect(created.id).toMatch(SHARE_ID_RE);
    expect(await shares.countLiveShares(ACCT_A)).toBe(200);
  });

  it("another account's live shares do not consume this account's cap", async () => {
    for (let i = 0; i < 200; i++) {
      await insertLiveShare(ACCT_B, `b${i.toString().padStart(20, "0")}`, 1000 + i);
    }
    const created = await createShare({ accountId: ACCT_A });
    expect(created.id).toMatch(SHARE_ID_RE);
    expect(await shares.countLiveShares(ACCT_A)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// deleteSharesForAccount (CQ-OQ-1 / AUTH-BR-5)
// ---------------------------------------------------------------------------

describe("deleteSharesForAccount", () => {
  it("hard-deletes every share for that account and leaves others", async () => {
    const a = await createShare({ accountId: ACCT_A });
    const b = await createShare({ accountId: ACCT_B });

    await shares.deleteSharesForAccount(ACCT_A);

    expect(await shares.getLiveShare(a.id)).toBeNull();
    expect(await shares.listLiveShares(ACCT_A)).toEqual([]);
    expect(await shares.countLiveShares(ACCT_A)).toBe(0);
    expect(await shares.getLiveShare(b.id)).not.toBeNull();
  });

  it("is a no-op when the account has no shares", async () => {
    await expect(shares.deleteSharesForAccount(ACCT_A)).resolves.toBeUndefined();
  });
});
