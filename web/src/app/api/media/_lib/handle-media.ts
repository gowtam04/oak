/**
 * Shared request handler for `/api/media/*` — rate-limit, validate, proxy.
 */

import { retryAfterHeader } from "@/app/api/auth/_lib/http";
import { clientIp } from "@/server/client-ip";
import {
  mediaErrorResponse,
  mediaSuccessResponse,
  proxyMedia,
} from "@/server/media-proxy";
import { checkRateLimit, MEDIA_READ_CONFIG } from "@/server/rate-limit";

export async function handleMediaGet(opts: {
  req: Request;
  cacheKey: string;
  upstreamUrl: string;
  defaultContentType: string;
  /** When false, the param was invalid — return 400 without hitting upstream. */
  valid: boolean;
  /**
   * Tried only when the primary upstream returns 404. Distinct `cacheKey` so
   * a later primary success is not stuck behind fallback bytes.
   */
  fallback?: {
    cacheKey: string;
    upstreamUrl: string;
    defaultContentType: string;
  };
}): Promise<Response> {
  if (!opts.valid) {
    return mediaErrorResponse(400, "invalid_param");
  }

  const gate = await checkRateLimit(
    `media:${clientIp(opts.req)}`,
    "",
    MEDIA_READ_CONFIG,
  );
  if (!gate.allowed) {
    const retryAfterMs =
      gate.reason === "rate_limited" ? gate.retryAfterMs : 0;
    return mediaErrorResponse(
      429,
      "rate_limited",
      retryAfterHeader(retryAfterMs),
    );
  }

  const result = await proxyMedia(
    opts.cacheKey,
    opts.upstreamUrl,
    opts.defaultContentType,
  );
  if (result.ok) {
    return mediaSuccessResponse(result.body, result.contentType);
  }
  if (result.status === 404 && opts.fallback) {
    const fallback = await proxyMedia(
      opts.fallback.cacheKey,
      opts.fallback.upstreamUrl,
      opts.fallback.defaultContentType,
    );
    if (!fallback.ok) {
      return mediaErrorResponse(fallback.status, fallback.reason);
    }
    return mediaSuccessResponse(fallback.body, fallback.contentType);
  }
  return mediaErrorResponse(result.status, result.reason);
}
