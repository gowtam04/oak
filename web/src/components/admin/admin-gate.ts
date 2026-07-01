/**
 * resolveAdminGate — the SERVER-COMPONENT half of the two-layer admin gating
 * (AD-5). The real authorization boundary is the per-route `requireAdminRequest`
 * guard (`api/admin/_lib/guard.ts`); THIS gate runs in `admin/layout.tsx` so a
 * non-admin never even receives admin HTML — it redirects them away before any
 * admin page renders (defense in depth; ADMIN-AC-1.2/1.4).
 *
 * The gate logic lives here, not inline in `layout.tsx`, for ONE reason: the
 * jsdom component project does not scan `src/app/**`, so a layout can't be
 * unit-tested. Extracted here under `src/components/admin/`, the decision becomes
 * a testable async function — its test mocks `getCurrentAccount` + `isAdmin` +
 * `next/navigation` and asserts the redirect-vs-allow branch.
 *
 * `getCurrentAccount` and `isAdmin` are reached via DYNAMIC import inside the
 * function — the same deferral the auth/chat/admin routes use. A top-level import
 * would pull the env/db-touching auth chain (`current-user` → `sessions` →
 * `@/data/db` → `@/env`, which throws on a missing `XAI_API_KEY`) into module
 * evaluation and re-introduce the `next build` env throw (CLAUDE.md "ENV" /
 * "API ROUTES" gotchas). `redirect` from `next/navigation` is env-free, so it is
 * imported statically.
 *
 * `import "server-only"`: this is an authorization decision (it consults the
 * session + the allowlist) and must never be bundled into client code.
 */

import "server-only";

import { redirect } from "next/navigation";

import type { Account } from "@/data/repos/accounts-repo";

/**
 * Resolve the current request's account and authorize it as an admin.
 *
 * Returns the (non-null) admin {@link Account} when the caller is allowed.
 * Otherwise calls `redirect("/")` — which throws Next's `NEXT_REDIRECT` control
 * signal (typed `never`), so the function never falls through to a non-admin
 * return. `isAdmin(null)` is `false`, so reaching the return implies a non-null,
 * allowlisted account.
 */
export async function resolveAdminGate(): Promise<Account> {
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const { isAdmin } = await import("@/server/auth/admin");

  const account = await getCurrentAccount();
  if (account === null || !isAdmin(account)) {
    redirect("/");
  }
  return account;
}
