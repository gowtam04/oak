/**
 * Admin allowlist gating for the read-only `/admin` panel
 * (admin-panel design.md § Component Design §2 "Admin auth & gating",
 * § Interface Definitions › Admin auth; AD-5; ADMIN-US-1, ADMIN-AC-1.1/1.2,
 * ADMIN-BR-1).
 *
 * Two tiny pure predicates over the `ADMIN_EMAILS` allowlist:
 *   - `isAdmin(account)`  — is this account's email on the (normalized) list?
 *   - `requireAdmin(account)` — same check, but throws (used where the caller
 *     wants a hard boundary rather than a branch).
 *
 * The allowlist is read from `process.env.ADMIN_EMAILS` AT CALL TIME — NOT via
 * the memoized `@/env` object — for two reasons (CLAUDE.md "ENV" gotcha):
 *   1. `@/env` validates eagerly at import and throws on a missing XAI_API_KEY;
 *      importing it here would re-introduce the build-time env throw onto every
 *      module that gates on admin. Reading `process.env` directly (like
 *      `logger.ts` reads `LOG_LEVEL`) keeps this module build-safe.
 *   2. It lets tests re-stub the list per case with `vi.stubEnv("ADMIN_EMAILS", …)`.
 *
 * Normalization: each allowlist entry and the account email are trimmed and
 * lowercased before comparison, so casing/whitespace differences never cause a
 * false miss. Unset / empty / whitespace-only `ADMIN_EMAILS` ⇒ an empty list ⇒
 * ZERO admins (the safe default — the panel stays dark, design § Deployment).
 *
 * `import "server-only"`: this is an authorization decision and must never be
 * bundled into client code.
 */

import "server-only";

import type { Account } from "@/data/repos/accounts-repo";

/**
 * The normalized admin allowlist, read fresh from `process.env.ADMIN_EMAILS`
 * on every call (no memoization — keeps it re-stubbable in tests and avoids the
 * eager `@/env` throw). Splits on comma, trims + lowercases each entry, and
 * drops empties. Unset/empty ⇒ `[]`.
 */
function adminAllowlist(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * True iff `account` is non-null and its (normalized) email is on the
 * (normalized) `ADMIN_EMAILS` allowlist. A null account, or an empty/unset
 * allowlist, is always `false`.
 */
export function isAdmin(account: Account | null): boolean {
  if (account === null) return false;
  const allowlist = adminAllowlist();
  if (allowlist.length === 0) return false;
  return allowlist.includes(account.email.trim().toLowerCase());
}

/**
 * Like {@link isAdmin}, but throws when the account is not an admin and returns
 * the (now-narrowed) `Account` otherwise. The request-layer guard
 * (`api/admin/_lib/guard.ts`) uses `isAdmin` to map to a 401/403 response;
 * `requireAdmin` is for callers that prefer a thrown boundary.
 */
export function requireAdmin(account: Account | null): Account {
  if (account === null || !isAdmin(account)) {
    throw new Error("forbidden: account is not on the admin allowlist");
  }
  return account;
}
