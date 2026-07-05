/**
 * Ownership check shared by the three `/api/chat/turns/:id/*` endpoints
 * (background-turns/design.md §4 "Ownership"). A turn records
 * `{ accountId, sessionId }` at start:
 *   - signed-in turn (`accountId` set): the caller must resolve (cookie or
 *     Bearer) to the SAME account — the `session_id` param is ignored;
 *   - guest turn (`accountId` null): the caller must supply a `session_id`
 *     (query param, or stop's body field) equal to the turn's `sessionId`.
 *     Unguessable UUIDv4 session ids are the existing guest security model.
 *
 * Account resolution degrades to guest on a fault (a DB blip reading the cookie
 * session must not 500 an ownership check) — a fault simply fails the match,
 * mirroring the chat route's guest-first `getCurrentAccount` handling.
 *
 * Lives in a Next PRIVATE folder (`_lib`) so it is never a routable segment.
 */

export interface TurnOwner {
  accountId: string | null;
  sessionId: string;
}

/**
 * Returns `true` iff the current request owns `owner`. `sessionIdParam` is the
 * caller-supplied guest session id (from `?session_id=` or a stop body); it is
 * consulted only for guest turns.
 */
export async function checkTurnOwnership(
  owner: TurnOwner,
  sessionIdParam: string | null,
): Promise<boolean> {
  if (owner.accountId !== null) {
    // Signed-in turn: the caller must resolve to the same account.
    let accountId: string | null = null;
    try {
      const { getCurrentAccount } = await import("@/server/auth/current-user");
      const account = await getCurrentAccount();
      accountId = account?.id ?? null;
    } catch {
      // Degrade to guest on fault — a null account fails the match below.
    }
    return accountId !== null && accountId === owner.accountId;
  }
  // Guest turn: the session id must match (and be present).
  return sessionIdParam !== null && sessionIdParam === owner.sessionId;
}
