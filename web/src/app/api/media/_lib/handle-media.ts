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
  if (!result.ok) {
    return mediaErrorResponse(result.status, result.reason);
  }
  return mediaSuccessResponse(result.body, result.contentType);
}
