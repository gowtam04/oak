/**
 * resolveAdminGate — the SERVER-COMPONENT half of the two-layer admin gating
 * (AD-5). The real authorization boundary is the per-route `requireAdminRequest`
 * guard (`api/admin/_lib/guard.ts`); THIS gate runs in `admin/layout.tsx` so a
 * non-admin never even receives admin HTML.
 *
 * Rather than `redirect("/")` a non-admin away (which dumped them on the full
 * chat home), the gate now RETURNS a discriminated status and the layout renders
 * a standalone {@link AdminLogin} box in place of the panel:
 *   - `guest`     — no session; show the email → OTP sign-in box.
 *   - `forbidden` — signed in, but the email is not on the `ADMIN_EMAILS`
 *                   allowlist; show a "not an admin account" notice + sign-out.
 *   - `admin`     — allowlisted; render the panel chrome + page.
 * The panel content itself is still never sent to a non-admin (the layout only
 * renders {@link AdminShell}/children for `admin`), and every `/api/admin/*`
 * route independently enforces `requireAdminRequest` (ADMIN-AC-1.4).
 *
 * `getCurrentAccount` and `isAdmin` are reached via DYNAMIC import inside the
 * function — the same deferral the auth/chat/admin routes use. A top-level import
 * would pull the env/db-touching auth chain (`current-user` → `sessions` →
 * `@/data/db` → `@/env`, which throws on a missing `XAI_API_KEY`) into module
 * evaluation and re-introduce the `next build` env throw (CLAUDE.md "ENV" /
 * "API ROUTES" gotchas).
 *
 * `import "server-only"`: this is an authorization decision (it consults the
 * session + the allowlist) and must never be bundled into client code.
 */

import "server-only";

import type { Account } from "@/data/repos/accounts-repo";

/** The gate's decision for the current request. */
export type AdminGateResult =
  | { status: "admin"; account: Account }
  | { status: "guest" }
  | { status: "forbidden"; email: string };

/**
 * Resolve the current request's account and authorize it against the admin
 * allowlist. Never throws/redirects — returns a status the layout branches on:
 * `admin` (allowlisted account), `forbidden` (signed in, not allowlisted), or
 * `guest` (no session). `isAdmin(null)` is `false`, so only a non-null,
 * allowlisted account yields `admin`.
 */
export async function resolveAdminGate(): Promise<AdminGateResult> {
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const { isAdmin } = await import("@/server/auth/admin");

  const account = await getCurrentAccount();
  if (account === null) return { status: "guest" };
  if (!isAdmin(account)) return { status: "forbidden", email: account.email };
  return { status: "admin", account };
}
