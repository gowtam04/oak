/**
 * Oracle tests for src/data/repos/admin-analytics-repo.ts — the cross-account
 * AGGREGATION reads behind the admin observability surfaces.
 *
 * Harness (mirrors usage-repo.oracle.test.ts / accounts-repo.test.ts): the repo
 * reads the `@/data/db` SINGLETON, so we migrate an isolated Postgres schema
 * (seed "none"), installAsSingleton(fix) BEFORE the first dynamic import of the
 * repo, neutralize `server-only` (throws under the vitest node env), then seed
 * the shared admin fixture. All tests here are READ-ONLY over that single seed,
 * so there is no per-test truncate.
 *
 * The expected numbers are KNOWN BY CONSTRUCTION from the fixture layout
 * (test/fixtures/admin-fixture.ts header). Cost assertions recompute the
 * expectation through `estimateCostUsd` against the documented token sums, so
 * they never hardcode the placeholder price table (AD-6 / ADMIN-BR-5).
 *
 * Coverage (design.md § Interface Definitions › admin-analytics-repo; ADMIN-US-2/
 * 3/4/7/11, ADMIN-BR-8/9, AD-4/AD-6/AD-7):
 *   - getUsageSeries: day + hour bucket boundaries, distinct active counts
 *     (per-bucket vs range total), signups, guest/signed split, [from,to) scoping.
 *   - getCostBreakdown: per-model token rollups, priced flag, unpriced/null model,
 *     cost trend, estimated:true.
 *   - getErrorBreakdown: every BR-9 category incl. tool_error and the auth-sourced
 *     otp_email_failed, totals and rates.
 *   - getHeavyUsers: ranking by turns/cost/errors, guest sessions, limit.
 *   - getLive: recent ordering + last-hour window counters.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// admin-analytics-repo.ts / db.ts `import "server-only"` (throws under node).
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
  DAY,
  HOUR,
  LIVE,
  LIVE_NOW,
  seedAdminFixture,
} from "../../../test/fixtures/admin-fixture";

type Repo = typeof import("./admin-analytics-repo");

let fix: PgFixture;
let repo: Repo;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  await seedAdminFixture(fix.db);
  repo = await import("./admin-analytics-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

// ---------------------------------------------------------------------------
// getUsageSeries (ADMIN-US-2, ADMIN-BR-8)
// ---------------------------------------------------------------------------

describe("getUsageSeries", () => {
  it("buckets turns/active/signups per UTC day over the range", async () => {
    const { buckets, totals } = await repo.getUsageSeries(ADMIN_RANGE);

    // Three consecutive UTC day buckets (Jan-5 / Jan-6 / Jan-7).
    expect(buckets).toEqual([
      { t: BASE, turns: 5, activeSigned: 2, activeGuest: 2, signups: 1 },
      { t: BASE + DAY, turns: 4, activeSigned: 2, activeGuest: 2, signups: 1 },
      { t: BASE + 2 * DAY, turns: 3, activeSigned: 2, activeGuest: 1, signups: 0 },
    ]);

    // Range totals: distinct active is over the WHOLE window (G1 spans two days
    // but counts once → 4 distinct guest sessions), not the sum of per-bucket
    // distincts (2+2+1 = 5).
    expect(totals).toEqual({
      turns: 12,
      activeSigned: 3, // ash, misty, brock
      activeGuest: 4, // G1, G2, G3, G4
      signups: 2, // ash + misty signed up inside the range
      guestTurns: 5,
      signedTurns: 7,
    });
  });

  it("buckets by UTC hour, and excludes turns at the exclusive `to` bound", async () => {
    // One UTC day, hour buckets: the five Jan-5 turns each land in their own hour.
    const { buckets, totals } = await repo.getUsageSeries({
      from: BASE,
      to: BASE + DAY,
      bucket: "hour",
    });

    expect(buckets).toEqual([
      // ash signs up at BASE+1h, so the signup lands in that hour bucket too.
      { t: BASE + 1 * HOUR, turns: 1, activeSigned: 1, activeGuest: 0, signups: 1 },
      { t: BASE + 2 * HOUR, turns: 1, activeSigned: 1, activeGuest: 0, signups: 0 },
      { t: BASE + 3 * HOUR, turns: 1, activeSigned: 0, activeGuest: 1, signups: 0 },
      { t: BASE + 4 * HOUR, turns: 1, activeSigned: 0, activeGuest: 1, signups: 0 },
      { t: BASE + 5 * HOUR, turns: 1, activeSigned: 1, activeGuest: 0, signups: 0 },
    ]);

    // Only Jan-5 turns; the `tr-before` (BASE−1h) row is excluded by `from`.
    expect(totals.turns).toBe(5);
    expect(totals.signups).toBe(1); // only ash (misty signs up on Jan-6)
  });

  it("counts an empty window as all-zero", async () => {
    const { buckets, totals } = await repo.getUsageSeries({
      from: BASE - 100 * DAY,
      to: BASE - 90 * DAY,
      bucket: "day",
    });
    expect(buckets).toEqual([]);
    expect(totals).toEqual({
      turns: 0,
      activeSigned: 0,
      activeGuest: 0,
      signups: 0,
      guestTurns: 0,
      signedTurns: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// getCostBreakdown (ADMIN-US-3, ADMIN-BR-5 / AD-6)
// ---------------------------------------------------------------------------

describe("getCostBreakdown", () => {
  it("rolls up tokens & estimated USD by model, flagging unpriced/null models", async () => {
    const { byModel, totalEstUsd, estimated } = await repo.getCostBreakdown(
      ADMIN_RANGE,
    );
    expect(estimated).toBe(true);

    const byKey = new Map(byModel.map((m) => [m.model, m]));

    // grok-4.3 over the range: tr-01/02/03/07/08/11.
    const grokTokens = { inputTokens: 2750, outputTokens: 580, thinkingTokens: 80 };
    expect(byKey.get("grok-4.3")).toMatchObject({ priced: true, ...grokTokens });
    expect(byKey.get("grok-4.3")!.estUsd).toBeCloseTo(
      estimateCostUsd({ model: "grok-4.3", ...grokTokens }),
      9,
    );

    // claude: tr-04/05.
    const claudeTokens = { inputTokens: 1000, outputTokens: 150, thinkingTokens: 20 };
    expect(byKey.get("claude")).toMatchObject({ priced: true, ...claudeTokens });

    // gpt-5.5: tr-06/10.
    const gptTokens = { inputTokens: 1150, outputTokens: 300, thinkingTokens: 0 };
    expect(byKey.get("gpt-5.5")).toMatchObject({ priced: true, ...gptTokens });

    // "mystery" is not in the price table → priced:false, estUsd 0.
    expect(byKey.get("mystery")).toMatchObject({
      priced: false,
      estUsd: 0,
      inputTokens: 400,
    });

    // The rate_limited row has model NULL → reported as "n/a", unpriced.
    expect(byKey.get("n/a")).toMatchObject({
      priced: false,
      estUsd: 0,
      inputTokens: 0,
    });

    // Total reconciles with the sum of per-model estimates.
    const expectedTotal =
      estimateCostUsd({ model: "grok-4.3", ...grokTokens }) +
      estimateCostUsd({ model: "claude", ...claudeTokens }) +
      estimateCostUsd({ model: "gpt-5.5", ...gptTokens });
    expect(totalEstUsd).toBeCloseTo(expectedTotal, 9);
  });

  it("returns a per-bucket cost trend that sums to the total", async () => {
    const { series, totalEstUsd } = await repo.getCostBreakdown(ADMIN_RANGE);

    // One cost bucket per active UTC day.
    expect(series.map((s) => s.t)).toEqual([BASE, BASE + DAY, BASE + 2 * DAY]);

    // Jan-5: grok (1800/380/50) + claude (1000/150/20).
    expect(series[0].estUsd).toBeCloseTo(
      estimateCostUsd({ model: "grok-4.3", inputTokens: 1800, outputTokens: 380, thinkingTokens: 50 }) +
        estimateCostUsd({ model: "claude", inputTokens: 1000, outputTokens: 150, thinkingTokens: 20 }),
      9,
    );

    const seriesSum = series.reduce((acc, s) => acc + s.estUsd, 0);
    expect(seriesSum).toBeCloseTo(totalEstUsd, 9);
  });
});

// ---------------------------------------------------------------------------
// getErrorBreakdown (ADMIN-US-4, ADMIN-BR-9)
// ---------------------------------------------------------------------------

describe("getErrorBreakdown", () => {
  it("counts every BR-9 failure category over the range with rates vs total turns", async () => {
    const { categories, totalTurns } = await repo.getErrorBreakdown(ADMIN_RANGE);
    expect(totalTurns).toBe(12);

    const byKey = new Map(categories.map((c) => [c.key, c]));
    expect(byKey.get("resolution_failed")!.count).toBe(1); // tr-04
    expect(byKey.get("clarification_needed")!.count).toBe(1); // tr-07
    expect(byKey.get("insufficient_data")!.count).toBe(1); // tr-10
    expect(byKey.get("tool_error")!.count).toBe(2); // tr-02 (1 err) + tr-11 (2 errs) = 2 turns
    expect(byKey.get("otp_email_failed")!.count).toBe(1); // auth_event, in-range
    expect(byKey.get("rate_limited")!.count).toBe(1); // tr-12

    // Rate is count / totalTurns * 100.
    expect(byKey.get("tool_error")!.ratePct).toBeCloseTo((2 / 12) * 100, 9);
    expect(byKey.get("rate_limited")!.ratePct).toBeCloseTo((1 / 12) * 100, 9);

    // Stable display order (mirrors the ErrorCategoryKey union).
    expect(categories.map((c) => c.key)).toEqual([
      "resolution_failed",
      "clarification_needed",
      "insufficient_data",
      "tool_error",
      "otp_email_failed",
      "rate_limited",
    ]);
  });

  it("reports zero rates (never NaN) for an empty window", async () => {
    const { categories, totalTurns } = await repo.getErrorBreakdown({
      from: BASE - 100 * DAY,
      to: BASE - 90 * DAY,
      bucket: "day",
    });
    expect(totalTurns).toBe(0);
    for (const c of categories) {
      expect(c.count).toBe(0);
      expect(c.ratePct).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getHeavyUsers (ADMIN-US-11)
// ---------------------------------------------------------------------------

describe("getHeavyUsers", () => {
  it("ranks accounts AND guest sessions by turns, including guests with null ids", async () => {
    const { rows } = await repo.getHeavyUsers(ADMIN_RANGE, "turns", 10);

    // 7 subjects: 3 accounts + 4 guest sessions.
    expect(rows).toHaveLength(7);

    // ash is the heaviest (4 turns); misty (2) ranks above guest G1 (2) on the
    // estUsd tiebreak.
    expect(rows[0]).toMatchObject({ accountId: ACCOUNTS.A.id, turns: 4, failed: 1 });
    expect(rows[1]).toMatchObject({ accountId: ACCOUNTS.B.id, turns: 2 });
    expect(rows[2]).toMatchObject({ accountId: null, turns: 2 }); // guest G1

    // A guest row carries no account identity (ADMIN-AC-11.1 covers guest sessions).
    const guest = rows.find((r) => r.accountId === null)!;
    expect(guest.email).toBeNull();

    // ash's estimated cost is its grok-4.3 turns (2200/440/80).
    expect(rows[0].estUsd).toBeCloseTo(
      estimateCostUsd({
        model: "grok-4.3",
        inputTokens: 2200,
        outputTokens: 440,
        thinkingTokens: 80,
      }),
      9,
    );
  });

  it("ranks by estimated cost", async () => {
    const { rows } = await repo.getHeavyUsers(ADMIN_RANGE, "cost", 3);
    // ash (grok-heavy) > brock (claude) > misty (gpt) by estUsd.
    expect(rows.map((r) => r.accountId)).toEqual([
      ACCOUNTS.A.id,
      ACCOUNTS.C.id,
      ACCOUNTS.B.id,
    ]);
    // Strictly descending estimated cost.
    expect(rows[0].estUsd).toBeGreaterThan(rows[1].estUsd);
    expect(rows[1].estUsd).toBeGreaterThan(rows[2].estUsd);
  });

  it("ranks by errors (failed + rate_limited) and surfaces the rate-limited guest", async () => {
    const { rows } = await repo.getHeavyUsers(ADMIN_RANGE, "errors", 10);

    // ash leads (1 failure + most turns on the tiebreak).
    expect(rows[0].accountId).toBe(ACCOUNTS.A.id);

    // Exactly four subjects have any error signal: ash & misty (1 failed each),
    // guest G2 (1 failed), guest G4 (1 rate_limited).
    const withErrors = rows.filter((r) => r.rateLimited + r.failed > 0);
    expect(withErrors).toHaveLength(4);

    // The rate-limited subject is a guest (null account) with rateLimited=1.
    const rl = rows.find((r) => r.rateLimited > 0)!;
    expect(rl.accountId).toBeNull();
    expect(rl.rateLimited).toBe(1);
    expect(rl.failed).toBe(0);
  });

  it("respects the limit", async () => {
    const { rows } = await repo.getHeavyUsers(ADMIN_RANGE, "turns", 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.accountId)).toEqual([ACCOUNTS.A.id, ACCOUNTS.B.id]);
  });
});

// ---------------------------------------------------------------------------
// getLive (ADMIN-US-7, ADMIN-BR-10)
// ---------------------------------------------------------------------------

describe("getLive", () => {
  // getLive reads the wall clock for its last-hour window; the fixture's live
  // rows sit at FIXED offsets from LIVE_NOW, so pin Date.now to LIVE_NOW to make
  // the window deterministic. Fake ONLY `Date` (not setTimeout) so the real
  // node-postgres driver timers keep working.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LIVE_NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns recent turns newest-first with an estimated cost per row", async () => {
    const { recent } = await repo.getLive();

    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThanOrEqual(20);

    // The most recent seeded turn is the live row at now−5m.
    expect(recent[0].sessionId).toBe(LIVE.topSession);
    expect(recent[0].estUsd).toBeCloseTo(
      estimateCostUsd({
        model: LIVE.topModel,
        inputTokens: LIVE.topInput,
        outputTokens: LIVE.topOutput,
        thinkingTokens: LIVE.topThinking,
      }),
      9,
    );

    // Strictly non-increasing createdAt (newest first).
    for (let i = 1; i < recent.length; i++) {
      expect(recent[i - 1].createdAt).toBeGreaterThanOrEqual(recent[i].createdAt);
    }
  });

  it("counts the current-hour window (turns + distinct active sessions)", async () => {
    const { window } = await repo.getLive();
    // LIVE1 (−5m) + LIVE2 (−30m) are inside the last hour; LIVE3 (−90m) is not,
    // and every historical fixture row is far older.
    expect(window.lastHourTurns).toBe(LIVE.expectedLastHourTurns);
    expect(window.lastHourActive).toBe(LIVE.expectedLastHourActive);
  });
});
