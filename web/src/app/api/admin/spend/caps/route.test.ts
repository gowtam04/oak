/**
 * Route-adapter tests for POST /api/admin/spend/caps (spend-controls
 * architecture § API Design; SC-US-4, SC-AC-2.2, SC-AC-4.2, SC-AC-4.3).
 *
 * Thin HTTP adapter: requireAdminRequest runs FIRST (401 guest / 403
 * non-admin), then body validation, then spend-repo.setCaps. The repo is
 * mocked; gating uses the real isAdmin (ADMIN_EMAILS at call time) plus a
 * stubbed getCurrentAccount — same identity seam as
 * admin-routes.integration.test.ts.
 *
 * The route module is created in Phase 3; collection fails until then.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

const spend = vi.hoisted(() => ({
  getCaps: vi.fn(),
  setCaps: vi.fn(),
  getDenylist: vi.fn(),
  getCapExempt: vi.fn(),
}));
vi.mock("@/data/repos/spend-repo", () => ({
  getCaps: spend.getCaps,
  setCaps: spend.setCaps,
  getDenylist: spend.getDenylist,
  getCapExempt: spend.getCapExempt,
}));

import { POST } from "./route";

const ADMIN_EMAIL = "owner@oak.test";

function asAdmin(): void {
  vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL);
  cu.getCurrentAccount.mockResolvedValue({
    id: "acct-admin",
    email: ADMIN_EMAIL,
    createdAt: 0,
    lastUsedScope: null,
  });
}

function asNonAdmin(): void {
  vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL);
  cu.getCurrentAccount.mockResolvedValue({
    id: "acct-misty",
    email: "misty@cerulean.gym",
    createdAt: 0,
    lastUsedScope: null,
  });
}

function asGuest(): void {
  vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL);
  cu.getCurrentAccount.mockResolvedValue(null);
}

function capsReq(body: unknown): Request {
  return new Request("http://admin.test/api/admin/spend/caps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  cu.getCurrentAccount.mockReset();
  cu.getCurrentAccount.mockResolvedValue(null);
  vi.unstubAllEnvs();
  spend.getCaps.mockReset();
  spend.setCaps.mockReset();
  spend.getDenylist.mockReset();
  spend.getCapExempt.mockReset();
  spend.getCaps.mockResolvedValue({ signedCap: 25, guestCap: 10 });
  spend.setCaps.mockResolvedValue(undefined);
  spend.getDenylist.mockResolvedValue([]);
  spend.getCapExempt.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/spend/caps", () => {
  it("returns 401 {code:'unauthorized'} to a guest (SC-AC-2.2)", async () => {
    asGuest();
    const res = await POST(capsReq({ signedCap: 40, guestCap: 5 }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthorized");
    expect(spend.setCaps).not.toHaveBeenCalled();
  });

  it("returns 403 {code:'forbidden'} to a signed-in non-admin (SC-AC-2.2)", async () => {
    asNonAdmin();
    const res = await POST(capsReq({ signedCap: 40, guestCap: 5 }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(spend.setCaps).not.toHaveBeenCalled();
  });

  it("gates before validation: a guest posting 0 still gets 401, not 400", async () => {
    asGuest();
    const res = await POST(capsReq({ signedCap: 0, guestCap: 0 }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthorized");
    expect(spend.setCaps).not.toHaveBeenCalled();
  });

  it("400s invalid_request for 0, negative, and non-integer caps (SC-AC-4.3)", async () => {
    asAdmin();
    const bodies: unknown[] = [
      { signedCap: 0, guestCap: 10 },
      { signedCap: 25, guestCap: 0 },
      { signedCap: -1, guestCap: 10 },
      { signedCap: 25, guestCap: -5 },
      { signedCap: 1.5, guestCap: 10 },
      { signedCap: 25, guestCap: 2.2 },
      { signedCap: "25", guestCap: 10 },
      { signedCap: 25, guestCap: "10" },
      { signedCap: 25 },
      { guestCap: 10 },
      {},
      { signedCap: null, guestCap: 10 },
    ];
    for (const body of bodies) {
      spend.setCaps.mockClear();
      const res = await POST(capsReq(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).code).toBe("invalid_request");
      expect(spend.setCaps).not.toHaveBeenCalled();
    }
  });

  it("200 returns the spend object (including a non-empty denylist) and writes caps as the admin (SC-AC-4.2)", async () => {
    asAdmin();
    const denylist = [
      {
        email: "blocked@example.com",
        addedAt: 1_700_000_000_000,
        addedBy: ADMIN_EMAIL,
      },
    ];
    spend.getCaps.mockResolvedValue({ signedCap: 40, guestCap: 5 });
    spend.getDenylist.mockResolvedValue(denylist);

    const res = await POST(capsReq({ signedCap: 40, guestCap: 5 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      signedCap: 40,
      guestCap: 5,
      denylist,
      capExempt: [],
    });
    expect(spend.setCaps).toHaveBeenCalledTimes(1);
    expect(spend.setCaps).toHaveBeenCalledWith(
      { signedCap: 40, guestCap: 5 },
      ADMIN_EMAIL,
    );
  });
});
