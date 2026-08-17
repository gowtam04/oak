/**
 * `GET /api/auth/me` — report the current auth state (account-creation design.md
 * § API Design "GET /api/auth/me", Phase 4 / p4; AUTH-US-1, AC-1.2).
 *
 * Thin adapter over `current-user.getCurrentAccount`. Lets the (client-rendered)
 * page show "Sign in" vs the signed-in menu on mount. A guest — no cookie, or an
 * expired/unknown/orphaned token — is the first-class `{ signedIn: false }` case
 * (never an error, BR-A11), so this always returns 200.
 *
 *   - account resolved → 200 { signedIn: true, email, lastUsedScope?, lastUsedScopes }
 *   - null (guest)     → 200 { signedIn: false }
 *
 * `lastUsedScope` is the signed-in account's remembered game scope for new
 * chats (a Format literal). Omitted when never set so old clients that only
 * read `signedIn`/`email` stay happy; new clients use it to seed the empty
 * new-chat chip before the first turn.
 *
 * `lastUsedScopes` (plural, SCOPE-US-2 / ADR-8) is the signed-in MRU list
 * newest-first (may be `[]`). Guests omit it. Singular `lastUsedScope` stays.
 * A list() fault fail-softs to `[]` so MRU never 500s the auth bootstrap.
 */

import { json } from "../_lib/http";
import { isFormat, type Format } from "@/data/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Newest-first known formats, or `[]` if the MRU read fails. */
async function lastUsedScopesFor(accountId: string): Promise<Format[]> {
  try {
    const { list } = await import("@/data/repos/scope-mru-repo");
    return (await list(accountId)).filter(isFormat);
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
  return json(200, {
    signedIn: true,
    email: account.email,
    ...(account.lastUsedScope ? { lastUsedScope: account.lastUsedScope } : {}),
    lastUsedScopes,
  });
}
