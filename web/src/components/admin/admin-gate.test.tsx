import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// admin-gate.ts statically `import "server-only"` (it's an authorization
// decision) and reaches the auth chain via DYNAMIC import. Mock all three seams
// so the test never pulls the real db/env/session chain (jsdom has no Postgres):
//   - server-only → no-op
//   - next/navigation → a redirect spy (real Next throws NEXT_REDIRECT; here we
//     just record the call and let control fall through)
//   - the two dynamically-imported auth modules → controllable spies
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentAccount: vi.fn() }));
vi.mock("@/server/auth/admin", () => ({ isAdmin: vi.fn() }));

import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/server/auth/current-user";
import { isAdmin } from "@/server/auth/admin";
import type { Account } from "@/data/repos/accounts-repo";

import { resolveAdminGate } from "./admin-gate";

const mockRedirect = vi.mocked(redirect);
const mockGetCurrentAccount = vi.mocked(getCurrentAccount);
const mockIsAdmin = vi.mocked(isAdmin);

const ADMIN_ACCOUNT: Account = {
  id: "acc-admin",
  email: "owner@example.com",
  createdAt: 1_700_000_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveAdminGate", () => {
  it("redirects a guest (no session) to / and never returns admin chrome", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    // isAdmin(null) is false; the gate's own null-check also short-circuits
    mockIsAdmin.mockReturnValue(false);

    await resolveAdminGate();

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/");
    // a guest's account is never even consulted for admin membership... but if it
    // is, the answer must be "not admin" — assert the redirect, which is the gate.
  });

  it("redirects a signed-in non-admin to /", async () => {
    mockGetCurrentAccount.mockResolvedValue({
      id: "acc-user",
      email: "user@example.com",
      createdAt: 1_700_000_000_000,
    });
    mockIsAdmin.mockReturnValue(false);

    await resolveAdminGate();

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("returns the account for an allowlisted admin and does NOT redirect", async () => {
    mockGetCurrentAccount.mockResolvedValue(ADMIN_ACCOUNT);
    mockIsAdmin.mockReturnValue(true);

    const account = await resolveAdminGate();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(account).toEqual(ADMIN_ACCOUNT);
    // the gate consulted the live session + the allowlist predicate
    expect(mockGetCurrentAccount).toHaveBeenCalledTimes(1);
    expect(mockIsAdmin).toHaveBeenCalledWith(ADMIN_ACCOUNT);
  });
});
