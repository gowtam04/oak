/**
 * Route-adapter tests for POST/DELETE /api/admin/spend/cap-exempt
 * (spend-controls architecture; SC-US-9, SC-BR-16).
 *
 * Thin HTTP adapter: requireAdminRequest runs FIRST (401/403), then email
 * validation, then spend-repo add/remove. Admin emails are allowed (already
 * uncapped — no 409). The repo is mocked; gating uses the real isAdmin plus
 * a stubbed getCurrentAccount — same identity seam as
 * admin-routes.integration.test.ts.
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
  addCapExemptEmail: vi.fn(),
  removeCapExemptEmail: vi.fn(),
}));
vi.mock("@/data/repos/spend-repo", () => ({
  getCaps: spend.getCaps,
  getDenylist: spend.getDenylist,
  getCapExempt: spend.getCapExempt,
  addCapExemptEmail: spend.addCapExemptEmail,
  removeCapExemptEmail: spend.removeCapExemptEmail,
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
  return new Request("http://admin.test/api/admin/spend/cap-exempt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(body: unknown): Request {
  return new Request("http://admin.test/api/admin/spend/cap-exempt", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteQueryReq(email: string): Request {
  const url = new URL("http://admin.test/api/admin/spend/cap-exempt");
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
  spend.addCapExemptEmail.mockReset();
  spend.removeCapExemptEmail.mockReset();
  spend.getCaps.mockResolvedValue({ signedCap: 25, guestCap: 10 });
  spend.getDenylist.mockResolvedValue([]);
  spend.getCapExempt.mockResolvedValue([]);
  spend.addCapExemptEmail.mockResolvedValue(undefined);
  spend.removeCapExemptEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/spend/cap-exempt", () => {
  it("returns 401 {code:'unauthorized'} to a guest (SC-AC-2.2)", async () => {
    asGuest();
    const res = await POST(postReq({ email: "friend@example.com" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthorized");
    expect(spend.addCapExemptEmail).not.toHaveBeenCalled();
  });

  it("returns 403 {code:'forbidden'} to a signed-in non-admin (SC-AC-2.2)", async () => {
    asNonAdmin();
    const res = await POST(postReq({ email: "friend@example.com" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(spend.addCapExemptEmail).not.toHaveBeenCalled();
  });

  it("gates before validation: a guest posting an empty email still gets 401", async () => {
    asGuest();
    const res = await POST(postReq({ email: "" }));
    expect(res.status).toBe(401);
    expect(spend.addCapExemptEmail).not.toHaveBeenCalled();
  });

  it("400s empty or invalid email and does not write (SC-US-9)", async () => {
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
      spend.addCapExemptEmail.mockClear();
      const res = await POST(postReq(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).code).toBe("invalid_request");
      expect(spend.addCapExemptEmail).not.toHaveBeenCalled();
    }
  });

  it("200s when adding an ADMIN_EMAILS address (already uncapped; no 409)", async () => {
    asAdmin();
    const entry = {
      email: ADMIN_EMAIL,
      addedAt: 1_700_000_000_000,
      addedBy: ADMIN_EMAIL,
    };
    spend.getCapExempt.mockResolvedValue([entry]);

    const res = await POST(postReq({ email: ADMIN_EMAIL }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(spend.addCapExemptEmail).toHaveBeenCalledWith(
      ADMIN_EMAIL,
      ADMIN_EMAIL,
    );
  });

  it("200 { ok: true, spend } on add, echoing the stored caps (SC-US-9)", async () => {
    asAdmin();
    const entry = {
      email: "friend@example.com",
      addedAt: 1_700_000_000_000,
      addedBy: ADMIN_EMAIL,
    };
    spend.getCaps.mockResolvedValue({ signedCap: 40, guestCap: 5 });
    spend.getCapExempt.mockResolvedValue([entry]);

    const res = await POST(postReq({ email: "friend@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      spend: {
        signedCap: 40,
        guestCap: 5,
        denylist: [],
        capExempt: [entry],
      },
    });
    expect(spend.addCapExemptEmail).toHaveBeenCalledTimes(1);
    expect(spend.addCapExemptEmail).toHaveBeenCalledWith(
      "friend@example.com",
      ADMIN_EMAIL,
    );
  });

  it("normalizes padded mixed-case email before add (SC-BR-16)", async () => {
    asAdmin();
    const entry = {
      email: "friend@example.com",
      addedAt: 1_700_000_000_000,
      addedBy: ADMIN_EMAIL,
    };
    spend.getCapExempt.mockResolvedValue([entry]);

    const res = await POST(postReq({ email: "  Friend@Example.COM  " }));
    expect(res.status).toBe(200);
    expect(spend.addCapExemptEmail).toHaveBeenCalledWith(
      "friend@example.com",
      ADMIN_EMAIL,
    );
  });

  it("200 is idempotent when the email is already cap-exempt", async () => {
    asAdmin();
    const entry = {
      email: "friend@example.com",
      addedAt: 1_700_000_000_000,
      addedBy: ADMIN_EMAIL,
    };
    spend.getCapExempt.mockResolvedValue([entry]);

    const first = await POST(postReq({ email: "friend@example.com" }));
    const second = await POST(postReq({ email: "friend@example.com" }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody).toEqual({
      ok: true,
      spend: {
        signedCap: 25,
        guestCap: 10,
        denylist: [],
        capExempt: [entry],
      },
    });
    expect(secondBody.spend.capExempt).toHaveLength(1);
    expect(spend.addCapExemptEmail).toHaveBeenCalledTimes(2);
  });
});

describe("DELETE /api/admin/spend/cap-exempt", () => {
  it("returns 401 {code:'unauthorized'} to a guest (SC-AC-2.2)", async () => {
    asGuest();
    const res = await DELETE(deleteReq({ email: "friend@example.com" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthorized");
    expect(spend.removeCapExemptEmail).not.toHaveBeenCalled();
  });

  it("returns 403 {code:'forbidden'} to a signed-in non-admin (SC-AC-2.2)", async () => {
    asNonAdmin();
    const res = await DELETE(deleteReq({ email: "friend@example.com" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(spend.removeCapExemptEmail).not.toHaveBeenCalled();
  });

  it("200 even if the email is absent (idempotent remove)", async () => {
    asAdmin();
    const res = await DELETE(deleteReq({ email: "absent@example.com" }));
    expect(res.status).toBe(200);
    expect(spend.removeCapExemptEmail).toHaveBeenCalledTimes(1);
    expect(spend.removeCapExemptEmail).toHaveBeenCalledWith(
      "absent@example.com",
    );
  });

  it("200 removes a present email from the body", async () => {
    asAdmin();
    const res = await DELETE(deleteReq({ email: "friend@example.com" }));
    expect(res.status).toBe(200);
    expect(spend.removeCapExemptEmail).toHaveBeenCalledWith(
      "friend@example.com",
    );
  });

  it("200 accepts email as a query param", async () => {
    asAdmin();
    const res = await DELETE(deleteQueryReq("friend@example.com"));
    expect(res.status).toBe(200);
    expect(spend.removeCapExemptEmail).toHaveBeenCalledWith(
      "friend@example.com",
    );
  });
});
