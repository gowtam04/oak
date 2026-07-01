/**
 * Unit tests for the admin allowlist gating
 * (admin-panel design.md § Component Design §2; Build Manifest p3 test_focus:
 * "allowlist match/normalization; empty/unset → zero admins; guard 401/403/pass").
 *
 * `admin.ts` reads `process.env.ADMIN_EMAILS` at CALL TIME, so every case sets
 * the allowlist with `vi.stubEnv` and `afterEach` clears it. `server-only` is
 * stubbed (it throws under the vitest node env). The request guard is exercised
 * here too by mocking the `getCurrentAccount` seam (the p5 integration test
 * covers it end-to-end against a real session).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Replace the identity seam so the guard never touches sessions/next-headers/db.
vi.mock("@/server/auth/current-user", () => ({
  getCurrentAccount: vi.fn(),
}));

import type { Account } from "@/data/repos/accounts-repo";

import { requireAdminRequest } from "@/app/api/admin/_lib/guard";
import { getCurrentAccount } from "@/server/auth/current-user";
import { isAdmin, requireAdmin } from "@/server/auth/admin";

const mockedGetCurrentAccount = vi.mocked(getCurrentAccount);

function acct(email: string, id = "acc_1"): Account {
  return { id, email, createdAt: 1_700_000_000_000 };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAdmin", () => {
  it("returns true for an exact allowlist match", () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    expect(isAdmin(acct("owner@oak.ai"))).toBe(true);
  });

  it("matches case-insensitively (allowlist mixed case, email lower)", () => {
    vi.stubEnv("ADMIN_EMAILS", "Owner@Oak.AI");
    expect(isAdmin(acct("owner@oak.ai"))).toBe(true);
  });

  it("matches case-insensitively (allowlist lower, email mixed case)", () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    expect(isAdmin(acct("OWNER@OAK.AI"))).toBe(true);
  });

  it("ignores surrounding whitespace around allowlist entries", () => {
    vi.stubEnv("ADMIN_EMAILS", "  owner@oak.ai ,  other@x.com  ");
    expect(isAdmin(acct("owner@oak.ai"))).toBe(true);
    expect(isAdmin(acct("other@x.com"))).toBe(true);
  });

  it("ignores surrounding whitespace on the account email", () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    expect(isAdmin(acct("  owner@oak.ai  "))).toBe(true);
  });

  it("matches any entry in a multi-email allowlist", () => {
    vi.stubEnv("ADMIN_EMAILS", "a@oak.ai,b@oak.ai,c@oak.ai");
    expect(isAdmin(acct("b@oak.ai"))).toBe(true);
    expect(isAdmin(acct("c@oak.ai"))).toBe(true);
  });

  it("returns false for an email not on the allowlist", () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    expect(isAdmin(acct("intruder@oak.ai"))).toBe(false);
  });

  it("returns false for a null account even when the allowlist is set", () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    expect(isAdmin(null)).toBe(false);
  });

  describe("empty/unset allowlist ⇒ zero admins", () => {
    it("returns false when ADMIN_EMAILS is unset", () => {
      vi.stubEnv("ADMIN_EMAILS", undefined as unknown as string);
      expect(isAdmin(acct("owner@oak.ai"))).toBe(false);
      expect(isAdmin(null)).toBe(false);
    });

    it("returns false when ADMIN_EMAILS is an empty string", () => {
      vi.stubEnv("ADMIN_EMAILS", "");
      expect(isAdmin(acct("owner@oak.ai"))).toBe(false);
    });

    it("returns false when ADMIN_EMAILS is whitespace-only", () => {
      vi.stubEnv("ADMIN_EMAILS", "   ");
      expect(isAdmin(acct("owner@oak.ai"))).toBe(false);
    });

    it("returns false when ADMIN_EMAILS is only separators", () => {
      vi.stubEnv("ADMIN_EMAILS", " , , ");
      expect(isAdmin(acct("owner@oak.ai"))).toBe(false);
    });
  });
});

describe("requireAdmin", () => {
  it("returns the same account for an admin", () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    const a = acct("owner@oak.ai");
    expect(requireAdmin(a)).toBe(a);
  });

  it("throws for a signed-in non-admin", () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    expect(() => requireAdmin(acct("intruder@oak.ai"))).toThrow();
  });

  it("throws for a null account", () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    expect(() => requireAdmin(null)).toThrow();
  });

  it("throws when the allowlist is unset (zero admins)", () => {
    vi.stubEnv("ADMIN_EMAILS", undefined as unknown as string);
    expect(() => requireAdmin(acct("owner@oak.ai"))).toThrow();
  });
});

describe("requireAdminRequest (guard)", () => {
  const req = new Request("http://localhost/api/admin/overview");

  beforeEach(() => {
    mockedGetCurrentAccount.mockReset();
  });

  it("returns a 401 unauthorized response for an unauthenticated request", async () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    mockedGetCurrentAccount.mockResolvedValue(null);

    const result = await requireAdminRequest(req);
    expect("response" in result).toBe(true);
    if (!("response" in result)) throw new Error("expected a response");
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toMatchObject({ code: "unauthorized" });
  });

  it("returns a 403 forbidden response for a signed-in non-admin", async () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    mockedGetCurrentAccount.mockResolvedValue(acct("intruder@oak.ai"));

    const result = await requireAdminRequest(req);
    expect("response" in result).toBe(true);
    if (!("response" in result)) throw new Error("expected a response");
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toMatchObject({ code: "forbidden" });
  });

  it("returns a 403 for any signed-in user when the allowlist is unset", async () => {
    vi.stubEnv("ADMIN_EMAILS", undefined as unknown as string);
    mockedGetCurrentAccount.mockResolvedValue(acct("owner@oak.ai"));

    const result = await requireAdminRequest(req);
    expect("response" in result).toBe(true);
    if (!("response" in result)) throw new Error("expected a response");
    expect(result.response.status).toBe(403);
  });

  it("passes through the account for an allowlisted admin", async () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    const a = acct("owner@oak.ai");
    mockedGetCurrentAccount.mockResolvedValue(a);

    const result = await requireAdminRequest(req);
    expect("account" in result).toBe(true);
    if (!("account" in result)) throw new Error("expected an account");
    expect(result.account).toBe(a);
  });
});
