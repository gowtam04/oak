/**
 * Unit tests for T20 `web_search` — `fetch` and `@/env` are both mocked, so
 * these are pure (no network is ever reachable):
 *   - a happy-path Tavily response maps to the output shape (title/url/snippet/
 *     published_at) and `recency` maps to Tavily's `days` param,
 *   - a missing TAVILY_API_KEY short-circuits to `search_unavailable` with no
 *     fetch call at all,
 *   - a request timeout retries once, then still degrades to
 *     `search_unavailable` (fake timers drive the abort),
 *   - a 5xx response retries once; a persistent 5xx still degrades to
 *     `search_unavailable`,
 *   - a malformed/invalid response body degrades to `search_unavailable`,
 *   - invalid tool input degrades to `search_unavailable` (no throw, no fetch).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentContext } from "@/agent/types";

const mockEnv = vi.hoisted(() => ({
  env: { TAVILY_API_KEY: undefined as string | undefined },
}));
vi.mock("@/env", () => mockEnv);

import { webSearchTool } from "./web-search";
import { tools } from "@/agent/tools";

const ctx = {
  db: {},
  logger: console,
  requestId: "test",
  mode: "champions",
} as unknown as AgentContext;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  mockEnv.env.TAVILY_API_KEY = "test-tavily-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("web_search (T20) — happy path", () => {
  it("maps a Tavily response into the output shape and posts the key/query", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(sent.api_key).toBe("test-tavily-key");
      expect(sent.query).toBe("Pokémon Winds and Waves release date");
      expect(sent.max_results).toBe(8);
      return jsonResponse(200, {
        results: [
          {
            title: "Winds and Waves announced",
            url: "https://example.com/a",
            content: "A short snippet.",
            published_date: "2027-01-15",
          },
          { title: "No date entry", url: "https://example.com/b", content: "x" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await webSearchTool.run(
      { query: "Pokémon Winds and Waves release date" },
      ctx,
    );

    expect(out).toEqual({
      results: [
        {
          title: "Winds and Waves announced",
          url: "https://example.com/a",
          snippet: "A short snippet.",
          published_at: "2027-01-15",
        },
        { title: "No date entry", url: "https://example.com/b", snippet: "x" },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps recency to Tavily's days param", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(sent.days).toBe(7);
      return jsonResponse(200, { results: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await webSearchTool.run({ query: "current anime season", recency: "week" }, ctx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps results at 8", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      title: `t${i}`,
      url: `https://example.com/${i}`,
      content: "x",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { results: many })),
    );
    const out = (await webSearchTool.run({ query: "q" }, ctx)) as {
      results: unknown[];
    };
    expect(out.results).toHaveLength(8);
  });
});

describe("web_search (T20) — missing key", () => {
  it("returns search_unavailable with no fetch call when TAVILY_API_KEY is unset", async () => {
    mockEnv.env.TAVILY_API_KEY = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const out = await webSearchTool.run({ query: "q" }, ctx);
    expect(out).toEqual({ error: "search_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("web_search (T20) — timeout", () => {
  it("retries once on a timeout, then degrades to search_unavailable", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const runPromise = webSearchTool.run({ query: "q" }, ctx);
    // Two sequential 5s timeouts (initial attempt + one retry).
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    const out = await runPromise;

    expect(out).toEqual({ error: "search_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("web_search (T20) — 5xx", () => {
  it("retries once on a 5xx; a persistent 5xx still degrades to search_unavailable", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, {}));
    vi.stubGlobal("fetch", fetchMock);

    const out = await webSearchTool.run({ query: "q" }, ctx);
    expect(out).toEqual({ error: "search_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);

    const out = await webSearchTool.run({ query: "q" }, ctx);
    expect(out).toEqual({ error: "search_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("web_search (T20) — malformed response", () => {
  it("degrades to search_unavailable when results is missing/not an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { nope: true })),
    );
    const out = await webSearchTool.run({ query: "q" }, ctx);
    expect(out).toEqual({ error: "search_unavailable" });
  });
});

describe("web_search (T20) — invalid input", () => {
  it("degrades to search_unavailable with no fetch call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await webSearchTool.run({}, ctx);
    expect(out).toEqual({ error: "search_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("web_search is the last tool in the barrel (append-only order)", () => {
  it("exposes `web_search` as the final ToolDef, appended after get_learnset (T17)", () => {
    expect(tools[tools.length - 1]?.name).toBe("web_search");
    expect(tools[16]?.name).toBe("get_learnset");
  });
});
