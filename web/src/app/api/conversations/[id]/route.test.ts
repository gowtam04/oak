/**
 * Tests for `GET/PATCH /api/conversations/[id]` after the active-team seam was
 * removed (saved teams are referenced by NAME in chat, not bound to a
 * conversation). Asserts the surviving contract:
 *
 *   - GET no longer returns an `active_team_id` field,
 *   - PATCH accepts `title` / `pinned`; an empty body OR a legacy
 *     `active_team_id`-only body is a 400 (the field is no longer recognized),
 *   - isolation is preserved (guest → 401, other account → 404).
 *
 * Chat-qol organize (ORG-US-1/2, PIN-US-1) is additive on the same route:
 *   - GET also returns `archived`, `folderId`, `pinnedMessageIds`,
 *   - PATCH also accepts `archived` / `folder_id` (null unfiles; foreign
 *     folder → 404).
 *
 * Answer-cards pins (PIN-US-1 API) are additive on GET only:
 *   - `pinnedArtifacts: { id, kind, title, created_at }[]`
 *   - Do not assert `hydrate` here (parent glue later).
 *
 * Real migrated Postgres (Testcontainers) so the route's repo runs for real
 * against the `@/data/db` singleton; only `getCurrentAccount` is mocked.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OakAnswer } from "@/agent/schemas";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import { createPgSchema, installAsSingleton, type PgFixture } from "../../../../../test/support/pg";
import {
  _resetStoreForTests as resetTurnStore,
  startTurn,
  type TurnRecord,
} from "@/server/turn-store";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";
const SV = "scarlet-violet";

let fix: PgFixture;
let route: typeof import("./route");
let convRepo: typeof import("@/data/repos/conversation-repo");
let folderRepo: typeof import("@/data/repos/folder-repo");
let pinRepo: typeof import("@/data/repos/artifact-pin-repo");

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "ok",
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  await installAsSingleton(fix);
  route = await import("./route");
  convRepo = await import("@/data/repos/conversation-repo");
  folderRepo = await import("@/data/repos/folder-repo");
  pinRepo = await import("@/data/repos/artifact-pin-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE conversation_artifact_pin, team, conversation, conversation_message, conversation_folder RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
  await resetTurnStore();
});

// --- Helpers ---------------------------------------------------------------

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({ id, email: `${id}@x.test`, createdAt: 0, lastUsedScope: null });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

function patch(id: string, body: unknown): Promise<Response> {
  return route.PATCH(
    new Request("http://t", { method: "PATCH", body: JSON.stringify(body) }),
    idCtx(id),
  );
}

async function seedConv(accountId: string, id: string, format: string): Promise<void> {
  await convRepo.appendTurnPair({
    accountId,
    conversationId: id,
    format,
    userTurnId: convRepo.newTurnId(),
    userMessage: "q",
    assistantTurnId: convRepo.newTurnId(),
    answer: ANSWER,
    now: Date.now(),
  });
}

// --- GET --------------------------------------------------------------------

describe("GET /api/conversations/[id] — no active_team_id field", () => {
  it("returns the conversation without an active_team_id field", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c", SV);

    const body = await (await route.GET(new Request("http://t"), idCtx("c"))).json();
    expect(body).toMatchObject({ id: "c", format: SV });
    expect(body).not.toHaveProperty("active_team_id");
  });
});

// --- active_turn (background-turns/design.md §5.4) --------------------------

describe("GET /api/conversations/[id] — active_turn", () => {
  it("is null when no turn is running for the conversation", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c", SV);
    const body = await (await route.GET(new Request("http://t"), idCtx("c"))).json();
    expect(body.active_turn).toBeNull();
  });

  it("reports the running turn id for the account's conversation", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c", SV);
    const started = startTurn({
      sessionId: "c",
      accountId: ACCT_A,
      ownerKey: `acct:${ACCT_A}`,
    });
    const turn = started as TurnRecord;

    const body = await (await route.GET(new Request("http://t"), idCtx("c"))).json();
    expect(body.active_turn).toEqual({ turn_id: turn.turnId });
  });

  it("does not report a turn running for a DIFFERENT conversation", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c", SV);
    // A turn is running, but for a different conversation id.
    startTurn({ sessionId: "other", accountId: ACCT_A, ownerKey: `acct:${ACCT_A}` });

    const body = await (await route.GET(new Request("http://t"), idCtx("c"))).json();
    expect(body.active_turn).toBeNull();
  });
});

// --- PATCH ------------------------------------------------------------------

describe("PATCH /api/conversations/[id] — title/pinned only", () => {
  it("renames and pins", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c", SV);

    expect((await patch("c", { title: "New name" })).status).toBe(200);
    expect((await patch("c", { pinned: true })).status).toBe(200);

    const conv = await convRepo.getConversation(ACCT_A, "c");
    expect(conv?.title).toBe("New name");
    expect(conv?.pinned).toBe(true);
  });

  it("400s an empty body and a legacy active_team_id-only body", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c", SV);
    // No recognized field → 400.
    expect((await patch("c", {})).status).toBe(400);
    // active_team_id is no longer a recognized PATCH field.
    expect((await patch("c", { active_team_id: "anything" })).status).toBe(400);
  });

  it("guest → 401, other account → 404 (isolation preserved)", async () => {
    await seedConv(ACCT_A, "c", SV);

    guest();
    expect((await patch("c", { pinned: true })).status).toBe(401);

    signedIn(ACCT_B);
    expect((await patch("c", { pinned: true })).status).toBe(404);
  });
});

// --- GET organize fields (archived / folderId / pinnedMessageIds) ----------

describe("GET /api/conversations/[id] — archived, folderId, pinnedMessageIds", () => {
  it("defaults to unfiled, not archived, and an empty pin list", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c", SV);

    const body = await (await route.GET(new Request("http://t"), idCtx("c"))).json();
    expect(body).toMatchObject({
      id: "c",
      archived: false,
      folderId: null,
      pinnedMessageIds: [],
    });
  });

  it("returns archived, folderId, and pinned assistant ids in thread order", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "VGC");
    const firstUser = convRepo.newTurnId();
    const firstAsst = convRepo.newTurnId();
    const secondUser = convRepo.newTurnId();
    const secondAsst = convRepo.newTurnId();
    await convRepo.appendTurnPair({
      accountId: ACCT_A,
      conversationId: "c",
      format: SV,
      userTurnId: firstUser,
      userMessage: "q1",
      assistantTurnId: firstAsst,
      answer: ANSWER,
      now: 1000,
    });
    await convRepo.appendTurnPair({
      accountId: ACCT_A,
      conversationId: "c",
      format: SV,
      userTurnId: secondUser,
      userMessage: "q2",
      assistantTurnId: secondAsst,
      answer: ANSWER,
      now: 2000,
    });
    await convRepo.setFolder(ACCT_A, "c", folder.id);
    await convRepo.setArchived(ACCT_A, "c", true);
    // Pin later first so GET order is seq, not pin time.
    await convRepo.setMessagePinned(ACCT_A, "c", secondAsst, true);
    await convRepo.setMessagePinned(ACCT_A, "c", firstAsst, true);

    const body = await (await route.GET(new Request("http://t"), idCtx("c"))).json();
    expect(body).toMatchObject({
      id: "c",
      archived: true,
      folderId: folder.id,
      pinnedMessageIds: [firstAsst, secondAsst],
    });
  });
});

// --- PATCH archived / folder_id --------------------------------------------

describe("PATCH /api/conversations/[id] — archived / folder_id", () => {
  it("archives and unarchives without touching folder membership (ORG-BR-2)", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "VGC");
    await seedConv(ACCT_A, "c", SV);
    await convRepo.setFolder(ACCT_A, "c", folder.id);

    expect((await patch("c", { archived: true })).status).toBe(200);
    expect(await convRepo.getConversation(ACCT_A, "c")).toMatchObject({
      archived: true,
      folderId: folder.id,
    });

    expect((await patch("c", { archived: false })).status).toBe(200);
    expect(await convRepo.getConversation(ACCT_A, "c")).toMatchObject({
      archived: false,
      folderId: folder.id,
    });
  });

  it("files into a folder and unfiles when folder_id is null (ORG-BR-1)", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "Ladder");
    await seedConv(ACCT_A, "c", SV);

    expect((await patch("c", { folder_id: folder.id })).status).toBe(200);
    expect((await convRepo.getConversation(ACCT_A, "c"))?.folderId).toBe(folder.id);

    expect((await patch("c", { folder_id: null })).status).toBe(200);
    expect((await convRepo.getConversation(ACCT_A, "c"))?.folderId).toBeNull();
  });

  it("404s a folder that is not this account's", async () => {
    signedIn(ACCT_A);
    const foreign = await folderRepo.createFolder(ACCT_B, "Not yours");
    await seedConv(ACCT_A, "c", SV);

    expect((await patch("c", { folder_id: foreign.id })).status).toBe(404);
    expect((await convRepo.getConversation(ACCT_A, "c"))?.folderId).toBeNull();
  });

  it("guest → 401, other account → 404", async () => {
    await seedConv(ACCT_A, "c", SV);

    guest();
    expect((await patch("c", { archived: true })).status).toBe(401);

    signedIn(ACCT_B);
    expect((await patch("c", { archived: true })).status).toBe(404);
    expect((await convRepo.getConversation(ACCT_A, "c"))?.archived).toBe(false);
  });
});

// --- GET pinnedArtifacts (PIN-US-1 API) — additive, not hydrate -------------

describe("GET /api/conversations/[id] — pinnedArtifacts (PIN-US-1)", () => {
  it("defaults to an empty pin strip", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c", SV);

    const body = await (await route.GET(new Request("http://t"), idCtx("c"))).json();
    expect(body.pinnedArtifacts).toEqual([]);
  });

  it("lists artifact-pin summaries without snapshots (PIN-AC-1.1, PIN-BR-1)", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c", SV);
    const first = await pinRepo.insert({
      accountId: ACCT_A,
      conversationId: "c",
      kind: "calc",
      title: "EQ vs Toxapex",
      snapshot: {
        v: 1,
        kind: "calc",
        scenario: { format: SV, attacker: "garchomp" },
        result: { min_damage: 40, max_damage: 48 },
      },
    });
    const second = await pinRepo.insert({
      accountId: ACCT_A,
      conversationId: "c",
      kind: "comparison",
      title: "Chomp vs Apex",
      snapshot: {
        v: 1,
        kind: "comparison",
        left: { name: "Garchomp", format: SV },
        right: { name: "Toxapex", format: SV },
      },
    });

    const body = await (await route.GET(new Request("http://t"), idCtx("c"))).json();
    expect(body.pinnedArtifacts).toEqual([
      {
        id: first.id,
        kind: "calc",
        title: "EQ vs Toxapex",
        created_at: expect.any(Number),
      },
      {
        id: second.id,
        kind: "comparison",
        title: "Chomp vs Apex",
        created_at: expect.any(Number),
      },
    ]);
    for (const pin of body.pinnedArtifacts as unknown[]) {
      expect(pin).not.toHaveProperty("snapshot");
    }
  });

  it("does not leak another conversation's pins onto this GET", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c", SV);
    await seedConv(ACCT_A, "other", SV);
    await pinRepo.insert({
      accountId: ACCT_A,
      conversationId: "other",
      kind: "team_sheet",
      title: "Other thread",
      snapshot: { v: 1, kind: "team_sheet", format: SV, team: { members: [] } },
    });

    const body = await (await route.GET(new Request("http://t"), idCtx("c"))).json();
    expect(body.pinnedArtifacts).toEqual([]);
  });
});


