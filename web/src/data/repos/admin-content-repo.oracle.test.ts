/**
 * Oracle tests for src/data/repos/admin-content-repo.ts — the SOLE Postgres
 * reader for the admin panel's CROSS-ACCOUNT (un-scoped) row reads.
 *
 * Harness (mirrors admin-analytics-repo.oracle.test.ts / accounts-repo.test.ts):
 * the repo reads the `@/data/db` SINGLETON directly, so we migrate an isolated
 * Postgres schema (seed "none"), `installAsSingleton(fix)` BEFORE the first
 * dynamic import of the repo, neutralize `server-only` (it throws under the
 * vitest node env), then seed the SHARED admin fixture
 * (`test/fixtures/admin-fixture.ts`) — the same ground-truth dataset the
 * analytics oracle asserts against. All tests here are READ-ONLY over that single
 * seed, so there is no per-test truncate.
 *
 * Expected numbers are KNOWN BY CONSTRUCTION from the fixture header. The fixture
 * keeps every ACCOUNT turn IN-RANGE (out-of-range / live / keyset-tie rows are
 * GUEST turns), so each account's lifetime activity equals its in-range activity
 * and the rollup expectations below are exact. Active sessions use a year-2286
 * expiry, so `getAccountDetail`'s active/expired split is deterministic without
 * pinning the clock. Cost assertions recompute through `estimateCostUsd` so they
 * never hardcode the placeholder price table (AD-6 / ADMIN-BR-5).
 *
 * Coverage (design.md § Interface Definitions › admin-content-repo;
 * ADMIN-US-5/8/9/10/11, ADMIN-BR-4/8/9, AD-7):
 *   - cross-account listing spans ALL accounts AND guest (null-account) turns.
 *   - filters: from/to (to exclusive), model, mode, status, kind, accountId,
 *     sessionId; substring search (ilike, case-insensitive) over prompt + answer.
 *   - keyset pagination on (created_at, id) returns stable, non-overlapping pages
 *     (incl. the id tiebreak when two rows share a created_at — the tie rows).
 *   - getTurn drill-down returns parsed tool_trace + answer_text + answer_json +
 *     estUsd; null on a miss; the rate_limited shape.
 *   - accounts: derived activity (turns, tokens, estUsd, conv/team counts, last
 *     active, rateLimited/failed), email search, the heavy-user sorts, account
 *     detail with active (non-expired) sessions, pagination.
 *   - conversations: cross-account list, title/message search, messageCount,
 *     full thread reader (ordered turns), null on miss.
 *   - teams: cross-account list, name search, member summary (incl. a complete
 *     6-pack), full detail, null.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// admin-content-repo.ts / db.ts `import "server-only"` (throws under node).
// Neutralize it; the real Postgres handle is supplied via installAsSingleton.
vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

// pricing.ts is pure (no server-only / DB) — safe to import statically and use
// as the oracle for cost expectations.
import { estimateCostUsd } from "@/server/admin/pricing";

import {
  ACCOUNTS,
  ADMIN_RANGE,
  BASE,
  CONVERSATIONS,
  DAY,
  HOUR,
  SESSIONS,
  TEAMS,
  TEAM_B1_SPECIES,
  TIE_AT,
  seedAdminFixture,
} from "../../../test/fixtures/admin-fixture";

type Repo = typeof import("./admin-content-repo");

let fix: PgFixture;
let repo: Repo;

/** The canonical analytics window; pinned on most listTurns reads so out-of-range
 * / live / tie GUEST rows don't perturb the deterministic in-range expectations. */
const RANGE = { from: ADMIN_RANGE.from, to: ADMIN_RANGE.to };

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  await seedAdminFixture(fix.db);
  repo = await import("./admin-content-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

// ---------------------------------------------------------------------------
// listTurns — cross-account listing, filters, search, keyset pagination
// ---------------------------------------------------------------------------

describe("listTurns", () => {
  it("lists turns from ALL accounts AND guests over the range, newest first", async () => {
    const { rows, nextCursor } = await repo.listTurns({ ...RANGE, limit: 50 });
    expect(rows.map((r) => r.id)).toEqual([
      "tr-12",
      "tr-11",
      "tr-10",
      "tr-09",
      "tr-08",
      "tr-07",
      "tr-06",
      "tr-05",
      "tr-04",
      "tr-03",
      "tr-02",
      "tr-01",
    ]);
    expect(nextCursor).toBeNull();

    // Guest turns surface with a null account + null email; signed turns carry
    // the joined email (ADMIN-BR-4 cross-account read).
    const guest = rows.find((r) => r.id === "tr-03")!;
    expect(guest.accountId).toBeNull();
    expect(guest.accountEmail).toBeNull();
    const signed = rows.find((r) => r.id === "tr-01")!;
    expect(signed.accountId).toBe(ACCOUNTS.A.id);
    expect(signed.accountEmail).toBe(ACCOUNTS.A.email);
  });

  it("attaches an estimated USD cost per row (priced > 0, unpriced/null = 0)", async () => {
    const { rows } = await repo.listTurns({ ...RANGE, limit: 50 });
    const t01 = rows.find((r) => r.id === "tr-01")!;
    expect(t01.estUsd).toBeCloseTo(
      estimateCostUsd({
        model: "grok-4.3",
        inputTokens: 1000,
        outputTokens: 200,
        thinkingTokens: 50,
      }),
      9,
    );
    expect(t01.estUsd).toBeGreaterThan(0);
    // A rate_limited row (null model) is unpriced → $0.
    expect(rows.find((r) => r.id === "tr-12")!.estUsd).toBe(0);
    // An unknown model ("mystery") is unpriced → $0 (AD-6).
    expect(rows.find((r) => r.id === "tr-09")!.estUsd).toBe(0);
  });

  it("keyset-paginates stably with no overlap across pages", async () => {
    const page = (cursor?: string) =>
      repo.listTurns({ ...RANGE, limit: 5, cursor });

    const p1 = await page();
    expect(p1.rows.map((r) => r.id)).toEqual([
      "tr-12",
      "tr-11",
      "tr-10",
      "tr-09",
      "tr-08",
    ]);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await page(p1.nextCursor!);
    expect(p2.rows.map((r) => r.id)).toEqual([
      "tr-07",
      "tr-06",
      "tr-05",
      "tr-04",
      "tr-03",
    ]);
    expect(p2.nextCursor).not.toBeNull();

    const p3 = await page(p2.nextCursor!);
    expect(p3.rows.map((r) => r.id)).toEqual(["tr-02", "tr-01"]);
    expect(p3.nextCursor).toBeNull(); // last page

    const allIds = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id);
    expect(new Set(allIds).size).toBe(12); // no duplicates
  });

  it("resolves the keyset id-tiebreak when two rows share a created_at", async () => {
    // The two TIE guest rows sit at exactly TIE_AT → id DESC breaks the tie.
    const win = { from: TIE_AT, to: TIE_AT + 1 };
    const both = await repo.listTurns({ ...win, limit: 50 });
    expect(both.rows.map((r) => r.id)).toEqual(["tr-tie-b", "tr-tie-a"]);

    // Paginating one-at-a-time must step across the tie without overlap/loss.
    const p1 = await repo.listTurns({ ...win, limit: 1 });
    expect(p1.rows.map((r) => r.id)).toEqual(["tr-tie-b"]);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await repo.listTurns({ ...win, limit: 1, cursor: p1.nextCursor! });
    expect(p2.rows.map((r) => r.id)).toEqual(["tr-tie-a"]);
    expect(p2.nextCursor).toBeNull();
  });

  it("filters by kind (guest vs signed)", async () => {
    const guests = await repo.listTurns({ ...RANGE, limit: 50, kind: "guest" });
    expect(guests.rows.map((r) => r.id).sort()).toEqual([
      "tr-03",
      "tr-04",
      "tr-08",
      "tr-09",
      "tr-12",
    ]);
    const signed = await repo.listTurns({ ...RANGE, limit: 50, kind: "signed" });
    expect(signed.rows.map((r) => r.id).sort()).toEqual([
      "tr-01",
      "tr-02",
      "tr-05",
      "tr-06",
      "tr-07",
      "tr-10",
      "tr-11",
    ]);
  });

  it("filters by status, accountId, sessionId, model and mode", async () => {
    expect(
      (await repo.listTurns({ ...RANGE, limit: 50, status: "answered" })).rows
        .map((r) => r.id)
        .sort(),
    ).toEqual([
      "tr-01",
      "tr-02",
      "tr-03",
      "tr-05",
      "tr-06",
      "tr-08",
      "tr-09",
      "tr-11",
    ]);
    expect(
      (await repo.listTurns({ ...RANGE, limit: 50, accountId: ACCOUNTS.A.id })).rows
        .map((r) => r.id)
        .sort(),
    ).toEqual(["tr-01", "tr-02", "tr-07", "tr-11"]);
    expect(
      (await repo.listTurns({ ...RANGE, limit: 50, sessionId: "sess-A1" })).rows
        .map((r) => r.id)
        .sort(),
    ).toEqual(["tr-01", "tr-02", "tr-11"]);
    expect(
      (await repo.listTurns({ ...RANGE, limit: 50, model: "grok-4.3" })).rows
        .map((r) => r.id)
        .sort(),
    ).toEqual(["tr-01", "tr-02", "tr-03", "tr-07", "tr-08", "tr-11"]);
    // tr-03 is the only champions-mode turn.
    expect(
      (await repo.listTurns({ ...RANGE, limit: 50, mode: "champions" })).rows.map(
        (r) => r.id,
      ),
    ).toEqual(["tr-03"]);
  });

  it("scopes by date range with an inclusive from and EXCLUSIVE to", async () => {
    const { rows } = await repo.listTurns({
      limit: 50,
      from: BASE + 3 * HOUR,
      to: BASE + 5 * HOUR, // excludes tr-05 at exactly BASE+5h
    });
    expect(rows.map((r) => r.id).sort()).toEqual(["tr-03", "tr-04"]);
  });

  it("substring-searches prompt OR answer text, case-insensitively", async () => {
    // Prompt hit, case-insensitive ("garchomp" vs "Garchomp").
    expect(
      (await repo.listTurns({ ...RANGE, limit: 50, q: "garchomp" })).rows.map(
        (r) => r.id,
      ),
    ).toEqual(["tr-01"]);
    expect(
      (await repo.listTurns({ ...RANGE, limit: 50, q: "spam" })).rows.map(
        (r) => r.id,
      ),
    ).toEqual(["tr-12"]);
    // Answer-text-only hit ("base 102 Speed" is in tr-01's answer, not its prompt).
    expect(
      (await repo.listTurns({ ...RANGE, limit: 50, q: "base 102 Speed" })).rows.map(
        (r) => r.id,
      ),
    ).toEqual(["tr-01"]);
  });

  it("treats a malformed cursor leniently (page one, never throws)", async () => {
    const { rows } = await repo.listTurns({
      ...RANGE,
      limit: 50,
      cursor: "@@not-base64@@",
    });
    expect(rows).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// getTurn — full drill-down
// ---------------------------------------------------------------------------

describe("getTurn", () => {
  it("returns the full record with parsed tool_trace + answer json + cost", async () => {
    const turn = await repo.getTurn("tr-01");
    expect(turn).not.toBeNull();
    expect(turn!.toolTrace).toEqual([
      {
        tool: "resolve_entity",
        args: {},
        latency_ms: 8,
        cache_hit: true,
        error: null,
      },
    ]);
    expect(turn!.answerText).toBe("Garchomp has base 102 Speed.");
    expect(JSON.parse(turn!.answerJson!)).toMatchObject({ status: "answered" });
    expect(turn!.accountEmail).toBe(ACCOUNTS.A.email);
    expect(turn!.estUsd).toBeGreaterThan(0);
  });

  it("returns a rate_limited row with null answer fields and an empty trace", async () => {
    const turn = await repo.getTurn("tr-12");
    expect(turn!.status).toBe("rate_limited");
    expect(turn!.model).toBeNull();
    expect(turn!.answerText).toBeNull();
    expect(turn!.answerJson).toBeNull();
    expect(turn!.toolTrace).toEqual([]);
    expect(turn!.estUsd).toBe(0);
  });

  it("returns null for an unknown id", async () => {
    expect(await repo.getTurn("does-not-exist")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listAccounts / getAccountDetail — derived activity
// ---------------------------------------------------------------------------

describe("listAccounts", () => {
  it("derives full activity per account across the turn/conv/team tables", async () => {
    const { rows } = await repo.listAccounts({ limit: 50 });

    // ash: 4 in-range grok turns (tr-01/02/07/11). clarification_needed (tr-07)
    // is NOT a "failed" status for the content rollup (only resolution_failed /
    // insufficient_data count).
    const a = rows.find((r) => r.id === ACCOUNTS.A.id)!;
    expect(a).toMatchObject({
      email: ACCOUNTS.A.email,
      turns: 4,
      inputTokens: 2200, // 1000 + 500 + 100 + 600
      outputTokens: 440, // 200 + 100 + 20 + 120
      thinkingTokens: 80, // 50 + 30
      totalTokens: 2720,
      conversations: 2,
      teams: 1,
      rateLimited: 0,
      failed: 0,
      lastActiveAt: BASE + 2 * DAY + 2 * HOUR, // tr-11
    });
    expect(a.estUsd).toBeCloseTo(
      estimateCostUsd({
        model: "grok-4.3",
        inputTokens: 2200,
        outputTokens: 440,
        thinkingTokens: 80,
      }),
      9,
    );

    // misty: 2 gpt turns, one of them insufficient_data → failed = 1.
    const b = rows.find((r) => r.id === ACCOUNTS.B.id)!;
    expect(b).toMatchObject({
      turns: 2,
      failed: 1,
      rateLimited: 0,
      conversations: 1,
      teams: 1,
    });

    // brock: 1 claude answered turn, no content.
    const c = rows.find((r) => r.id === ACCOUNTS.C.id)!;
    expect(c).toMatchObject({
      turns: 1,
      failed: 0,
      rateLimited: 0,
      conversations: 0,
      teams: 0,
    });
  });

  it("defaults to most-recently-created first, and searches by email", async () => {
    const recent = await repo.listAccounts({ limit: 50 });
    // createdAt DESC: misty (Jan-6) > ash (Jan-5) > brock (older).
    expect(recent.rows.map((r) => r.id)).toEqual([
      ACCOUNTS.B.id,
      ACCOUNTS.A.id,
      ACCOUNTS.C.id,
    ]);

    const hit = await repo.listAccounts({ limit: 50, q: "cerulean" });
    expect(hit.rows.map((r) => r.id)).toEqual([ACCOUNTS.B.id]);
  });

  it("sorts by the heavy-user metrics (turns, errors, cost)", async () => {
    // turns: ash (4) > misty (2) > brock (1).
    expect(
      (await repo.listAccounts({ limit: 50, sort: "turns" })).rows.map((r) => r.id),
    ).toEqual([ACCOUNTS.A.id, ACCOUNTS.B.id, ACCOUNTS.C.id]);

    // errors: only misty has a failure → first; ash & brock tie at 0, broken by
    // createdAt DESC (ash newer than brock).
    expect(
      (await repo.listAccounts({ limit: 50, sort: "errors" })).rows.map((r) => r.id),
    ).toEqual([ACCOUNTS.B.id, ACCOUNTS.A.id, ACCOUNTS.C.id]);

    // cost: ash (grok-heavy) > brock (claude) > misty (gpt).
    const byCost = await repo.listAccounts({ limit: 50, sort: "cost" });
    expect(byCost.rows.map((r) => r.id)).toEqual([
      ACCOUNTS.A.id,
      ACCOUNTS.C.id,
      ACCOUNTS.B.id,
    ]);
    expect(byCost.rows[0].estUsd).toBeGreaterThan(byCost.rows[1].estUsd);
    expect(byCost.rows[1].estUsd).toBeGreaterThan(byCost.rows[2].estUsd);
  });

  it("paginates over the sorted list with a stable id-position cursor", async () => {
    const p1 = await repo.listAccounts({ limit: 1 }); // recent → [misty]
    expect(p1.rows.map((r) => r.id)).toEqual([ACCOUNTS.B.id]);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await repo.listAccounts({ limit: 1, cursor: p1.nextCursor! });
    expect(p2.rows.map((r) => r.id)).toEqual([ACCOUNTS.A.id]);
    expect(p2.nextCursor).not.toBeNull();

    const p3 = await repo.listAccounts({ limit: 1, cursor: p2.nextCursor! });
    expect(p3.rows.map((r) => r.id)).toEqual([ACCOUNTS.C.id]);
    expect(p3.nextCursor).toBeNull();
  });
});

describe("getAccountDetail", () => {
  it("returns activity plus only the active (non-expired) sessions", async () => {
    const detail = await repo.getAccountDetail(ACCOUNTS.A.id);
    expect(detail).not.toBeNull();
    expect(detail!.account.id).toBe(ACCOUNTS.A.id);
    expect(detail!.account.turns).toBe(4);
    // The expired session is excluded; the two live ones are newest-first.
    expect(detail!.sessions.map((s) => s.id)).toEqual([
      SESSIONS.A2.id,
      SESSIONS.A1.id,
    ]);
  });

  it("returns null for an unknown account", async () => {
    expect(await repo.getAccountDetail("nope")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listAllConversations / getConversationThread
// ---------------------------------------------------------------------------

describe("listAllConversations", () => {
  it("lists conversations across accounts with owner + message count", async () => {
    const { rows } = await repo.listAllConversations({ limit: 50 });
    // updated_at DESC: B1 (Jan-6 2h) > A2 (Jan-6 1h) > A1 (Jan-5 2h).
    expect(rows.map((r) => r.id)).toEqual([
      CONVERSATIONS.B1.id,
      CONVERSATIONS.A2.id,
      CONVERSATIONS.A1.id,
    ]);
    const a1 = rows.find((r) => r.id === CONVERSATIONS.A1.id)!;
    expect(a1.accountEmail).toBe(ACCOUNTS.A.email);
    expect(a1.messageCount).toBe(2);
    const b1 = rows.find((r) => r.id === CONVERSATIONS.B1.id)!;
    expect(b1.accountEmail).toBe(ACCOUNTS.B.email);
    expect(b1.messageCount).toBe(2);
  });

  it("filters by format and searches title OR message text", async () => {
    expect(
      (
        await repo.listAllConversations({ limit: 50, format: "champions" })
      ).rows.map((r) => r.id),
    ).toEqual([CONVERSATIONS.A2.id]);
    // Title match.
    expect(
      (await repo.listAllConversations({ limit: 50, q: "Garchomp" })).rows.map(
        (r) => r.id,
      ),
    ).toEqual([CONVERSATIONS.A1.id]);
    // Message-text-only match ("rain core" is only in B1's assistant message).
    expect(
      (await repo.listAllConversations({ limit: 50, q: "rain core" })).rows.map(
        (r) => r.id,
      ),
    ).toEqual([CONVERSATIONS.B1.id]);
  });

  it("keyset-paginates without overlap", async () => {
    const p1 = await repo.listAllConversations({ limit: 1 });
    expect(p1.rows.map((r) => r.id)).toEqual([CONVERSATIONS.B1.id]);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await repo.listAllConversations({
      limit: 1,
      cursor: p1.nextCursor!,
    });
    expect(p2.rows.map((r) => r.id)).toEqual([CONVERSATIONS.A2.id]);
    expect(p2.nextCursor).not.toBeNull();
    const p3 = await repo.listAllConversations({
      limit: 1,
      cursor: p2.nextCursor!,
    });
    expect(p3.rows.map((r) => r.id)).toEqual([CONVERSATIONS.A1.id]);
    expect(p3.nextCursor).toBeNull();
  });
});

describe("getConversationThread", () => {
  it("returns the summary + ordered turns for any account's thread", async () => {
    const thread = await repo.getConversationThread(CONVERSATIONS.A1.id);
    expect(thread).not.toBeNull();
    expect(thread!.summary.accountEmail).toBe(ACCOUNTS.A.email);
    expect(thread!.summary.messageCount).toBe(2);
    expect(thread!.turns.map((t) => t.seq)).toEqual([0, 1]);
    expect(thread!.turns[0].role).toBe("user");
    expect(thread!.turns[1].role).toBe("assistant");
    expect(thread!.turns[1].answerJson).not.toBeNull();
  });

  it("returns null for an unknown conversation", async () => {
    expect(await repo.getConversationThread("nope")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listAllTeams / getTeamById
// ---------------------------------------------------------------------------

describe("listAllTeams", () => {
  it("lists teams across accounts with member summary + owner", async () => {
    const { rows } = await repo.listAllTeams({ limit: 50 });
    expect(rows.map((r) => r.id)).toEqual([TEAMS.B1.id, TEAMS.A1.id]); // updated_at DESC

    const a = rows.find((r) => r.id === TEAMS.A1.id)!;
    expect(a.accountEmail).toBe(ACCOUNTS.A.email);
    expect(a.memberCount).toBe(1);
    expect(a.incomplete).toBe(true); // 1 of 6
    expect(a.species).toEqual(["venusaur"]);

    const b = rows.find((r) => r.id === TEAMS.B1.id)!;
    expect(b.accountEmail).toBe(ACCOUNTS.B.email);
    expect(b.memberCount).toBe(6);
    expect(b.incomplete).toBe(false); // full 6-pack, all 4 moves
    expect(b.species).toEqual([...TEAM_B1_SPECIES]);
  });

  it("filters by format and searches by name", async () => {
    expect(
      (await repo.listAllTeams({ limit: 50, format: "champions" })).rows.map(
        (r) => r.id,
      ),
    ).toEqual([TEAMS.B1.id]);
    expect(
      (await repo.listAllTeams({ limit: 50, q: "Sun" })).rows.map((r) => r.id),
    ).toEqual([TEAMS.A1.id]);
  });
});

describe("getTeamById", () => {
  it("returns the full team with members + owner for any account", async () => {
    const t = await repo.getTeamById(TEAMS.B1.id);
    expect(t).not.toBeNull();
    expect(t!.accountEmail).toBe(ACCOUNTS.B.email);
    expect(t!.members).toHaveLength(6);
    expect(t!.members[0].species).toBe(TEAM_B1_SPECIES[0]);
  });

  it("returns null for an unknown team", async () => {
    expect(await repo.getTeamById("nope")).toBeNull();
  });
});
