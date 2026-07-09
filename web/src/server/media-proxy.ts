/**
 * Closed media proxy — fetch an allowlisted upstream image, cache the body
 * in-process, and return a long-cache Response for the client.
 *
 * Used by `/api/media/sprite|artwork|dex-sprite`. Never accepts an arbitrary
 * URL: callers pass a fully-built upstream URL from `@/lib/sprites` builders
 * only. LRU is process-local (lost on redeploy — fine; browser Cache-Control
 * still holds).
 */

import { logger } from "@/server/logger";

/** Success responses are immutable for a week. */
export const MEDIA_CACHE_CONTROL =
  "public, max-age=604800, immutable";

/** Errors must not be sticky in intermediate caches. */
export const MEDIA_ERROR_CACHE_CONTROL = "no-store";

/** Skip caching oversized bodies (large ani GIFs) to protect the 512MB machine. */
const MAX_CACHE_BYTES = 256 * 1024;

/** Soft cap on cached entries (each up to MAX_CACHE_BYTES). */
const MAX_CACHE_ENTRIES = 128;

const UPSTREAM_TIMEOUT_MS = 12_000;

interface CacheEntry {
  body: ArrayBuffer;
  contentType: string;
  /** Insertion order for simple FIFO eviction. */
  at: number;
}

const cache = new Map<string, CacheEntry>();

/** Test-only: drop the in-process cache. */
export function _resetMediaCacheForTests(): void {
  cache.clear();
}

function cacheGet(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  // Refresh insertion order (LRU-ish: delete + re-set).
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (entry.body.byteLength > MAX_CACHE_BYTES) return;
  if (cache.has(key)) cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export type ProxyMediaResult =
  | { ok: true; body: ArrayBuffer; contentType: string; cacheHit: boolean }
  | { ok: false; status: 404 | 502; reason: string };

/**
 * Fetch `upstreamUrl` (or serve from the in-process LRU). Returns the image
 * bytes + content type, or a structured miss for the route to map to HTTP.
 */
export async function proxyMedia(
  cacheKey: string,
  upstreamUrl: string,
  defaultContentType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProxyMediaResult> {
  const cached = cacheGet(cacheKey);
  if (cached) {
    return {
      ok: true,
      body: cached.body,
      contentType: cached.contentType,
      cacheHit: true,
    };
  }

  let res: Response;
  try {
    res = await fetchImpl(upstreamUrl, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        // Identify ourselves politely; some CDNs treat bare bots harshly.
        "User-Agent": "OakMediaProxy/1.0 (+https://oak.gowtam.ai)",
        Accept: "image/*,*/*;q=0.8",
      },
    });
  } catch (err) {
    logger.warn({
      event: "media_proxy_upstream_error",
      cacheKey,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, status: 502, reason: "upstream_unreachable" };
  }

  if (res.status === 404) {
    return { ok: false, status: 404, reason: "not_found" };
  }
  if (!res.ok) {
    logger.warn({
      event: "media_proxy_upstream_status",
      cacheKey,
      status: res.status,
    });
    return { ok: false, status: 502, reason: `upstream_${res.status}` };
  }

  let body: ArrayBuffer;
  try {
    body = await res.arrayBuffer();
  } catch (err) {
    logger.warn({
      event: "media_proxy_read_error",
      cacheKey,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, status: 502, reason: "upstream_read_failed" };
  }

  const contentType =
    res.headers.get("content-type")?.split(";")[0]?.trim() ||
    defaultContentType;

  // Reject obvious non-image error bodies (e.g. GitHub 429 text served as 200
  // is rare, but a text/plain 429 is already handled above via !res.ok).
  if (contentType.startsWith("text/")) {
    return { ok: false, status: 502, reason: "upstream_not_image" };
  }

  cacheSet(cacheKey, { body, contentType, at: Date.now() });
  return { ok: true, body, contentType, cacheHit: false };
}

/** Build a success Response with long-lived cache headers. */
export function mediaSuccessResponse(
  body: ArrayBuffer,
  contentType: string,
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": MEDIA_CACHE_CONTROL,
      // Allow mobile / web on any Oak host to cache; images are public data.
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/** Build an error Response that must not be cached. */
export function mediaErrorResponse(
  status: 400 | 404 | 429 | 502,
  error: string,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": MEDIA_ERROR_CACHE_CONTROL,
      ...extraHeaders,
    },
  });
}
