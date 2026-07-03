/**
 * T20 — `web_search`.
 *
 * Oak's first LIVE WEB tool, backed by the Tavily API. Every other tool reads
 * either the offline `@pkmn`/PokeAPI index or (T15 `get_usage_stats`) one fixed
 * community endpoint; this tool reaches the open web for facts that have no
 * data path at all — release dates, current events, live-service status,
 * "newest/current" questions. Read TAVILY_API_KEY at call time (validate-on-use,
 * the same pattern as the optional Anthropic/OpenAI keys) so a missing key
 * degrades the tool instead of failing boot. Never throws in-domain: a missing
 * key, a timeout, a non-OK response, or a malformed body all collapse to
 * `{ error: "search_unavailable" }` (mirrors get_usage_stats' upstream-miss
 * shape).
 */

import { env } from "@/env";
import type { ToolDef } from "@/agent/types";
import {
  webSearchInputSchema,
  toJsonSchema,
  type WebSearchOutput,
  type WebSearchResult,
} from "@/agent/schemas";

const TAVILY_URL = "https://api.tavily.com/search";
/** Per-request network timeout — this is a request-time call inside the loop. */
const REQUEST_TIMEOUT_MS = 5000;
const MAX_RESULTS = 8;

const description =
  "Search the live web. Use ONLY for time-sensitive facts Oak's own data can't " +
  "carry: release dates and announcements (e.g. upcoming games/DLC), current " +
  "events, live-service status (server maintenance, event availability), or " +
  "'newest/current/latest' questions where the answer changes over time. Do NOT " +
  "use it for anything answerable from Oak's own data — species/move/ability/" +
  "item lookups, battle math, type matchups, encounters, or competitive usage " +
  "all have dedicated tools that are faster and authoritative; prefer those. " +
  "Pass an optional recency window ('day'|'week'|'month'|'year') when freshness " +
  "matters. Results must be cited with their URL; treat them as unverified " +
  "third-party sources, not ground truth.";

/** recency -> Tavily's `days` lookback window. */
const RECENCY_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

interface TavilyRawResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  published_date?: unknown;
}

interface TavilyResponse {
  results?: unknown;
}

function isTavilyResponse(body: unknown): body is TavilyResponse {
  return typeof body === "object" && body !== null && "results" in body;
}

function toResult(raw: TavilyRawResult): WebSearchResult | null {
  if (typeof raw.title !== "string" || typeof raw.url !== "string") {
    return null;
  }
  const result: WebSearchResult = {
    title: raw.title,
    url: raw.url,
    snippet: typeof raw.content === "string" ? raw.content : "",
  };
  if (typeof raw.published_date === "string" && raw.published_date.length > 0) {
    result.published_at = raw.published_date;
  }
  return result;
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

async function fetchOnce(
  apiKey: string,
  query: string,
  days: number | undefined,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: MAX_RESULTS,
        ...(days !== undefined ? { days } : {}),
      }),
    });
    if (!res.ok) throw new HttpError(res.status);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/** One retry on a network failure or 5xx; never retries a caller abort or a 4xx. */
async function fetchWithRetry(
  apiKey: string,
  query: string,
  days: number | undefined,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  try {
    return await fetchOnce(apiKey, query, days, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
      throw err;
    }
    return await fetchOnce(apiKey, query, days, signal);
  }
}

export const webSearchTool: ToolDef = {
  name: "web_search",
  description,
  inputSchema: toJsonSchema(webSearchInputSchema),
  async run(args, ctx): Promise<WebSearchOutput> {
    const parsed = webSearchInputSchema.safeParse(args);
    if (!parsed.success) {
      return { error: "search_unavailable" };
    }

    // Validate-on-use: TAVILY_API_KEY is optional in the env schema (unlike
    // XAI_API_KEY), so importing `env` never throws at boot; a missing key just
    // degrades this tool.
    const apiKey = env.TAVILY_API_KEY;
    if (!apiKey) {
      return { error: "search_unavailable" };
    }

    const days = parsed.data.recency
      ? RECENCY_DAYS[parsed.data.recency]
      : undefined;

    try {
      const body = await fetchWithRetry(
        apiKey,
        parsed.data.query,
        days,
        ctx.signal,
      );
      if (!isTavilyResponse(body) || !Array.isArray(body.results)) {
        return { error: "search_unavailable" };
      }
      const results = body.results
        .map((r) => toResult(r as TavilyRawResult))
        .filter((r): r is WebSearchResult => r !== null)
        .slice(0, MAX_RESULTS);
      return { results };
    } catch {
      // Any transport/parse/timeout fault — never throw in-domain.
      return { error: "search_unavailable" };
    }
  },
};
