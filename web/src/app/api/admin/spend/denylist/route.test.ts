/**
 * Route-adapter tests for POST/DELETE /api/admin/spend/denylist
 * (spend-controls architecture § API Design; SC-US-1, SC-US-2, SC-AC-1.3,
 * SC-AC-2.1, SC-AC-2.2, SC-BR-6, SC-BR-12).
 *
 * Thin HTTP adapter: requireAdminRequest runs FIRST (401/403), then email
 * validation, then 409 admin_exempt if the target is on ADMIN_EMAILS, then
 * spend-repo add/remove. The repo is mocked; gating uses the real isAdmin
 * plus a stubbed getCurrentAccount — same identity seam as
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
  getDenylist: vi.fn(),
  getCapExempt: vi.fn(),
  addDenylistEmail: vi.fn(),
  removeDenylistEmail: vi.fn(),
}));
vi.mock("@/data/repos/spend-repo", () => ({
  getCaps: spend.getCaps,
  getDenylist: spend.getDenylist,
  getCapExempt: spend.getCapExempt,
  addDenylistEmail: spend.addDenylistEmail,
  removeDenylistEmail: spend.removeDenylistEmail,
}));

import { DELETE, POST } from "./route";

const ADMIN_EMAIL = "owner@oak.test";
const OTHER_ADMIN = "other-admin@oak.test";

function asAdmin(): void {
  vi.stubEnv("ADMIN_EMAILS", `${ADMIN_EMAIL}, ${OTHER_ADMIN}`);
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

function postReq(body: unknown): Request {
  return new Request("http://admin.test/api/admin/spend/denylist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(body: unknown): Request {
  return new Request("http://admin.test/api/admin/spend/denylist", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteQueryReq(email: string): Request {
  const url = new URL("http://admin.test/api/admin/spend/denylist");
  url.searchParams.set("email", email);
  return new Request(url.toString(), { method: "DELETE" });
}

beforeEach(() => {
  cu.getCurrentAccount.mockReset();
  cu.getCurrentAccount.mockResolvedValue(null);
  vi.unstubAllEnvs();
  spend.getCaps.mockReset();
  spend.getDenylist.mockReset();
  spend.getCapExempt.mockReset();
  spend.addDenylistEmail.mockReset();
  spend.removeDenylistEmail.mockReset();
  spend.getCaps.mockResolvedValue({ signedCap: 25, guestCap: 10 });
  spend.getDenylist.mockResolvedValue([]);
  spend.getCapExempt.mockResolvedValue([]);
  spend.addDenylistEmail.mockResolvedValue(undefined);
  spend.removeDenylistEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/spend/denylist", () => {
  it("returns 401 {code:'unauthorized'} to a guest (SC-AC-2.2)", async () => {
    asGuest();
    const res = await POST(postReq({ email: "blocked@example.com" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthorized");
    expect(spend.addDenylistEmail).not.toHaveBeenCalled();
  });

  it("returns 403 {code:'forbidden'} to a signed-in non-admin (SC-AC-2.2)", async () => {
    asNonAdmin();
    const res = await POST(postReq({ email: "blocked@example.com" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(spend.addDenylistEmail).not.toHaveBeenCalled();
  });

  it("gates before validation: a guest posting an empty email still gets 401", async () => {
    asGuest();
    const res = await POST(postReq({ email: "" }));
    expect(res.status).toBe(401);
    expect(spend.addDenylistEmail).not.toHaveBeenCalled();
  });

  it("400s empty or invalid email and does not write (SC-US-1)", async () => {
    asAdmin();
    const bodies: unknown[] = [
      { email: "" },
      { email: "   " },
      { email: "not-an-email" },
      { email: "no-at-domain" },
      { email: "@nouser.com" },
      { email: 1 },
      { email: null },
      {},
    ];
    for (const body of bodies) {
      spend.addDenylistEmail.mockClear();
      const res = await POST(postReq(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).code).toBe("invalid_request");
      expect(spend.addDenylistEmail).not.toHaveBeenCalled();
    }
  });

  it("409s admin_exempt when the email is on ADMIN_EMAILS (SC-AC-1.3, SC-BR-6)", async () => {
    asAdmin();
    const res = await POST(postReq({ email: ADMIN_EMAIL }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("admin_exempt");
    expect(spend.addDenylistEmail).not.toHaveBeenCalled();
  });

  it("409s admin_exempt case-insensitively for any allowlisted email", async () => {
    asAdmin();
    const res = await POST(postReq({ email: "Owner@Oak.TEST" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("admin_exempt");
    expect(spend.addDenylistEmail).not.toHaveBeenCalled();

    const other = await POST(postReq({ email: OTHER_ADMIN }));
    expect(other.status).toBe(409);
    expect((await other.json()).code).toBe("admin_exempt");
    expect(spend.addDenylistEmail).not.toHaveBeenCalled();
  });

  it("200 { ok: true, spend } on add, echoing the stored caps (SC-US-1, SC-AC-1.1)", async () => {
    asAdmin();
    const entry = {
      email: "blocked@example.com",
      addedAt: 1_700_000_000_000,
      addedBy: ADMIN_EMAIL,
    };
    spend.getCaps.mockResolvedValue({ signedCap: 40, guestCap: 5 });
    spend.getDenylist.mockResolvedValue([entry]);

    const res = await POST(postReq({ email: "blocked@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      spend: {
        signedCap: 40,
        guestCap: 5,
        denylist: [entry],
        capExempt: [],
      },
    });
    expect(spend.addDenylistEmail).toHaveBeenCalledTimes(1);
    expect(spend.addDenylistEmail).toHaveBeenCalledWith(
      "blocked@example.com",
      ADMIN_EMAIL,
    );
  });

  it("normalizes padded mixed-case email before add (SC-BR-2)", async () => {
    asAdmin();
    const entry = {
      email: "blocked@example.com",
      addedAt: 1_700_000_000_000,
      addedBy: ADMIN_EMAIL,
    };
    spend.getCaps.mockResolvedValue({ signedCap: 40, guestCap: 5 });
    spend.getDenylist.mockResolvedValue([entry]);

    const res = await POST(postReq({ email: "  Blocked@Example.COM  " }));
    expect(res.status).toBe(200);
    expect(spend.addDenylistEmail).toHaveBeenCalledWith(
      "blocked@example.com",
      ADMIN_EMAIL,
    );
  });

  it("200 is idempotent when the email is already denylisted", async () => {
    asAdmin();
    const entry = {
      email: "blocked@example.com",
      addedAt: 1_700_000_000_000,
      addedBy: ADMIN_EMAIL,
    };
    spend.getCaps.mockResolvedValue({ signedCap: 40, guestCap: 5 });
    spend.getDenylist.mockResolvedValue([entry]);

    const first = await POST(postReq({ email: "blocked@example.com" }));
    const second = await POST(postReq({ email: "blocked@example.com" }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody).toEqual({
      ok: true,
      spend: {
        signedCap: 40,
        guestCap: 5,
        denylist: [entry],
        capExempt: [],
      },
    });
    expect(secondBody.spend.denylist).toHaveLength(1);
    expect(spend.addDenylistEmail).toHaveBeenCalledTimes(2);
  });
});

describe("DELETE /api/admin/spend/denylist", () => {
  it("returns 401 {code:'unauthorized'} to a guest (SC-AC-2.2)", async () => {
    asGuest();
    const res = await DELETE(deleteReq({ email: "blocked@example.com" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthorized");
    expect(spend.removeDenylistEmail).not.toHaveBeenCalled();
  });

  it("returns 403 {code:'forbidden'} to a signed-in non-admin (SC-AC-2.2)", async () => {
    asNonAdmin();
    const res = await DELETE(deleteReq({ email: "blocked@example.com" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(spend.removeDenylistEmail).not.toHaveBeenCalled();
  });

  it("200 even if the email is absent (SC-AC-2.1, idempotent remove)", async () => {
    asAdmin();
    const res = await DELETE(deleteReq({ email: "absent@example.com" }));
    expect(res.status).toBe(200);
    expect(spend.removeDenylistEmail).toHaveBeenCalledTimes(1);
    expect(spend.removeDenylistEmail).toHaveBeenCalledWith(
      "absent@example.com",
    );
  });

  it("200 removes a present email from the body", async () => {
    asAdmin();
    const res = await DELETE(deleteReq({ email: "blocked@example.com" }));
    expect(res.status).toBe(200);
    expect(spend.removeDenylistEmail).toHaveBeenCalledWith(
      "blocked@example.com",
    );
  });

  it("200 accepts email as a query param", async () => {
    asAdmin();
    const res = await DELETE(deleteQueryReq("blocked@example.com"));
    expect(res.status).toBe(200);
    expect(spend.removeDenylistEmail).toHaveBeenCalledWith(
      "blocked@example.com",
    );
  });
});
