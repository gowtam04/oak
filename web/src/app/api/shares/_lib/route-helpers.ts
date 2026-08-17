/**
 * Shared helpers for the `/api/shares/*` route adapters (chat-qol Phase 4).
 *
 * Thin HTTP adapters over `share-repo` / `conversation-repo` / `team-repo`.
 * Repos and `getCurrentAccount` are reached via DYNAMIC import so `next build`
 * never evaluates `@/env` at page-data collection.
 */

import { json } from "@/app/api/auth/_lib/http";
import type { Account } from "@/data/repos/accounts-repo";
import type { OakAnswer } from "@/agent/schemas";
import { SITE_ORIGIN } from "@/lib/site";

/** Resolve the signed-in account for this request, or `null` for a guest. */
export async function currentAccount(): Promise<Account | null> {
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  return getCurrentAccount();
}

export async function shareRepo(): Promise<
  typeof import("@/data/repos/share-repo")
> {
  return import("@/data/repos/share-repo");
}

export async function conversationRepo(): Promise<
  typeof import("@/data/repos/conversation-repo")
> {
  return import("@/data/repos/conversation-repo");
}

export async function teamRepo(): Promise<
  typeof import("@/data/repos/team-repo")
> {
  return import("@/data/repos/team-repo");
}

/** Canonical public URL for a share id (`GET /a/{id}`). */
export function shareUrl(id: string): string {
  return `${SITE_ORIGIN}/a/${id}`;
}

/** Revoke must take effect immediately (ADR-6). */
export const NO_STORE = { "Cache-Control": "private, no-store" };

export function shareError(
  status: number,
  error: string,
  message?: string,
  extraHeaders?: Record<string, string>,
): Response {
  return json(
    status,
    message === undefined ? { error } : { error, message },
    extraHeaders,
  );
}

export const UNAUTHORIZED = () =>
  shareError(401, "unauthenticated", "You must be signed in.");
export const NOT_FOUND = () => shareError(404, "not_found");

export function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** Public JSON envelope (natives + OG). Live snapshot only. */
export function publicShareBody(share: {
  id: string;
  questionText: string;
  answer: OakAnswer;
  conversationTitle: string;
  createdAt: number;
}): {
  id: string;
  question: string;
  answer: OakAnswer;
  conversationTitle: string;
  createdAt: number;
} {
  return {
    id: share.id,
    question: share.questionText,
    answer: share.answer,
    conversationTitle: share.conversationTitle,
    createdAt: share.createdAt,
  };
}
