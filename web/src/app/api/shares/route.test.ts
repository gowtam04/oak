/**
 * Integration tests for the `/api/shares/*` family (chat-qol Phase 4).
 *
 * Covers the HTTP adapters over the landed `share-repo` (P1):
 *   POST   /api/shares                  create snapshot
 *   GET    /api/shares                  Shared-by-me (live only)
 *   DELETE /api/shares/:id              owner revoke
 *   GET    /api/shares/public/:id       unauthenticated JSON
 *   POST   /api/shares/:id/import-team  createTeam on the VIEWER account
 *
 * Expected route modules (implementation-plan ownership map):
 *   ./route.ts                    GET list + POST create
 *   ./[id]/route.ts               DELETE revoke
 *   ./public/[id]/route.ts        GET public JSON
 *   ./[id]/import-team/route.ts   POST import
 *
 * HTML `robots: noindex` / OG tags for `GET /a/[id]` are a **page** concern
 * (ADR-6, SHARE-BR-4, CQ-OQ-5). This file pins the public JSON + revoked 404
 * that natives consume; do not parse HTML here.
 *
 * Real migrated Postgres (Testcontainers) so repos run against the
 * `@/data/db` singleton; only `getCurrentAccount` is mocked.
 *
 * Requirement refs: SHARE-US-1..5, SHARE-BR-1..9, AUTH-BR-2/3/6, CQ-OQ-5.
 * ADR-6, ADR-11, ADR-12, ADR-13.
 */

import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { OakAnswer } from "@/agent/schemas";
import type { TeamMember } from "@/data/teams/team-schema";
import { SITE_ORIGIN } from "@/lib/site";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../test/support/pg";
import {
  PUBLIC_READ_CONFIG,
  _resetStoreForTests as resetRateLimit,
} from "@/server/rate-limit";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";
const SV = "scarlet-violet";
const ORIGIN = "http://oak.test";
const SHARE_ID_RE = /^[A-Za-z0-9_-]{21}$/;

type ListRoute = typeof import("./route");
type IdRoute = typeof import("./[id]/route");
type PublicRoute = typeof import("./public/[id]/route");
type ImportRoute = typeof import("./[id]/import-team/route");
type ConversationRepo = typeof import("@/data/repos/conversation-repo");
type ShareRepo = typeof import("@/data/repos/share-repo");
type TeamRepo = typeof import("@/data/repos/team-repo");

let fix: PgFixture;
let list: ListRoute;
let byId: IdRoute;
let pub: PublicRoute;
let imp: ImportRoute;
let convRepo: ConversationRepo;
let shareRepo: ShareRepo;
let teamRepo: TeamRepo;

const MEMBER: TeamMember = {
  species: "garchomp",
  ability: "rough-skin",
  item: "life-orb",
  moves: ["earthquake", "dragon-claw"],
  nature: "jolly",
  evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  tera_type: "fire",
  level: 50,
};

function makeAnswer(markdown: string, extra: Partial<OakAnswer> = {}): OakAnswer {
  return {
    status: "answered",
    answer_markdown: markdown,
    reasoning_markdown: "because reasons",
    citations: [],
    inferences: [],
    generation_basis: { generation: "gen-9", fallback: false },
    ...extra,
  };
}

const ANSWER = makeAnswer("Here is rain.");

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  list = await import("./route");
  byId = await import("./[id]/route");
  pub = await import("./public/[id]/route");
  imp = await import("./[id]/import-team/route");
  convRepo = await import("@/data/repos/conversation-repo");
  shareRepo = await import("@/data/repos/share-repo");
  teamRepo = await import("@/data/repos/team-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE shared_answer, conversation, conversation_message, team RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
  resetRateLimit();
});

afterEach(() => {
  resetRateLimit();
});

// --- Helpers ---------------------------------------------------------------

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

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

function wireError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  if (typeof rec.error === "string") return rec.error;
  if (typeof rec.code === "string") return rec.code;
  return undefined;
}

function expectShareUrl(url: unknown, id: string): void {
  expect(url).toBe(`${SITE_ORIGIN}/a/${id}`);
}

function postCreate(body: unknown): Promise<Response> {
  return list.POST(
    new Request(`${ORIGIN}/api/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function getList(): Promise<Response> {
  return list.GET(new Request(`${ORIGIN}/api/shares`));
}

function deleteShare(id: string): Promise<Response> {
  return byId.DELETE(
    new Request(`${ORIGIN}/api/shares/${id}`, { method: "DELETE" }),
    idCtx(id),
  );
}

function getPublic(id: string): Promise<Response> {
  return pub.GET(new Request(`${ORIGIN}/api/shares/public/${id}`), idCtx(id));
}

function postImport(id: string): Promise<Response> {
  return imp.POST(
    new Request(`${ORIGIN}/api/shares/${id}/import-team`, { method: "POST" }),
    idCtx(id),
  );
}

async function seedTurn(over: {
  accountId?: string;
  conversationId: string;
  userMessage: string;
  answer?: OakAnswer;
  now?: number;
}): Promise<{ userId: string; assistantId: string }> {
  const userId = convRepo.newTurnId();
  const assistantId = convRepo.newTurnId();
  await convRepo.appendTurnPair({
    accountId: over.accountId ?? ACCT_A,
    conversationId: over.conversationId,
    format: SV,
    userTurnId: userId,
    userMessage: over.userMessage,
    assistantTurnId: assistantId,
    answer: over.answer ?? ANSWER,
    now: over.now ?? Date.now(),
  });
  return { userId, assistantId };
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
          (${id}, ${accountId}, NULL, 'T', 'Q', ${JSON.stringify(ANSWER)}, ${createdAt}, ${revokedAt})`,
  );
}

// ===========================================================================
// POST /api/shares — create (SHARE-US-1, SHARE-BR-1/2/5/9, AUTH-BR-6)
// ===========================================================================

describe("POST /api/shares — create", () => {
  it("guest → 401 (SHARE-US-1 / SHARE-BR-1 / AUTH-BR-6)", async () => {
    const { assistantId } = await seedTurn({
      conversationId: "c",
      userMessage: "Build me rain",
    });
    guest();
    const res = await postCreate({
      conversation_id: "c",
      assistant_message_id: assistantId,
    });
    expect(res.status).toBe(401);
  });

  it("snapshots the preceding user + assistant OakAnswer and returns 201 { id, url }", async () => {
    signedIn(ACCT_A);
    const question = "Build me rain";
    const answer = makeAnswer("Here is rain.");
    const { assistantId } = await seedTurn({
      conversationId: "c",
      userMessage: question,
      answer,
    });

    const res = await postCreate({
      conversation_id: "c",
      assistant_message_id: assistantId,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; url: string };
    expect(body.id).toMatch(SHARE_ID_RE);
    expectShareUrl(body.url, body.id);

    // Snapshot fidelity (SHARE-BR-2 / SHARE-BR-5 / SHARE-BR-6) — public JSON
    // is the frozen Q+A, not a live conversation read.
    guest();
    const pubRes = await getPublic(body.id);
    expect(pubRes.status).toBe(200);
    const snap = (await pubRes.json()) as {
      id: string;
      question: string;
      answer: OakAnswer;
      conversationTitle: string;
      createdAt: number;
    };
    expect(snap).toMatchObject({
      id: body.id,
      question,
      answer,
    });
    expect(typeof snap.conversationTitle).toBe("string");
    expect(snap.conversationTitle.length).toBeGreaterThan(0);
    expect(typeof snap.createdAt).toBe("number");
    // SHARE-BR-9: consume-on-turn images are never stored on the message
    // row, so the snapshot is text + OakAnswer by construction.
    expect(snap).not.toHaveProperty("images");
  });

  it("shares any assistant card, not only the last (SHARE-US-1)", async () => {
    signedIn(ACCT_A);
    const first = makeAnswer("first answer");
    const { assistantId: firstAsst } = await seedTurn({
      conversationId: "c",
      userMessage: "first question",
      answer: first,
      now: 1_000,
    });
    await seedTurn({
      conversationId: "c",
      userMessage: "second question",
      answer: makeAnswer("second answer"),
      now: 2_000,
    });

    const res = await postCreate({
      conversation_id: "c",
      assistant_message_id: firstAsst,
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    guest();
    const snap = (await (await getPublic(id)).json()) as {
      question: string;
      answer: OakAnswer;
    };
    expect(snap.question).toBe("first question");
    expect(snap.answer).toEqual(first);
  });

  it("keeps an already-created snapshot when the live pair is replaced (SHARE-BR-2)", async () => {
    signedIn(ACCT_A);
    const original = makeAnswer("original answer");
    const { assistantId } = await seedTurn({
      conversationId: "c",
      userMessage: "original question",
      answer: original,
    });
    const created = await postCreate({
      conversation_id: "c",
      assistant_message_id: assistantId,
    });
    const { id } = (await created.json()) as { id: string };

    await convRepo.replaceLastPair(
      ACCT_A,
      "c",
      "edited question",
      makeAnswer("edited answer"),
    );

    guest();
    const snap = (await (await getPublic(id)).json()) as {
      question: string;
      answer: OakAnswer;
    };
    expect(snap.question).toBe("original question");
    expect(snap.answer).toEqual(original);
  });

  it("404s a missing conversation, a foreign conversation, and a bad message id (AUTH-BR-6)", async () => {
    signedIn(ACCT_A);
    const { assistantId } = await seedTurn({
      conversationId: "mine",
      userMessage: "q",
    });
    await seedTurn({
      accountId: ACCT_B,
      conversationId: "theirs",
      userMessage: "other",
    });

    expect(
      (await postCreate({ conversation_id: "nope", assistant_message_id: assistantId }))
        .status,
    ).toBe(404);
    expect(
      (await postCreate({ conversation_id: "theirs", assistant_message_id: assistantId }))
        .status,
    ).toBe(404);
    expect(
      (await postCreate({ conversation_id: "mine", assistant_message_id: "missing-msg" }))
        .status,
    ).toBe(404);
  });

  it("404s when the id is a user row, not the assistant (SHARE-BR-5)", async () => {
    signedIn(ACCT_A);
    const { userId } = await seedTurn({
      conversationId: "c",
      userMessage: "q",
    });
    expect(
      (await postCreate({ conversation_id: "c", assistant_message_id: userId })).status,
    ).toBe(404);
  });

  it("409s share_limit at 200 live shares", async () => {
    signedIn(ACCT_A);
    for (let i = 0; i < 200; i++) {
      await insertLiveShare(ACCT_A, `s${i.toString().padStart(20, "0")}`, 1000 + i);
    }
    const { assistantId } = await seedTurn({
      conversationId: "c",
      userMessage: "one more",
    });
    const res = await postCreate({
      conversation_id: "c",
      assistant_message_id: assistantId,
    });
    expect(res.status).toBe(409);
    expect(wireError(await res.json())).toBe("share_limit");
  });
});

// ===========================================================================
// GET /api/shares — Shared-by-me (SHARE-US-4, ADR-11)
// ===========================================================================

describe("GET /api/shares — Shared-by-me", () => {
  it("guest → 401", async () => {
    guest();
    expect((await getList()).status).toBe(401);
  });

  it("returns an empty live list, not an error (SHARE-AC-4.2)", async () => {
    signedIn(ACCT_A);
    const res = await getList();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shares: [] });
  });

  it("lists only this account's live shares with { id, url, conversationTitle, createdAt }", async () => {
    signedIn(ACCT_A);
    const live = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Rain team",
      questionText: "Build me rain",
      answer: ANSWER,
    });
    const revoked = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Revoked",
      questionText: "gone",
      answer: ANSWER,
    });
    await shareRepo.revokeShare(ACCT_A, revoked.id);
    await shareRepo.createShare({
      accountId: ACCT_B,
      conversationId: "other",
      conversationTitle: "B's share",
      questionText: "not yours",
      answer: ANSWER,
    });

    const res = await getList();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shares: {
        id: string;
        url: string;
        conversationTitle: string;
        createdAt: number;
      }[];
    };
    expect(body.shares).toHaveLength(1);
    const row = body.shares[0];
    expect(row).toMatchObject({
      id: live.id,
      conversationTitle: "Rain team",
    });
    expectShareUrl(row.url, live.id);
    expect(typeof row.createdAt).toBe("number");
    expect(body.shares.map((s) => s.id)).not.toContain(revoked.id);
  });

  it("drops a share from the list after revoke (SHARE-AC-4.3)", async () => {
    signedIn(ACCT_A);
    const { id } = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Rain team",
      questionText: "q",
      answer: ANSWER,
    });
    expect((await deleteShare(id)).status).toBe(204);

    const body = (await (await getList()).json()) as { shares: { id: string }[] };
    expect(body.shares).toEqual([]);
  });
});

// ===========================================================================
// DELETE /api/shares/:id — revoke (SHARE-US-3, SHARE-BR-3)
// ===========================================================================

describe("DELETE /api/shares/:id — revoke", () => {
  it("owner → 204 and the public URL 404s (SHARE-AC-3.1)", async () => {
    signedIn(ACCT_A);
    const { id } = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Rain team",
      questionText: "q",
      answer: ANSWER,
    });

    const res = await deleteShare(id);
    expect(res.status).toBe(204);

    guest();
    expect((await getPublic(id)).status).toBe(404);
    expect(await shareRepo.getLiveShare(id)).toBeNull();
  });

  it("non-owner → 404 and the share stays live (AUTH-BR-6)", async () => {
    const { id } = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Rain team",
      questionText: "q",
      answer: ANSWER,
    });

    signedIn(ACCT_B);
    expect((await deleteShare(id)).status).toBe(404);
    expect(await shareRepo.getLiveShare(id)).not.toBeNull();
  });

  it("guest → 401; unknown id → 404", async () => {
    const { id } = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Rain team",
      questionText: "q",
      answer: ANSWER,
    });

    guest();
    expect((await deleteShare(id)).status).toBe(401);
    expect(await shareRepo.getLiveShare(id)).not.toBeNull();

    signedIn(ACCT_A);
    expect((await deleteShare("no-such-share-id-00001")).status).toBe(404);
  });
});

// ===========================================================================
// GET /api/shares/public/:id — unauthenticated JSON (SHARE-US-2, AUTH-BR-2)
// HTML noindex / OG / unavailable chrome is a page concern (GET /a/[id]).
// ===========================================================================

describe("GET /api/shares/public/:id", () => {
  it("returns live JSON with no auth (SHARE-BR-1 / AUTH-BR-2)", async () => {
    const created = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Rain team",
      questionText: "Build me rain",
      answer: ANSWER,
    });

    guest();
    const res = await getPublic(created.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: created.id,
      question: "Build me rain",
      answer: ANSWER,
      conversationTitle: "Rain team",
      createdAt: expect.any(Number),
    });
  });

  it("404s revoked and unknown ids (SHARE-AC-2.3)", async () => {
    const { id } = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Rain team",
      questionText: "q",
      answer: ANSWER,
    });
    await shareRepo.revokeShare(ACCT_A, id);

    guest();
    expect((await getPublic(id)).status).toBe(404);
    expect((await getPublic("no-such-share-id-00001")).status).toBe(404);
  });

  it("sends Cache-Control: private, no-store on 200 and 404", async () => {
    const { id } = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Rain team",
      questionText: "q",
      answer: ANSWER,
    });
    guest();
    const live = await getPublic(id);
    expect(live.status).toBe(200);
    expect(live.headers.get("Cache-Control")).toBe("private, no-store");
    const missing = await getPublic("no-such-share-id-00001");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("404s a live row whose answer_json is not JSON", async () => {
    await fix.db.execute(
      sql`INSERT INTO shared_answer
            (id, account_id, conversation_id, conversation_title, question_text, answer_json, created_at, revoked_at)
          VALUES
            ('badjson0000000000001', ${ACCT_A}, NULL, 'T', 'Q', 'not-json', 1000, NULL)`,
    );
    guest();
    expect((await getPublic("badjson0000000000001")).status).toBe(404);
  });

  it("rate-limits a burst past PUBLIC_READ_CONFIG with 429 + Retry-After", async () => {
    const { id } = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Rain team",
      questionText: "q",
      answer: ANSWER,
    });
    guest();
    const cap = PUBLIC_READ_CONFIG.maxRequestsPerWindow;
    for (let i = 0; i < cap; i++) {
      expect((await getPublic(id)).status).toBe(200);
    }
    const limited = await getPublic(id);
    expect(limited.status).toBe(429);
    expect(wireError(await limited.json())).toBe("rate_limited");
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// POST /api/shares/:id/import-team (SHARE-US-5, SHARE-BR-7, AUTH-BR-3, ADR-12)
// ===========================================================================

describe("POST /api/shares/:id/import-team", () => {
  const proposed = {
    name: "Viewer Rain",
    format: SV,
    members: [MEMBER],
  } as const;

  async function shareWithProposal(): Promise<string> {
    const { id } = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "Rain team",
      questionText: "Build me rain",
      answer: makeAnswer("Here is rain.", {
        proposed_team: { ...proposed, members: [...proposed.members] },
      }),
    });
    return id;
  }

  it("guest → 401 (SHARE-AC-5.2)", async () => {
    const id = await shareWithProposal();
    guest();
    expect((await postImport(id)).status).toBe(401);
    expect(await teamRepo.listTeams(ACCT_A)).toEqual([]);
    expect(await teamRepo.listTeams(ACCT_B)).toEqual([]);
  });

  it("creates a new team on the VIEWER account, not the owner's (SHARE-BR-7 / AUTH-BR-3)", async () => {
    const id = await shareWithProposal();
    signedIn(ACCT_B);
    const res = await postImport(id);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { team_id: string };
    expect(typeof body.team_id).toBe("string");
    expect(body.team_id.length).toBeGreaterThan(0);

    const viewerTeam = await teamRepo.getTeam(ACCT_B, body.team_id);
    expect(viewerTeam).not.toBeNull();
    expect(viewerTeam).toMatchObject({
      accountId: ACCT_B,
      name: proposed.name,
      format: proposed.format,
      members: proposed.members,
    });
    expect(await teamRepo.getTeam(ACCT_A, body.team_id)).toBeNull();
    expect(await teamRepo.listTeams(ACCT_A)).toEqual([]);
  });

  it("400s no_proposed_team when the snapshot has no proposal", async () => {
    const { id } = await shareRepo.createShare({
      accountId: ACCT_A,
      conversationId: "c",
      conversationTitle: "No team",
      questionText: "What is STAB?",
      answer: ANSWER,
    });
    signedIn(ACCT_B);
    const res = await postImport(id);
    expect(res.status).toBe(400);
    expect(wireError(await res.json())).toBe("no_proposed_team");
    expect(await teamRepo.listTeams(ACCT_B)).toEqual([]);
  });

  it("404s revoked or unknown shares", async () => {
    const id = await shareWithProposal();
    await shareRepo.revokeShare(ACCT_A, id);
    signedIn(ACCT_B);
    expect((await postImport(id)).status).toBe(404);
    expect((await postImport("no-such-share-id-00001")).status).toBe(404);
  });
});

// ===========================================================================
// Conversation delete leaves the share live (SHARE-BR-3)
// ===========================================================================

describe("conversation delete vs live share (SHARE-BR-3)", () => {
  it("public GET and Shared-by-me still resolve after deleteConversation", async () => {
    signedIn(ACCT_A);
    const { assistantId } = await seedTurn({
      conversationId: "c",
      userMessage: "Build me rain",
      answer: ANSWER,
    });
    const created = await postCreate({
      conversation_id: "c",
      assistant_message_id: assistantId,
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    await convRepo.deleteConversation(ACCT_A, "c");
    expect(await convRepo.getConversation(ACCT_A, "c")).toBeNull();

    guest();
    const pubRes = await getPublic(id);
    expect(pubRes.status).toBe(200);
    expect(await pubRes.json()).toMatchObject({
      id,
      question: "Build me rain",
      answer: ANSWER,
    });

    signedIn(ACCT_A);
    const listed = (await (await getList()).json()) as { shares: { id: string }[] };
    expect(listed.shares.map((s) => s.id)).toEqual([id]);
  });
});
