/**
 * Unit tests for the first-party media routes. Upstream fetch is mocked via
 * proxyMedia's injectable path by mocking the whole media-proxy module's
 * fetch path through global fetch — the routes call proxyMedia which uses
 * global fetch by default.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { _resetMediaCacheForTests } from "@/server/media-proxy";
import { _resetStoreForTests } from "@/server/rate-limit";

import { GET as getSprite } from "./sprite/[id]/route";
import { GET as getArtwork } from "./artwork/[dex]/route";
import { GET as getDexSprite } from "./dex-sprite/[dex]/route";

beforeEach(() => {
  _resetStoreForTests();
  _resetMediaCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function pngResponse(): Response {
  return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
}

function gifResponse(): Response {
  return new Response(new Uint8Array([0x47, 0x49, 0x46]), {
    status: 200,
    headers: { "Content-Type": "image/gif" },
  });
}

describe("GET /api/media/sprite/[id]", () => {
  it("proxies a valid spriteid and sets long cache headers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gifResponse()));
    const res = await getSprite(
      new Request("http://localhost/api/media/sprite/gyarados"),
      { params: Promise.resolve({ id: "gyarados" }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=604800/);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://play.pokemonshowdown.com/sprites/ani/gyarados.gif",
      expect.any(Object),
    );
  });

  it("rejects an invalid spriteid without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await getSprite(
      new Request("http://localhost/api/media/sprite/../etc"),
      { params: Promise.resolve({ id: "../etc" }) },
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/media/artwork/[dex]", () => {
  it("proxies a valid dex number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pngResponse()));
    const res = await getArtwork(
      new Request("http://localhost/api/media/artwork/130"),
      { params: Promise.resolve({ dex: "130" }) },
    );
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/130.png",
      expect.any(Object),
    );
  });

  it("rejects a non-integer dex", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await getArtwork(
      new Request("http://localhost/api/media/artwork/nope"),
      { params: Promise.resolve({ dex: "nope" }) },
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/media/dex-sprite/[dex]", () => {
  it("proxies the front sprite by dex", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pngResponse()));
    const res = await getDexSprite(
      new Request("http://localhost/api/media/dex-sprite/229"),
      { params: Promise.resolve({ dex: "229" }) },
    );
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/229.png",
      expect.any(Object),
    );
  });
});
