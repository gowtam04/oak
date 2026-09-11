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

function notFoundResponse(): Response {
  return new Response(null, { status: 404 });
}

function spriteRequest(id: string): Promise<Response> {
  return getSprite(new Request(`http://localhost/api/media/sprite/${id}`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/media/sprite/[id]", () => {
  it("proxies a valid spriteid and sets long cache headers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gifResponse()));
    const res = await spriteRequest("gyarados");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=604800/);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://play.pokemonshowdown.com/sprites/ani/gyarados.gif",
      expect.any(Object),
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not fetch PokeAPI when Showdown returns 200 for a mapped mega", async () => {
    const fetchMock = vi.fn().mockResolvedValue(gifResponse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await spriteRequest("absol-megaz");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://play.pokemonshowdown.com/sprites/ani/absol-megaz.gif",
      expect.any(Object),
    );
  });

  it("falls back to PokeAPI official artwork when Showdown 404s a mapped mega", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("play.pokemonshowdown.com")) return notFoundResponse();
      if (
        url ===
        "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10307.png"
      ) {
        return pngResponse();
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await spriteRequest("absol-megaz");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=604800/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://play.pokemonshowdown.com/sprites/ani/absol-megaz.gif",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10307.png",
      expect.any(Object),
    );
  });

  it("does not cache fallback bytes under the Showdown key", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("play.pokemonshowdown.com")) return notFoundResponse();
      if (url.includes("official-artwork/10309.png")) return pngResponse();
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const first = await spriteRequest("garchomp-megaz");
    expect(first.status).toBe(200);
    expect(first.headers.get("Content-Type")).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const second = await spriteRequest("garchomp-megaz");
    expect(second.status).toBe(200);
    expect(second.headers.get("Content-Type")).toBe("image/png");
    // Showdown is retried (sprite:{id} never stored a 404/PNG). PokeAPI is not.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://play.pokemonshowdown.com/sprites/ani/garchomp-megaz.gif",
      expect.any(Object),
    );
  });

  it("returns 404 without PokeAPI when Showdown 404s an unmapped id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(notFoundResponse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await spriteRequest("not-a-pokemon");
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://play.pokemonshowdown.com/sprites/ani/not-a-pokemon.gif",
      expect.any(Object),
    );
  });

  it("rejects an invalid spriteid without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await spriteRequest("../etc");
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
