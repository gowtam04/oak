/**
 * Shared HTTP helpers for the `/api/auth/*` route adapters
 * (account-creation design.md § API Design, Phase 4 / p4).
 *
 * The four auth routes are THIN adapters over `auth-service` / `sessions`
 * (§ Component Design "Auth API routes … thin HTTP adapters"). Their only job is
 * to: parse the request, derive the source IP for the OTP throttle, hand off to
 * the service, and serialize the returned discriminated-union Result into a
 * plain JSON response. None of these helpers — and none of the routes — throw
 * for in-domain conditions; every documented failure rides a JSON body with a
 * status (mirrors the chat route's `jsonError`, src/app/api/chat/route.ts).
 *
 * This file lives in a Next.js PRIVATE folder (`_lib`, underscore-prefixed) so
 * it is never treated as a routable segment.
 */

import { readJsonBodyWithLimit } from "@/server/body-limit";

/** Serialize a JSON body with an explicit status + optional extra headers. */
export function json(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

/**
 * Error envelope identical to the chat route's `jsonError` ({ code, message }),
 * with an optional `extra` object merged in (e.g. `attemptsRemaining`) and
 * optional extra headers (e.g. `Retry-After`).
 */
export function jsonError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Response {
  return json(status, { code, message, ...extra }, extraHeaders);
}

/**
 * Build a `Retry-After` header (whole seconds, floored at 1) from a
 * `retryAfterMs` — mirrors the chat route's 429 path (`Math.ceil(ms / 1000)`).
 */
export function retryAfterHeader(retryAfterMs: number): Record<string, string> {
  return { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) };
}

/**
 * The client IP that keys the OTP request/verify throttles. Shared with the chat
 * rate limit via `@/server/client-ip`: it trusts `Fly-Client-IP` first, then the
 * proxy-appended (rightmost) `X-Forwarded-For` hop — NOT the spoofable leftmost
 * hop (finding S1) — then `X-Real-IP`, else `"unknown"`. This value keys an
 * abuse-bounding throttle ONLY — it is never trusted for authorization.
 */
export { clientIp } from "@/server/client-ip";

/**
 * Read + shape-check a JSON request body under a HARD streaming byte cap
 * (EDGE-01). Returns the parsed object, or `null` for malformed JSON, a
 * non-object body, OR an over-cap body (the caller maps `null` to a 400
 * `invalid_request`). Field-level validation is the caller's.
 *
 * `maxBytes` defaults to 64 KiB — auth bodies (email + OTP code) are tiny, so
 * all existing callers get the cap for free. A caller with a legitimately larger
 * payload (e.g. `/api/conversations/import`, whose turns carry full OakAnswer
 * JSON) passes an explicit larger cap. The cap is enforced by streaming the body
 * and aborting past the limit, so a chunked (no-Content-Length) request can't
 * buffer an uncapped body — see `readJsonBodyWithLimit`.
 *
 * Callers needing to DISTINGUISH an over-cap body (413) from malformed JSON
 * (400) should call `readJsonBodyWithLimit` directly; this helper collapses both
 * to `null` for the tiny auth routes where a 400 is acceptable either way.
 */
export async function readJsonObject(
  req: Request,
  maxBytes = 64 * 1024,
): Promise<Record<string, unknown> | null> {
  const result = await readJsonBodyWithLimit(req, maxBytes);
  if (!result.ok) return null;
  const raw = result.value;
  if (typeof raw !== "object" || raw === null) return null;
  return raw as Record<string, unknown>;
}
