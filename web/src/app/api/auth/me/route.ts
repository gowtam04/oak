/**
 * `GET /api/auth/me` — report the current auth state (account-creation design.md
 * § API Design "GET /api/auth/me", Phase 4 / p4; AUTH-US-1, AC-1.2).
 *
 * Thin adapter over `current-user.getCurrentAccount`. Lets the (client-rendered)
 * page show "Sign in" vs the signed-in menu on mount. A guest — no cookie, or an
 * expired/unknown/orphaned token — is the first-class `{ signedIn: false }` case
 * (never an error, BR-A11), so this always returns 200.
 *
 *   - account resolved → 200 { signedIn: true, email, lastUsedScope, lastUsedScopes, answerDensity? }
 *   - null (guest)     → 200 { signedIn: false }
 *
 * Champions-first (CF-DATA-BR-21): `lastUsedScope` is always `"champions"` for
 * a signed-in account — a stored gen-7 / National Dex preference must not
 * reopen another game. `lastUsedScopes` is empty or `["champions"]`. Guests
 * omit both.
 *
 * `answerDensity` is additive (COMPACT-US-2 / ADR-9): `"full" | "compact"`.
 * Omitted when the column is NULL so existing clients stay exact
 * (NULL = full, COMPACT-BR-2). Guests omit it (COMPACT-BR-4).
 */

import { json } from "../_lib/http";
import { CHAMPIONS_FORMAT, type Format } from "@/data/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Champions-only MRU, or `[]` if the MRU read fails / holds other games. */
async function lastUsedScopesFor(accountId: string): Promise<Format[]> {
  try {
    const { list } = await import("@/data/repos/scope-mru-repo");
    return (await list(accountId)).filter((f) => f === CHAMPIONS_FORMAT);
  } catch {
    return [];
  }
}

export async function GET(): Promise<Response> {
  // Dynamic import defers the auth chain's env evaluation to request time, so
  // `next build` page-data collection never evaluates @/env (the AUTH_SECRET
  // prod guard) — mirrors the chat route's deferred runtime import.
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const account = await getCurrentAccount();
  if (account === null) {
    return json(200, { signedIn: false });
  }
  const lastUsedScopes = await lastUsedScopesFor(account.id);
  const answerDensity =
    account.answerDensity === "full" || account.answerDensity === "compact"
      ? account.answerDensity
      : undefined;
  return json(200, {
    signedIn: true,
    email: account.email,
    lastUsedScope: CHAMPIONS_FORMAT,
    lastUsedScopes,
    ...(answerDensity ? { answerDensity } : {}),
  });
}
