/**
 * src/server/spend-control.ts — server admission gate for paid agent starts.
 *
 * `admitAgentTurn`: denylist (signed-in) → cap-exempt (signed-in, still
 * increments) → daily cap → atomic increment. Admins short-circuit with no
 * repo calls. Any thrown DB error maps to
 * `{ ok: false, code: "spend_check_failed" }` (fail-closed, SC-BR-8).
 *
 * `assertNotDenylisted`: denylist only (voice tool/transcript). No increment.
 */

import "server-only";

import {
  getCaps,
  isCapExempt,
  isDenylisted,
  recordAdmit,
  tryAdmit,
} from "@/data/repos/spend-repo";

/** UTC calendar day `YYYY-MM-DD`. */
export function utcDay(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Epoch ms of the next UTC midnight AFTER `nowMs` (tomorrow if already midnight). */
export function nextUtcMidnightMs(nowMs = Date.now()): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export type SpendSubject =
  | { kind: "account"; accountId: string; email: string }
  | { kind: "guest"; ip: string };

export type SpendRefuseCode =
  | "account_denied"
  | "daily_limit"
  | "spend_check_failed";

export type AdmitResult =
  | { ok: true; skipped?: "admin" | "cap_exempt" }
  | {
      ok: false;
      code: SpendRefuseCode;
      message?: string;
      resetAt?: string;
      retryAfterMs?: number;
    };

export type AgentSurface = "chat" | "teams_assistant" | "voice";

const DENIED_COPY: Record<AgentSurface, string> = {
  chat: "This account can't use chat.",
  teams_assistant: "This account can't use the teams assistant.",
  voice: "This account can't use voice.",
};

function dailyLimitMessage(resetAt: string): string {
  return `Daily limit reached. Try again tomorrow (resets at ${resetAt} UTC).`;
}

/**
 * Denylist (signed-in) → cap-exempt (signed-in) → daily cap → admit.
 * Admins (`isAdmin`) always `{ ok: true, skipped: "admin" }`.
 * Cap-exempt accounts `{ ok: true, skipped: "cap_exempt" }` and still
 * increment via `recordAdmit`. Guests: cap only, key `ip:<ip>`.
 * `surface` selects the denylist copy.
 */
export async function admitAgentTurn(input: {
  subject: SpendSubject;
  isAdmin: boolean;
  surface: AgentSurface;
  nowMs?: number;
}): Promise<AdmitResult> {
  if (input.isAdmin) {
    return { ok: true, skipped: "admin" };
  }

  const nowMs = input.nowMs ?? Date.now();
  try {
    const { subject, surface } = input;

    if (subject.kind === "account") {
      const denied = await isDenylisted(subject.email);
      if (denied) {
        return {
          ok: false,
          code: "account_denied",
          message: DENIED_COPY[surface],
        };
      }
      if (await isCapExempt(subject.email)) {
        await recordAdmit(`acct:${subject.accountId}`, utcDay(nowMs));
        return { ok: true, skipped: "cap_exempt" };
      }
    }

    const caps = await getCaps();
    const key =
      subject.kind === "account"
        ? `acct:${subject.accountId}`
        : `ip:${subject.ip}`;
    const cap = subject.kind === "account" ? caps.signedCap : caps.guestCap;
    const result = await tryAdmit(key, utcDay(nowMs), cap);
    if (result.admitted) {
      return { ok: true };
    }

    const resetMs = nextUtcMidnightMs(nowMs);
    const resetAt = new Date(resetMs).toISOString();
    return {
      ok: false,
      code: "daily_limit",
      message: dailyLimitMessage(resetAt),
      resetAt,
      retryAfterMs: resetMs - nowMs,
    };
  } catch {
    return { ok: false, code: "spend_check_failed" };
  }
}

/** Denylist-only (voice tool/transcript). No increment. */
export async function assertNotDenylisted(email: string): Promise<AdmitResult> {
  try {
    const denied = await isDenylisted(email);
    if (denied) {
      return {
        ok: false,
        code: "account_denied",
        message: DENIED_COPY.chat,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "spend_check_failed" };
  }
}
