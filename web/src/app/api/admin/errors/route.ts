/**
 * `GET /api/admin/errors` — the failure-taxonomy view: counts and rates by
 * category over the resolved date range (admin-panel design.md § API Design
 * "GET /api/admin/errors → ErrorsResponse"; § Component Design §4; ADMIN-US-4,
 * ADMIN-AC-4.1/4.2, ADMIN-BR-8 date-range scoping, ADMIN-BR-9 failure taxonomy).
 *
 * Thin handler (the design's §4 shape): `requireAdminRequest` → parse the
 * window from query params → call `getErrorBreakdown` → `json(200, …)`. The
 * response wraps the repo's `ErrorBreakdownResult` with the resolved `range`
 * (echoing the applied defaults so the client can render the window; ADMIN-BR-8).
 *
 * Gating (the REAL boundary, ADMIN-AC-1.4): the guard runs FIRST and short-
 * circuits with `401 {code:"unauthorized"}` (no session) or
 * `403 {code:"forbidden"}` (signed-in non-admin) before any data is read — a
 * non-admin never receives admin data in any form (ADMIN-AC-1.2). Read-only:
 * every path here is a SELECT (ADMIN-BR-2).
 *
 * Param validation is LENIENT (design § API Design): bad/missing `from`/`to`/
 * `bucket` fall back to sensible defaults (last 7 days, `day` bucket) — never a
 * 500. `bucket` is irrelevant to the errors rollup but is carried on `Range`, so
 * it is parsed for shape parity with the other analytics routes.
 *
 * `runtime`/`dynamic` are pinned and the guard + repo are reached via DYNAMIC
 * import inside the handler so `next build`'s page-data collection never eagerly
 * evaluates the env/db-touching chain (CLAUDE.md "API ROUTES" rule; mirrors
 * `src/app/api/auth/me/route.ts` and `src/app/api/conversations/route.ts`).
 */

import { json } from "@/app/api/auth/_lib/http";
import type { BucketSize, ErrorsResponse, Range } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Default analytics window when `from`/`to` are absent (ADMIN-BR-8). */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Parse an epoch-ms query param, falling back on missing/invalid input. */
function parseEpochMs(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Resolve the half-open `[from, to)` window + bucket from query params,
 * leniently (design § API Design): unparseable/missing → defaults.
 */
function parseRange(url: URL): Range {
  const now = Date.now();
  const from = parseEpochMs(url.searchParams.get("from"), now - SEVEN_DAYS_MS);
  const to = parseEpochMs(url.searchParams.get("to"), now);
  const bucket: BucketSize =
    url.searchParams.get("bucket") === "hour" ? "hour" : "day";
  return { from, to, bucket };
}

export async function GET(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("@/app/api/admin/_lib/guard");
  const auth = await requireAdminRequest(req);
  if ("response" in auth) return auth.response;

  const { getErrorBreakdown } = await import(
    "@/data/repos/admin-analytics-repo"
  );

  const range = parseRange(new URL(req.url));
  const breakdown = await getErrorBreakdown(range);

  const body: ErrorsResponse = { ...breakdown, range };
  return json(200, body);
}
