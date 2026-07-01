/**
 * Per-request admin authorization for the `/api/admin/*` surface
 * (admin-panel design.md § Component Design §2, § API Design, AD-5;
 * ADMIN-US-1, ADMIN-AC-1.2/1.3/1.4).
 *
 * Every admin route handler calls `requireAdminRequest(req)` FIRST. It resolves
 * the current account via the existing `getCurrentAccount` seam (cookie, then
 * Bearer — same machinery the rest of the authed surface uses) and returns a
 * discriminated result the handler narrows:
 *   - no session            → `{ response }` carrying `401 {code:"unauthorized"}`
 *   - signed in, not admin  → `{ response }` carrying `403 {code:"forbidden"}`
 *   - signed in + admin      → `{ account }`
 *
 * This is the REAL authorization boundary (ADMIN-AC-1.4): enforced server-side
 * on every admin request, not by hiding client routes. A non-admin gets a bare
 * error envelope and NO admin data in any form (ADMIN-AC-1.2). The error bodies
 * reuse the shared `jsonError(status, code, message)` envelope, identical to the
 * `/api/auth/*` and chat routes.
 *
 * `getCurrentAccount` and `isAdmin` are reached via DYNAMIC import inside the
 * function — the same deferral the auth/chat routes use so `next build`'s
 * page-data collection never eagerly evaluates the env/db-touching auth chain
 * (CLAUDE.md "API ROUTES" rule). This file lives in a Next PRIVATE folder
 * (`_lib`, underscore-prefixed) so it is never treated as a routable segment.
 */

import "server-only";

import type { Account } from "@/data/repos/accounts-repo";

import { jsonError } from "@/app/api/auth/_lib/http";

/**
 * Resolve + authorize the current request as an admin.
 *
 * `req` is accepted for a uniform handler signature; identity itself is read
 * from the request-scoped `next/headers` store inside `getCurrentAccount`
 * (cookie then Bearer), so it is not consulted directly here.
 */
export async function requireAdminRequest(
  req: Request,
): Promise<{ account: Account } | { response: Response }> {
  void req;
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const { isAdmin } = await import("@/server/auth/admin");

  const account = await getCurrentAccount();
  if (account === null) {
    return {
      response: jsonError(401, "unauthorized", "Authentication required."),
    };
  }
  if (!isAdmin(account)) {
    return {
      response: jsonError(403, "forbidden", "Admin access required."),
    };
  }
  return { account };
}
