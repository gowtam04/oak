/**
 * Unit tests for src/server/spend-control.ts — admitAgentTurn +
 * assertNotDenylisted + UTC day helpers.
 *
 * The spend-repo is mocked wholesale (no Postgres). Coverage is the admission
 * order and fail-closed mapping, not the SQL.
 *
 * Coverage (spend-controls Phase 1):
 *   - admin skip: { ok: true, skipped: "admin" }; repo never touched
 *     (SC-BR-6, SC-AC-8.1)
 *   - signed-in denylist → account_denied, surface-specific copy; tryAdmit not
 *     called (SC-BR-11)
 *   - guests skip denylist; cap key `ip:<ip>`
 *   - under cap → { ok: true }; at cap → daily_limit + resetAt/retryAfterMs
 *     (SC-BR-10)
 *   - account key is `acct:<accountId>` not the email (SC-BR-5)
 *   - repo/DB throw → spend_check_failed, never rethrown; tryAdmit not called
 *     after isDenylisted/getCaps throw (SC-BR-8)
 *   - assertNotDenylisted is denylist-only (no tryAdmit); DB throw fail-closed
 *   - voice + teams_assistant share acct:<id> with no surface suffix (SC-BR-4)
 *
 * Missing/invalid cap rows are the repo's job (`getCaps` returns defaults);
 * admitAgentTurn just uses `getCaps()`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const spendRepo = vi.hoisted(() => ({
  getDenylist: vi.fn(),
  addDenylistEmail: vi.fn(),
  removeDenylistEmail: vi.fn(),
  isDenylisted: vi.fn(),
  getCaps: vi.fn(),
  setCaps: vi.fn(),
  tryAdmit: vi.fn(),
}));
vi.mock("@/data/repos/spend-repo", () => spendRepo);

import {
  admitAgentTurn,
  assertNotDenylisted,
  nextUtcMidnightMs,
  utcDay,
  type AgentSurface,
  type SpendSubject,
} from "./spend-control";

const NOW_MS = Date.UTC(2026, 5, 15, 12, 0, 0);
const DAY_UTC = "2026-06-15";
const NEXT_MIDNIGHT_MS = Date.UTC(2026, 5, 16, 0, 0, 0);
const RESET_AT = new Date(NEXT_MIDNIGHT_MS).toISOString();
const RETRY_AFTER_MS = NEXT_MIDNIGHT_MS - NOW_MS;

const ACCOUNT: SpendSubject = {
  kind: "account",
  accountId: "a1",
  email: "ash@example.com",
};
const GUEST: SpendSubject = { kind: "guest", ip: "1.1.1.1" };

function admit(
  overrides: {
    subject?: SpendSubject;
    isAdmin?: boolean;
    surface?: AgentSurface;
    nowMs?: number;
  } = {},
) {
  return admitAgentTurn({
    subject: overrides.subject ?? ACCOUNT,
    isAdmin: overrides.isAdmin ?? false,
    surface: overrides.surface ?? "chat",
    nowMs: overrides.nowMs ?? NOW_MS,
  });
}

beforeEach(() => {
  spendRepo.isDenylisted.mockReset();
  spendRepo.getCaps.mockReset();
  spendRepo.tryAdmit.mockReset();
  spendRepo.getDenylist.mockReset();
  spendRepo.addDenylistEmail.mockReset();
  spendRepo.removeDenylistEmail.mockReset();
  spendRepo.setCaps.mockReset();

  spendRepo.isDenylisted.mockResolvedValue(false);
  spendRepo.getCaps.mockResolvedValue({ signedCap: 25, guestCap: 10 });
  spendRepo.tryAdmit.mockResolvedValue({ admitted: true, count: 1 });
});

describe("utcDay / nextUtcMidnightMs (SC-BR-10)", () => {
  it("pins the UTC calendar day and the next UTC midnight for a frozen nowMs", () => {
    expect(utcDay(NOW_MS)).toBe(DAY_UTC);
    expect(nextUtcMidnightMs(NOW_MS)).toBe(NEXT_MIDNIGHT_MS);
  });

  it("pins just before UTC midnight: still that day, next midnight is the coming one", () => {
    const almost = Date.UTC(2026, 5, 15, 23, 59, 59, 999);
    expect(utcDay(almost)).toBe("2026-06-15");
    expect(nextUtcMidnightMs(almost)).toBe(Date.UTC(2026, 5, 16, 0, 0, 0));
  });

  it("pins exactly UTC midnight: that new day, next midnight is the following one", () => {
    const midnight = Date.UTC(2026, 5, 16, 0, 0, 0);
    expect(utcDay(midnight)).toBe("2026-06-16");
    expect(nextUtcMidnightMs(midnight)).toBe(Date.UTC(2026, 5, 17, 0, 0, 0));
  });

  it("uses the UTC date even when US Pacific is still the previous calendar day", () => {
    // 2026-06-16T04:00:00.000Z == 2026-06-15 21:00 PDT (UTC−7).
    const utcMorning = Date.UTC(2026, 5, 16, 4, 0, 0);
    expect(utcDay(utcMorning)).toBe("2026-06-16");
    expect(nextUtcMidnightMs(utcMorning)).toBe(Date.UTC(2026, 5, 17, 0, 0, 0));
  });
});

describe("admitAgentTurn — admin skip (SC-BR-6, SC-AC-8.1)", () => {
  it("returns { ok: true, skipped: 'admin' } and never calls isDenylisted/tryAdmit/getCaps", async () => {
    spendRepo.isDenylisted.mockResolvedValue(true);
    spendRepo.getCaps.mockRejectedValue(new Error("should not be called"));
    spendRepo.tryAdmit.mockRejectedValue(new Error("should not be called"));

    await expect(
      admit({
        subject: {
          kind: "account",
          accountId: "admin-1",
          email: "blocked-admin@oak.ai",
        },
        isAdmin: true,
        surface: "chat",
      }),
    ).resolves.toEqual({ ok: true, skipped: "admin" });

    expect(spendRepo.isDenylisted).not.toHaveBeenCalled();
    expect(spendRepo.tryAdmit).not.toHaveBeenCalled();
    expect(spendRepo.getCaps).not.toHaveBeenCalled();
  });
});

describe("admitAgentTurn — denylist (SC-BR-11)", () => {
  const surfaces: Array<{ surface: AgentSurface; message: string }> = [
    { surface: "chat", message: "This account can't use chat." },
    {
      surface: "teams_assistant",
      message: "This account can't use the teams assistant.",
    },
    { surface: "voice", message: "This account can't use voice." },
  ];

  it.each(surfaces)(
    "signed-in denylisted $surface → account_denied with surface copy; tryAdmit not called",
    async ({ surface, message }) => {
      spendRepo.isDenylisted.mockResolvedValue(true);

      await expect(admit({ surface })).resolves.toEqual({
        ok: false,
        code: "account_denied",
        message,
      });

      expect(spendRepo.isDenylisted).toHaveBeenCalledWith("ash@example.com");
      expect(spendRepo.getCaps).not.toHaveBeenCalled();
      expect(spendRepo.tryAdmit).not.toHaveBeenCalled();
    },
  );
});

describe("admitAgentTurn — guests skip denylist", () => {
  it("does not call isDenylisted and caps via key ip:<ip> with the guest cap", async () => {
    spendRepo.isDenylisted.mockRejectedValue(
      new Error("guests are not denylist-checked"),
    );
    spendRepo.getCaps.mockResolvedValue({ signedCap: 40, guestCap: 7 });
    spendRepo.tryAdmit.mockResolvedValue({ admitted: true, count: 1 });

    await expect(admit({ subject: GUEST })).resolves.toEqual({ ok: true });

    expect(spendRepo.isDenylisted).not.toHaveBeenCalled();
    expect(spendRepo.tryAdmit).toHaveBeenCalledWith("ip:1.1.1.1", DAY_UTC, 7);
  });
});

describe("admitAgentTurn — daily cap (SC-BR-4, SC-BR-5, SC-BR-10)", () => {
  it("under cap (tryAdmit admitted true) → { ok: true } with no skipped", async () => {
    spendRepo.tryAdmit.mockResolvedValue({ admitted: true, count: 3 });

    await expect(admit()).resolves.toEqual({ ok: true });
  });

  it("account subject uses tryAdmit key acct:<accountId> and the signed cap, not the email", async () => {
    spendRepo.getCaps.mockResolvedValue({ signedCap: 40, guestCap: 7 });
    spendRepo.tryAdmit.mockResolvedValue({ admitted: true, count: 1 });

    await admit({
      subject: {
        kind: "account",
        accountId: "a1",
        email: "ash@example.com",
      },
    });

    expect(spendRepo.tryAdmit).toHaveBeenCalledWith("acct:a1", DAY_UTC, 40);
    expect(spendRepo.tryAdmit).not.toHaveBeenCalledWith(
      expect.stringContaining("ash@example.com"),
      expect.anything(),
      expect.anything(),
    );
  });

  it("voice and teams_assistant share tryAdmit key acct:<id> with no surface suffix (SC-BR-4)", async () => {
    spendRepo.tryAdmit.mockResolvedValue({ admitted: true, count: 1 });

    await expect(admit({ surface: "voice" })).resolves.toEqual({ ok: true });
    await expect(admit({ surface: "teams_assistant" })).resolves.toEqual({
      ok: true,
    });

    expect(spendRepo.tryAdmit.mock.calls).toEqual([
      ["acct:a1", DAY_UTC, 25],
      ["acct:a1", DAY_UTC, 25],
    ]);
  });

  it("at cap → daily_limit with reset copy, resetAt ISO of next UTC midnight, retryAfterMs set (SC-BR-10)", async () => {
    spendRepo.tryAdmit.mockResolvedValue({ admitted: false, count: 25 });

    await expect(admit()).resolves.toEqual({
      ok: false,
      code: "daily_limit",
      message: `Daily limit reached. Try again tomorrow (resets at ${RESET_AT} UTC).`,
      resetAt: RESET_AT,
      retryAfterMs: RETRY_AFTER_MS,
    });
  });
});

describe("admitAgentTurn — fail-closed (SC-BR-8)", () => {
  const failed = { ok: false as const, code: "spend_check_failed" as const };

  it("repo throw from isDenylisted → spend_check_failed and never rethrows", async () => {
    spendRepo.isDenylisted.mockRejectedValue(new Error("db down"));
    await expect(admit()).resolves.toMatchObject(failed);
    expect(spendRepo.tryAdmit).not.toHaveBeenCalled();
  });

  it("repo throw from getCaps → spend_check_failed and never rethrows", async () => {
    spendRepo.getCaps.mockRejectedValue(new Error("db down"));
    await expect(admit()).resolves.toMatchObject(failed);
    expect(spendRepo.tryAdmit).not.toHaveBeenCalled();
  });

  it("repo throw from tryAdmit → spend_check_failed and never rethrows", async () => {
    spendRepo.tryAdmit.mockRejectedValue(new Error("db down"));
    await expect(admit()).resolves.toMatchObject(failed);
  });
});

describe("assertNotDenylisted", () => {
  it("denylisted → account_denied with chat copy; does not call tryAdmit", async () => {
    spendRepo.isDenylisted.mockResolvedValue(true);

    await expect(assertNotDenylisted("blocked@example.com")).resolves.toEqual({
      ok: false,
      code: "account_denied",
      message: "This account can't use chat.",
    });
    expect(spendRepo.isDenylisted).toHaveBeenCalledWith("blocked@example.com");
    expect(spendRepo.tryAdmit).not.toHaveBeenCalled();
  });

  it("not denylisted → { ok: true }; does not call tryAdmit", async () => {
    spendRepo.isDenylisted.mockResolvedValue(false);

    await expect(assertNotDenylisted("ash@example.com")).resolves.toEqual({
      ok: true,
    });
    expect(spendRepo.isDenylisted).toHaveBeenCalledWith("ash@example.com");
    expect(spendRepo.tryAdmit).not.toHaveBeenCalled();
  });

  it("repo throw from isDenylisted → spend_check_failed and never rethrows (SC-BR-8)", async () => {
    spendRepo.isDenylisted.mockRejectedValue(new Error("db down"));
    await expect(assertNotDenylisted("ash@example.com")).resolves.toMatchObject({
      ok: false,
      code: "spend_check_failed",
    });
    expect(spendRepo.tryAdmit).not.toHaveBeenCalled();
  });
});
