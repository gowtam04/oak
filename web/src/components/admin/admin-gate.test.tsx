import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// admin-gate.ts statically `import "server-only"` (it's an authorization
// decision) and reaches the auth chain via DYNAMIC import. Mock the seams so the
// test never pulls the real db/env/session chain (jsdom has no Postgres):
//   - server-only → no-op
//   - the two dynamically-imported auth modules → controllable spies
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentAccount: vi.fn() }));
vi.mock("@/server/auth/admin", () => ({ isAdmin: vi.fn() }));

import { getCurrentAccount } from "@/server/auth/current-user";
import { isAdmin } from "@/server/auth/admin";
import type { Account } from "@/data/repos/accounts-repo";

import { resolveAdminGate } from "./admin-gate";

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
  it("returns { status: 'guest' } when there is no session", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    mockIsAdmin.mockReturnValue(false);

    const result = await resolveAdminGate();

    expect(result).toEqual({ status: "guest" });
    // a guest is never consulted for admin membership
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it("returns { status: 'forbidden', email } for a signed-in non-admin", async () => {
    mockGetCurrentAccount.mockResolvedValue({
      id: "acc-user",
      email: "user@example.com",
      createdAt: 1_700_000_000_000,
    });
    mockIsAdmin.mockReturnValue(false);

    const result = await resolveAdminGate();

    expect(result).toEqual({ status: "forbidden", email: "user@example.com" });
  });

  it("returns { status: 'admin', account } for an allowlisted admin", async () => {
    mockGetCurrentAccount.mockResolvedValue(ADMIN_ACCOUNT);
    mockIsAdmin.mockReturnValue(true);

    const result = await resolveAdminGate();

    expect(result).toEqual({ status: "admin", account: ADMIN_ACCOUNT });
    expect(mockGetCurrentAccount).toHaveBeenCalledTimes(1);
    expect(mockIsAdmin).toHaveBeenCalledWith(ADMIN_ACCOUNT);
  });
});
