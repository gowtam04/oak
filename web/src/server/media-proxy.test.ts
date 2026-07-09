import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _resetMediaCacheForTests,
  MEDIA_CACHE_CONTROL,
  mediaErrorResponse,
  mediaSuccessResponse,
  proxyMedia,
} from "./media-proxy";

afterEach(() => {
  _resetMediaCacheForTests();
  vi.restoreAllMocks();
});

function pngBytes(): ArrayBuffer {
  // Minimal non-empty binary payload (not a real PNG — content-type is mocked).
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).buffer;
}

describe("proxyMedia", () => {
  it("fetches upstream, returns image bytes, and caches the second hit", async () => {
    const body = pngBytes();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );

    const first = await proxyMedia(
      "sprite:garchomp",
      "https://example.test/garchomp.gif",
      "image/gif",
      fetchImpl,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.cacheHit).toBe(false);
    expect(first.contentType).toBe("image/png");
    expect(first.body.byteLength).toBe(body.byteLength);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const second = await proxyMedia(
      "sprite:garchomp",
      "https://example.test/garchomp.gif",
      "image/gif",
      fetchImpl,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.cacheHit).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps upstream 404 to not_found", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("missing", { status: 404 }));
    const result = await proxyMedia(
      "sprite:missingno",
      "https://example.test/missing.gif",
      "image/gif",
      fetchImpl,
    );
    expect(result).toEqual({
      ok: false,
      status: 404,
      reason: "not_found",
    });
  });

  it("maps upstream 429/5xx to 502", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response("rate limited", {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        }),
      );
    const result = await proxyMedia(
      "dex:229",
      "https://example.test/229.png",
      "image/png",
      fetchImpl,
    );
    expect(result).toEqual({
      ok: false,
      status: 502,
      reason: "upstream_429",
    });
  });

  it("maps network failure to 502", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const result = await proxyMedia(
      "sprite:x",
      "https://example.test/x.gif",
      "image/gif",
      fetchImpl,
    );
    expect(result).toEqual({
      ok: false,
      status: 502,
      reason: "upstream_unreachable",
    });
  });
});

describe("media response helpers", () => {
  it("success carries long Cache-Control and content type", async () => {
    const res = mediaSuccessResponse(pngBytes(), "image/gif");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    expect(res.headers.get("Cache-Control")).toBe(MEDIA_CACHE_CONTROL);
  });

  it("errors are no-store JSON", async () => {
    const res = mediaErrorResponse(400, "invalid_param");
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "invalid_param" });
  });
});
