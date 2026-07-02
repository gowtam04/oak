/**
 * Derive the client IP used to key abuse-bounding throttles — the guest chat
 * rate limit (`src/app/api/chat/route.ts`) and the OTP request/verify throttles
 * (`src/app/api/auth/*`). This value keys abuse bounding ONLY; it is NEVER
 * trusted for authorization.
 *
 * SECURITY (assessment finding S1): the previous implementation trusted the
 * FIRST (leftmost) `X-Forwarded-For` hop. Behind Fly's edge proxy that element
 * is client-supplied — the edge *appends* the true client IP rather than
 * replacing the header — so an attacker could rotate a forged `X-Forwarded-For`
 * to land every request in a fresh rate-limit bucket and defeat the cap
 * entirely. We instead derive the IP from a source the client cannot forge.
 *
 * Derivation order:
 *   1. `Fly-Client-IP` — the Fly edge sets this to the real peer address and
 *      overwrites any client-supplied value, so it is authoritative and
 *      unspoofable. This is the primary path in production.
 *   2. `X-Forwarded-For` — the hop the *trusted* proxy appended (see
 *      TRUSTED_PROXY_HOPS), i.e. the rightmost hop under the single-proxy
 *      assumption. Covers non-Fly / other-proxy deploys where Fly-Client-IP is
 *      absent.
 *   3. `X-Real-IP` — nginx-style single-value fallback.
 *   4. `"unknown"` — no usable header (the Web `Request` exposes no socket
 *      address); all such callers share one bucket, an acceptable bound.
 */

/**
 * Number of proxy hops we trust in front of the app. On the Fly hobby deploy a
 * single edge proxy sits between the client and the app, and it *appends* the
 * real client IP to `X-Forwarded-For` — so the true client is the LAST
 * (rightmost) hop, i.e. `hops.length - TRUSTED_PROXY_HOPS`. Making this count an
 * explicit named constant (rather than implicitly assuming "leftmost = client")
 * is what closes the spoof: everything to the left of the trusted hop is
 * attacker-controlled and must be ignored.
 */
const TRUSTED_PROXY_HOPS = 1;

export function clientIp(req: Request): string {
  // 1. Fly's authoritative, unspoofable client address (production path).
  const flyClientIp = req.headers.get("fly-client-ip")?.trim();
  if (flyClientIp) return flyClientIp;

  // 2. The hop appended by the trusted proxy — NOT the client-supplied leftmost.
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    if (hops.length > 0) {
      // Clamp to 0 so a shorter-than-expected chain falls back to the leftmost
      // hop rather than indexing out of range.
      const index = Math.max(0, hops.length - TRUSTED_PROXY_HOPS);
      return hops[index]!;
    }
  }

  // 3. nginx-style single-value header.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // 4. No usable source.
  return "unknown";
}
