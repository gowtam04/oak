/**
 * Shared helpers for the `/api/conversations/*` route adapters
 * (docs/features/chat-history § API Design, Phase 3). These are THIN adapters
 * over `conversation-repo`; their job is to resolve the account, parse the
 * request, call the repo, and serialize JSON.
 *
 * The repo (`@/data/repos/conversation-repo`) and `getCurrentAccount`
 * (`@/server/auth/current-user`) are reached via DYNAMIC import so `next build`
 * never evaluates `@/env` at page-data collection (the AUTH_SECRET prod guard) —
 * mirrors the auth routes and the chat route. Lives in a Next PRIVATE folder
 * (`_lib`) so it is never a routable segment.
 */

import type { Account } from "@/data/repos/accounts-repo";

/** Resolve the signed-in account for this request, or `null` for a guest. */
export async function currentAccount(): Promise<Account | null> {
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  return getCurrentAccount();
}

/** The conversation repo, loaded at request time (server-only). */
export async function conversationRepo(): Promise<
  typeof import("@/data/repos/conversation-repo")
> {
  return import("@/data/repos/conversation-repo");
}

/** The folder repo, loaded at request time (server-only). */
export async function folderRepo(): Promise<
  typeof import("@/data/repos/folder-repo")
> {
  return import("@/data/repos/folder-repo");
}

/** Artifact-pin repo, loaded at request time (server-only). */
export async function artifactPinRepo(): Promise<
  typeof import("@/data/repos/artifact-pin-repo")
> {
  return import("@/data/repos/artifact-pin-repo");
}

/** Repo errors stamped with `.code` (folder_limit, pin_limit, …). */
export function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
